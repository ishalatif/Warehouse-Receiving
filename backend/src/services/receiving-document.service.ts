import { getPool } from "../config/db";

/**
 * Status dokumen penerimaan sesuai enum `doc_status` pada database.
 */
export type DocumentStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/**
 * Representasi ringkas dokumen penerimaan.
 */
export interface ReceivingDocument {
  id: number;
  document_number: string;
  status: DocumentStatus;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Baris item dokumen penerimaan beserta informasi produknya.
 */
export interface ReceivingDocumentItem {
  product_id: number;
  sku: string;
  product_name: string;
  expected_quantity: number;
  received_quantity: number;
}

/**
 * Detail dokumen penerimaan beserta seluruh itemnya.
 */
export interface ReceivingDocumentDetail extends ReceivingDocument {
  items: ReceivingDocumentItem[];
}

/**
 * Input pembuatan dokumen penerimaan (sudah divalidasi oleh controller).
 */
export interface CreateReceivingDocumentInput {
  document_number: string;
  items: Array<{ product_id: number; expected_quantity: number }>;
}

/**
 * Input satu item pada pencatatan penerimaan (sudah divalidasi oleh controller).
 */
export interface ReceiveItemInput {
  product_id: number;
  quantity_received: number;
}

/**
 * Error ketika nomor dokumen sudah digunakan.
 */
export class DocumentNumberAlreadyExistsError extends Error {
  constructor() {
    super("Nomor dokumen sudah digunakan.");
    this.name = "DocumentNumberAlreadyExistsError";
  }
}

/**
 * Error ketika satu atau lebih produk pada payload tidak ditemukan.
 */
export class ProductNotFoundError extends Error {
  constructor() {
    super("Produk tidak ditemukan.");
    this.name = "ProductNotFoundError";
  }
}

/**
 * Error ketika produk yang sama muncul lebih dari sekali dalam satu dokumen.
 */
export class DuplicateProductError extends Error {
  constructor() {
    super("Produk tidak boleh muncul lebih dari sekali dalam satu dokumen.");
    this.name = "DuplicateProductError";
  }
}

/**
 * Error ketika dokumen tidak ditemukan.
 */
export class DocumentNotFoundError extends Error {
  constructor() {
    super("Dokumen tidak ditemukan.");
    this.name = "DocumentNotFoundError";
  }
}

/**
 * Error ketika operasi tidak diizinkan oleh status dokumen saat ini.
 */
export class InvalidDocumentStatusError extends Error {
  constructor(message = "Status dokumen tidak mengizinkan operasi ini.") {
    super(message);
    this.name = "InvalidDocumentStatusError";
  }
}

/**
 * Error ketika produk pada payload penerimaan bukan bagian dari dokumen.
 */
export class ProductNotInDocumentError extends Error {
  constructor() {
    super("Produk bukan bagian dari dokumen.");
    this.name = "ProductNotInDocumentError";
  }
}

/**
 * Error ketika kuantitas penerimaan melebihi sisa kuantitas harapan.
 */
export class OverReceivingExceededError extends Error {
  constructor() {
    super("Kuantitas penerimaan melebihi sisa kuantitas harapan.");
    this.name = "OverReceivingExceededError";
  }
}

/**
 * Kolom ringkas dokumen yang dipakai seluruh query dokumen.
 */
const DOCUMENT_COLUMNS = `
  id::int AS id,
  document_number,
  status,
  created_by::int AS created_by,
  created_at,
  updated_at
`;

/**
 * Mengambil seluruh dokumen penerimaan, terbaru lebih dahulu.
 *
 * @returns Promise<ReceivingDocument[]> daftar dokumen penerimaan.
 * @throws Error jika query database gagal.
 */
export async function listReceivingDocuments(): Promise<ReceivingDocument[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM receiving_documents
     ORDER BY created_at DESC, id DESC`,
  );
  return rows as ReceivingDocument[];
}

/**
 * Mengambil detail satu dokumen beserta item dan informasi produknya.
 *
 * @param id - ID dokumen penerimaan.
 * @returns Promise<ReceivingDocumentDetail | null> detail dokumen, atau `null` jika tidak ada.
 * @throws Error jika query database gagal.
 */
export async function getReceivingDocument(id: number): Promise<ReceivingDocumentDetail | null> {
  const pool = getPool();
  return loadDocumentDetail(pool, id);
}

/**
 * Membuat dokumen penerimaan baru berstatus `DRAFT` beserta itemnya.
 *
 * Seluruh penulisan dilakukan dalam satu transaksi dan tidak mengubah stok
 * maupun ledger. Produk divalidasi terlebih dahulu agar kegagalan tidak
 * meninggalkan dokumen parsial.
 *
 * @param input - Nomor dokumen dan item yang sudah divalidasi.
 * @param createdBy - ID user (Supervisor) yang membuat dokumen.
 * @returns Promise<ReceivingDocumentDetail> detail dokumen yang dibuat.
 * @throws {DocumentNumberAlreadyExistsError} Jika nomor dokumen sudah digunakan.
 * @throws {ProductNotFoundError} Jika ada produk yang tidak ditemukan.
 * @throws {DuplicateProductError} Jika ada produk duplikat dalam payload.
 * @throws Error jika operasi database gagal.
 */
export async function createReceivingDocument(
  input: CreateReceivingDocumentInput,
  createdBy: number,
): Promise<ReceivingDocumentDetail> {
  const productIds = input.items.map((item) => item.product_id);
  if (new Set(productIds).size !== productIds.length) {
    throw new DuplicateProductError();
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    try {
      const { rows: existingProducts } = await client.query(
        "SELECT id::int AS id FROM products WHERE id = ANY($1::bigint[])",
        [productIds],
      );
      const foundIds = new Set(
        (existingProducts as Array<{ id: number }>).map((product) => product.id),
      );
      if (productIds.some((productId) => !foundIds.has(productId))) {
        throw new ProductNotFoundError();
      }

      const { rows } = await client.query(
        `INSERT INTO receiving_documents (document_number, status, created_by)
         VALUES ($1, 'DRAFT', $2)
         RETURNING ${DOCUMENT_COLUMNS}`,
        [input.document_number, createdBy],
      );
      const document = rows[0] as ReceivingDocument;

      for (const item of input.items) {
        await client.query(
          `INSERT INTO receiving_items (document_id, product_id, expected_quantity)
           VALUES ($1, $2, $3)`,
          [document.id, item.product_id, item.expected_quantity],
        );
      }

      const detail = await loadDocumentDetail(client, document.id);
      await client.query("COMMIT");

      if (!detail) {
        throw new DocumentNotFoundError();
      }
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error, "document_number")) {
        throw new DocumentNumberAlreadyExistsError();
      }
      if (isUniqueViolation(error, "uq_receiving_document_product")) {
        throw new DuplicateProductError();
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Membatalkan dokumen penerimaan yang masih berstatus `DRAFT`.
 *
 * Dokumen dikunci dengan `SELECT ... FOR UPDATE` agar pembatalan tidak
 * berjalan bersamaan dengan perubahan status lain.
 *
 * @param id - ID dokumen penerimaan.
 * @returns Promise<ReceivingDocumentDetail> detail dokumen setelah dibatalkan.
 * @throws {DocumentNotFoundError} Jika dokumen tidak ditemukan.
 * @throws {InvalidDocumentStatusError} Jika status dokumen bukan `DRAFT`.
 * @throws Error jika operasi database gagal.
 */
export async function cancelReceivingDocument(id: number): Promise<ReceivingDocumentDetail> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `SELECT id::int AS id, status
         FROM receiving_documents
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const document = rows[0] as { id: number; status: DocumentStatus } | undefined;

      if (!document) {
        throw new DocumentNotFoundError();
      }
      if (document.status !== "DRAFT") {
        throw new InvalidDocumentStatusError("Hanya dokumen DRAFT yang dapat dibatalkan.");
      }

      await client.query(
        `UPDATE receiving_documents
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id],
      );

      const detail = await loadDocumentDetail(client, id);
      await client.query("COMMIT");

      if (!detail) {
        throw new DocumentNotFoundError();
      }
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Mencatat penerimaan barang untuk satu atau lebih item dokumen secara atomik.
 *
 * Seluruh langkah berjalan dalam satu transaksi: dokumen dikunci dengan
 * `SELECT ... FOR UPDATE`, seluruh item dokumen dikunci dengan urutan ID yang
 * konsisten, semua kuantitas divalidasi sebelum penulisan, lalu received
 * quantity, inventory, ledger, dan status dokumen diperbarui bersama. Error
 * apa pun me-rollback seluruh perubahan. Tidak ada retry otomatis.
 *
 * @param id - ID dokumen penerimaan.
 * @param items - Item yang diterima (produk unik, kuantitas positif).
 * @returns Promise<ReceivingDocumentDetail> detail dokumen setelah commit.
 * @throws {DocumentNotFoundError} Jika dokumen tidak ditemukan.
 * @throws {InvalidDocumentStatusError} Jika status dokumen bukan `DRAFT`/`IN_PROGRESS`.
 * @throws {DuplicateProductError} Jika produk duplikat dalam payload.
 * @throws {ProductNotInDocumentError} Jika produk bukan bagian dari dokumen.
 * @throws {OverReceivingExceededError} Jika kuantitas melebihi sisa harapan.
 * @throws Error jika operasi database gagal.
 */
export async function receiveDocumentItems(
  id: number,
  items: ReceiveItemInput[],
): Promise<ReceivingDocumentDetail> {
  const productIds = items.map((item) => item.product_id);
  if (new Set(productIds).size !== productIds.length) {
    throw new DuplicateProductError();
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    try {
      const { rows: documentRows } = await client.query(
        `SELECT id::int AS id, status
         FROM receiving_documents
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const document = documentRows[0] as { id: number; status: DocumentStatus } | undefined;

      if (!document) {
        throw new DocumentNotFoundError();
      }
      if (document.status !== "DRAFT" && document.status !== "IN_PROGRESS") {
        throw new InvalidDocumentStatusError(
          "Dokumen tidak menerima penerimaan pada status saat ini.",
        );
      }

      const { rows: itemRows } = await client.query(
        `SELECT id::int AS id,
                product_id::int AS product_id,
                expected_quantity,
                received_quantity
         FROM receiving_items
         WHERE document_id = $1
         ORDER BY id ASC
         FOR UPDATE`,
        [id],
      );
      const lockedItems = itemRows as Array<{
        id: number;
        product_id: number;
        expected_quantity: number;
        received_quantity: number;
      }>;
      const itemByProductId = new Map(lockedItems.map((item) => [item.product_id, item]));

      // Validasi seluruh item sebelum menulis apa pun.
      const plan: Array<{
        item: (typeof lockedItems)[number];
        quantity: number;
      }> = [];
      for (const input of items) {
        const item = itemByProductId.get(input.product_id);
        if (!item) {
          throw new ProductNotInDocumentError();
        }
        if (item.received_quantity + input.quantity_received > item.expected_quantity) {
          throw new OverReceivingExceededError();
        }
        plan.push({ item, quantity: input.quantity_received });
      }

      for (const { item, quantity } of plan) {
        await client.query(
          `UPDATE receiving_items
           SET received_quantity = received_quantity + $2
           WHERE id = $1`,
          [item.id, quantity],
        );

        await client.query(
          `INSERT INTO inventory (product_id, quantity_on_hand)
           VALUES ($1, $2)
           ON CONFLICT (product_id) DO UPDATE
           SET quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
               updated_at = CURRENT_TIMESTAMP`,
          [item.product_id, quantity],
        );

        await client.query(
          `INSERT INTO inventory_transactions (product_id, document_id, quantity_change, type)
           VALUES ($1, $2, $3, 'RECEIPT_IN')`,
          [item.product_id, id, quantity],
        );
      }

      const { rows: allItemRows } = await client.query(
        `SELECT expected_quantity, received_quantity
         FROM receiving_items
         WHERE document_id = $1`,
        [id],
      );
      const isComplete = (
        allItemRows as Array<{ expected_quantity: number; received_quantity: number }>
      ).every((item) => item.received_quantity >= item.expected_quantity);
      const nextStatus: DocumentStatus = isComplete ? "COMPLETED" : "IN_PROGRESS";

      await client.query(
        `UPDATE receiving_documents
         SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, nextStatus],
      );

      const detail = await loadDocumentDetail(client, id);
      await client.query("COMMIT");

      if (!detail) {
        throw new DocumentNotFoundError();
      }
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Query minimal yang dibutuhkan `loadDocumentDetail` (pool maupun client transaksi).
 */
interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Memuat dokumen beserta itemnya menggunakan koneksi yang diberikan.
 *
 * @param db - Pool atau client transaksi yang akan menjalankan query.
 * @param id - ID dokumen penerimaan.
 * @returns Promise<ReceivingDocumentDetail | null> detail dokumen atau `null` jika tidak ada.
 * @throws Error jika query database gagal.
 */
async function loadDocumentDetail(
  db: Queryable,
  id: number,
): Promise<ReceivingDocumentDetail | null> {
  const { rows } = await db.query(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM receiving_documents
     WHERE id = $1`,
    [id],
  );
  const document = rows[0] as ReceivingDocument | undefined;
  if (!document) {
    return null;
  }

  const { rows: itemRows } = await db.query(
    `SELECT ri.product_id::int AS product_id,
            p.sku,
            p.name AS product_name,
            ri.expected_quantity,
            ri.received_quantity
     FROM receiving_items ri
     JOIN products p ON p.id = ri.product_id
     WHERE ri.document_id = $1
     ORDER BY ri.id ASC`,
    [id],
  );

  return { ...document, items: itemRows as ReceivingDocumentItem[] };
}

/**
 * Memeriksa apakah error PostgreSQL merupakan pelanggaran unique constraint
 * pada constraint tertentu.
 *
 * @param error - Error yang ditangkap dari query database.
 * @param constraintName - Potongan nama constraint yang diharapkan.
 * @returns `true` jika error berkode `23505` dan constraint cocok.
 */
function isUniqueViolation(error: unknown, constraintName: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const typedError = error as { code?: string; constraint?: string };
  return (
    typedError.code === "23505" &&
    typeof typedError.constraint === "string" &&
    typedError.constraint.includes(constraintName)
  );
}
