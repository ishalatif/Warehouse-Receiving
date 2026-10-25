import { readdir, readFile } from "fs/promises";
import path from "path";
import { getPool, closePool } from "../config/db";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");
const ADVISORY_LOCK_KEY = "warehouse_receiving_migrations";

/**
 * Menjalankan semua migration yang belum di-applied pada database.
 *
 * - Menggunakan advisory lock untuk mencegah migrasi berjalan bersamaan.
 * - Membaca tabel `schema_migrations` untuk menentukan migrasi yang sudah diterapkan.
 * - Setiap migrasi baru dijalankan pada transaksi database (BEGIN ... COMMIT)
 *   dengan rollback penuh pada kegagalan.
 * - Catat versi migrasi yang berhasil di-`schema_migrations`.
 *
 * @returns Promise void; proses keluar dengan exit code 0 saat semua migrasi berhasil.
 * @throws Error jika migrasi gagal (dipicu keluar dengan exit code 1).
 */
async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1)::bigint)", [ADVISORY_LOCK_KEY]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied = new Set<string>(rows.map((row) => row.version));

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort();

    for (const file of files) {
      const version = file.split("_")[0];
      if (applied.has(version)) {
        continue;
      }

      const migrationSql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(migrationSql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", [version]);
        await client.query("COMMIT");
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [ADVISORY_LOCK_KEY]);
    lockAcquired = false;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [ADVISORY_LOCK_KEY]);
      } catch {
        // Best-effort release advisory lock pada saat cleanup.
      }
    }
    client.release();
  }
}

runMigrations()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Migration failed");
    console.error(error instanceof Error ? error.message : error);
    try {
      await closePool();
    } catch {
      // Best-effort close pool pada saat error handling.
    }
    process.exit(1);
  });
