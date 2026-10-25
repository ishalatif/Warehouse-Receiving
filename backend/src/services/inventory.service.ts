import { getPool } from "../config/db";

/**
 * Saldo stok per produk sesuai skema `InventoryItem` pada OpenAPI.
 */
export interface InventoryItem {
  product_id: number;
  sku: string;
  product_name: string;
  quantity_on_hand: number;
  updated_at: Date;
}

/**
 * Entry ledger penerimaan sesuai skema `InventoryTransaction` pada OpenAPI.
 */
export interface InventoryTransaction {
  id: number;
  product_id: number;
  document_id: number;
  quantity_change: number;
  type: "RECEIPT_IN";
  created_at: Date;
}

/**
 * Mengambil saldo stok seluruh produk.
 *
 * @returns Promise<InventoryItem[]> saldo stok per produk, terurut berdasarkan ID produk.
 * @throws Error jika query database gagal.
 */
export async function listInventory(): Promise<InventoryItem[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.product_id::int AS product_id,
            p.sku,
            p.name AS product_name,
            i.quantity_on_hand::int AS quantity_on_hand,
            i.updated_at
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     ORDER BY i.product_id ASC`,
  );
  return rows as InventoryItem[];
}

/**
 * Mengambil riwayat transaksi stok (ledger) dari yang terbaru.
 *
 * @returns Promise<InventoryTransaction[]> daftar entry ledger penerimaan.
 * @throws Error jika query database gagal.
 */
export async function listInventoryTransactions(): Promise<InventoryTransaction[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id::int AS id,
            product_id::int AS product_id,
            document_id::int AS document_id,
            quantity_change,
            type,
            created_at
     FROM inventory_transactions
     ORDER BY created_at DESC, id DESC`,
  );
  return rows as InventoryTransaction[];
}
