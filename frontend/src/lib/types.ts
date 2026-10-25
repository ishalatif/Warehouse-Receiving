/**
 * Tipe data bersama yang mencerminkan kontrak OpenAPI backend.
 */

export type Role = "OPERATOR" | "SUPERVISOR";

/**
 * Data user yang dikembalikan endpoint login.
 */
export interface User {
  id: number;
  email: string;
  role: Role;
}

/**
 * Sesi lokal: token JWT dan data user.
 */
export interface Session {
  token: string;
  user: User;
}

/**
 * Produk pada katalog.
 */
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Status dokumen penerimaan.
 */
export type DocumentStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/**
 * Ringkasan dokumen penerimaan.
 */
export interface ReceivingDocument {
  id: number;
  document_number: string;
  status: DocumentStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/**
 * Item dokumen beserta progres penerimaan.
 */
export interface ReceivingDocumentItem {
  product_id: number;
  sku: string;
  product_name: string;
  expected_quantity: number;
  received_quantity: number;
}

/**
 * Detail dokumen beserta seluruh itemnya.
 */
export interface ReceivingDocumentDetail extends ReceivingDocument {
  items: ReceivingDocumentItem[];
}

/**
 * Saldo stok per produk.
 */
export interface InventoryItem {
  product_id: number;
  sku: string;
  product_name: string;
  quantity_on_hand: number;
  updated_at: string;
}

/**
 * Entry ledger penerimaan.
 */
export interface InventoryTransaction {
  id: number;
  product_id: number;
  document_id: number;
  quantity_change: number;
  type: "RECEIPT_IN";
  created_at: string;
}
