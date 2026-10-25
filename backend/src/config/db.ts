import { Pool } from "pg";
import { getEnv } from "./env";

let pool: Pool | undefined;

/**
 * Menangani error tak terduga pada koneksi idle pool.
 *
 * Tanpa listener ini, error seperti pemutusan koneksi oleh PostgreSQL akan
 * menjadi `Unhandled 'error' event` dan mematikan proses backend. Readiness
 * tetap dilaporkan gagal oleh endpoint health selama database tidak tersedia.
 *
 * @param error - Error dari pool; detail internal tidak dicetak ke klien.
 * @returns void
 */
function handlePoolError(error: Error): void {
  console.error("Database pool error:", error.message);
}

/**
 * Mendapatkan singleton connection pool database PostgreSQL.
 *
 * Pool dibuat lazily hanya saat pertama kali diperlukan dan mengacu pada
 * `DATABASE_URL` dari environment yang telah tervalidasi.
 *
 * @returns Instance `Pool` PostgreSQL.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL });
    pool.on("error", handlePoolError);
  }
  return pool;
}

/**
 * Menutup connection pool database.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
