import { getPool } from "../config/db";

/**
 * Error yang dilempar ketika SKU sudah digunakan (termasuk perbedaan kapitalisasi).
 */
export class SkuAlreadyExistsError extends Error {
  constructor() {
    super("SKU sudah digunakan.");
    this.name = "SkuAlreadyExistsError";
  }
}

/**
 * Representasi produk yang dikembalikan ke klien.
 */
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input pembuatan produk.
 */
export interface CreateProductInput {
  sku: string;
  name: string;
  description: string | null;
}

/**
 * Mengambil seluruh katalog produk.
 *
 * @returns Promise<Product[]> daftar produk yang tersimpan.
 * @throws Error jika query database gagal.
 */
export async function listProducts(): Promise<Product[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id::int AS id, sku, name, description, created_at, updated_at FROM products ORDER BY id ASC",
  );
  return rows as Product[];
}

/**
 * Membuat produk baru beserta baris inventory bersaldo nol dalam satu transaksi.
 *
 * Keunikan SKU ditegakkan oleh unique index database pada `lower(btrim(sku))`,
 * sehingga perbedaan kapitalisasi atau spasi dianggap SKU yang sama.
 *
 * @param input - Data produk yang sudah divalidasi dan di-trim.
 * @returns Promise<Product> produk yang berhasil dibuat.
 * @throws {SkuAlreadyExistsError} Jika SKU sudah digunakan.
 * @throws Error jika operasi database gagal.
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO products (sku, name, description)
         VALUES ($1, $2, $3)
         RETURNING id::int AS id, sku, name, description, created_at, updated_at`,
        [input.sku, input.name, input.description],
      );

      const product = rows[0] as Product;

      await client.query(
        "INSERT INTO inventory (product_id, quantity_on_hand) VALUES ($1, 0)",
        [product.id],
      );

      await client.query("COMMIT");
      return product;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new SkuAlreadyExistsError();
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Memeriksa apakah error PostgreSQL merupakan pelanggaran unique constraint.
 *
 * @param error - Error yang ditangkap dari query database.
 * @returns `true` jika error berkode `23505` (unique_violation).
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
