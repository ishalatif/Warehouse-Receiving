import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../config/db";
import { createProduct } from "../services/product.service";
import {
  cancelReceivingDocument,
  createReceivingDocument,
  InvalidDocumentStatusError,
  OverReceivingExceededError,
  ProductNotInDocumentError,
  receiveDocumentItems,
  type ReceivingDocumentDetail,
} from "../services/receiving-document.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "receiving workflow (integration, disposable database)",
  () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const docPrefix = `DOC-RCV-IT-${suffix}`;
    const skuPrefix = `sku-rcv-it-${suffix}`;
    let operatorId: number;
    let productAId: number;
    let productBId: number;
    let productForeignId: number;

    /**
     * Membuat dokumen uji dengan nomor unik.
     *
     * @param label - Label unik untuk nomor dokumen.
     * @param items - Item dokumen yang akan dibuat.
     * @returns Detail dokumen yang dibuat.
     */
    const createDocument = (
      label: string,
      items: Array<{ product_id: number; expected_quantity: number }>,
    ): Promise<ReceivingDocumentDetail> =>
      createReceivingDocument(
        { document_number: `${docPrefix}-${label}`, items },
        operatorId,
      );

    /**
     * Mengambil saldo inventory untuk satu produk.
     *
     * @param productId - ID produk.
     * @returns Saldo stok saat ini.
     */
    const inventoryOf = async (productId: number): Promise<number> => {
      const { rows } = await getPool().query(
        "SELECT quantity_on_hand::int AS quantity FROM inventory WHERE product_id = $1",
        [productId],
      );
      return rows[0]?.quantity ?? 0;
    };

    /**
     * Mengambil jumlah ledger entry untuk satu dokumen.
     *
     * @param documentId - ID dokumen.
     * @returns Jumlah entry ledger.
     */
    const ledgerCountOf = async (documentId: number): Promise<number> => {
      const { rows } = await getPool().query(
        "SELECT COUNT(*)::int AS count FROM inventory_transactions WHERE document_id = $1",
        [documentId],
      );
      return rows[0].count;
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      process.env.JWT_SECRET = "test-jwt-secret-for-receiving";

      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'OPERATOR')
         RETURNING id::int AS id`,
        [`rcv-it-${suffix}@example.test`, "not-a-real-hash"],
      );
      operatorId = rows[0].id;

      const productA = await createProduct({
        sku: `${skuPrefix}-A`,
        name: "Produk Terima A",
        description: null,
      });
      const productB = await createProduct({
        sku: `${skuPrefix}-B`,
        name: "Produk Terima B",
        description: null,
      });
      const productForeign = await createProduct({
        sku: `${skuPrefix}-C`,
        name: "Produk di Luar Dokumen",
        description: null,
      });
      productAId = productA.id;
      productBId = productB.id;
      productForeignId = productForeign.id;
    });

    afterAll(async () => {
      const pool = getPool();
      await pool.query(
        `DELETE FROM inventory_transactions
         WHERE document_id IN (SELECT id FROM receiving_documents WHERE document_number LIKE $1)`,
        [`${docPrefix}%`],
      );
      await pool.query("DELETE FROM receiving_documents WHERE document_number LIKE $1", [
        `${docPrefix}%`,
      ]);
      await pool.query(
        "DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE lower(btrim(sku)) LIKE $1)",
        [`${skuPrefix}%`],
      );
      await pool.query("DELETE FROM products WHERE lower(btrim(sku)) LIKE $1", [`${skuPrefix}%`]);
      await pool.query("DELETE FROM users WHERE email = $1", [`rcv-it-${suffix}@example.test`]);
      await closePool();
    });

    it("menerima sebagian lalu menyelesaikan seluruh item", async () => {
      const inventoryBeforeA = await inventoryOf(productAId);
      const inventoryBeforeB = await inventoryOf(productBId);

      const document = await createDocument("PARTIAL", [
        { product_id: productAId, expected_quantity: 5 },
        { product_id: productBId, expected_quantity: 3 },
      ]);

      const partial = await receiveDocumentItems(document.id, [
        { product_id: productAId, quantity_received: 2 },
        { product_id: productBId, quantity_received: 3 },
      ]);

      expect(partial.status).toBe("IN_PROGRESS");
      expect(partial.items).toEqual([
        expect.objectContaining({ product_id: productAId, received_quantity: 2 }),
        expect.objectContaining({ product_id: productBId, received_quantity: 3 }),
      ]);
      expect(await inventoryOf(productAId)).toBe(inventoryBeforeA + 2);
      expect(await inventoryOf(productBId)).toBe(inventoryBeforeB + 3);
      expect(await ledgerCountOf(document.id)).toBe(2);

      const completed = await receiveDocumentItems(document.id, [
        { product_id: productAId, quantity_received: 3 },
      ]);

      expect(completed.status).toBe("COMPLETED");
      expect(completed.items[0].received_quantity).toBe(5);
      expect(await inventoryOf(productAId)).toBe(inventoryBeforeA + 5);
      expect(await ledgerCountOf(document.id)).toBe(3);
    });

    it("menandai COMPLETED ketika seluruh item terpenuhi dalam satu request", async () => {
      const inventoryBeforeA = await inventoryOf(productAId);
      const document = await createDocument("FULL", [
        { product_id: productAId, expected_quantity: 4 },
      ]);

      const completed = await receiveDocumentItems(document.id, [
        { product_id: productAId, quantity_received: 4 },
      ]);

      expect(completed.status).toBe("COMPLETED");
      expect(await inventoryOf(productAId)).toBe(inventoryBeforeA + 4);
      expect(await ledgerCountOf(document.id)).toBe(1);
    });

    it("me-rollback seluruh penerimaan ketika salah satu item over-receiving", async () => {
      const document = await createDocument("OVER", [
        { product_id: productAId, expected_quantity: 5 },
        { product_id: productBId, expected_quantity: 3 },
      ]);

      const inventoryBeforeA = await inventoryOf(productAId);
      const inventoryBeforeB = await inventoryOf(productBId);

      await expect(
        receiveDocumentItems(document.id, [
          { product_id: productAId, quantity_received: 3 },
          { product_id: productBId, quantity_received: 4 },
        ]),
      ).rejects.toBeInstanceOf(OverReceivingExceededError);

      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT status,
                (SELECT COUNT(*)::int FROM receiving_items WHERE document_id = $1) AS item_count,
                (SELECT SUM(received_quantity)::int FROM receiving_items WHERE document_id = $1) AS received_total
         FROM receiving_documents WHERE id = $1`,
        [document.id],
      );

      expect(rows[0].status).toBe("DRAFT");
      expect(rows[0].received_total).toBe(0);
      expect(await inventoryOf(productAId)).toBe(inventoryBeforeA);
      expect(await inventoryOf(productBId)).toBe(inventoryBeforeB);
      expect(await ledgerCountOf(document.id)).toBe(0);
    });

    it("menolak penerimaan pada dokumen CANCELLED dan COMPLETED", async () => {
      const cancelled = await createDocument("CANCELLED", [
        { product_id: productAId, expected_quantity: 2 },
      ]);
      await cancelReceivingDocument(cancelled.id);

      await expect(
        receiveDocumentItems(cancelled.id, [
          { product_id: productAId, quantity_received: 1 },
        ]),
      ).rejects.toBeInstanceOf(InvalidDocumentStatusError);

      const completed = await createDocument("CLOSED", [
        { product_id: productBId, expected_quantity: 1 },
      ]);
      await receiveDocumentItems(completed.id, [
        { product_id: productBId, quantity_received: 1 },
      ]);

      await expect(
        receiveDocumentItems(completed.id, [
          { product_id: productBId, quantity_received: 1 },
        ]),
      ).rejects.toBeInstanceOf(InvalidDocumentStatusError);
    });

    it("menolak produk asing dan produk duplikat tanpa mengubah data", async () => {
      const document = await createDocument("FOREIGN", [
        { product_id: productAId, expected_quantity: 5 },
      ]);

      await expect(
        receiveDocumentItems(document.id, [
          { product_id: productAId, quantity_received: 2 },
          { product_id: productForeignId, quantity_received: 1 },
        ]),
      ).rejects.toBeInstanceOf(ProductNotInDocumentError);

      await expect(
        receiveDocumentItems(document.id, [
          { product_id: productAId, quantity_received: 1 },
          { product_id: productAId, quantity_received: 2 },
        ]),
      ).rejects.toThrow("tidak boleh muncul lebih dari sekali");

      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT d.status, SUM(i.received_quantity)::int AS received_total
         FROM receiving_documents d
         JOIN receiving_items i ON i.document_id = d.id
         WHERE d.id = $1
         GROUP BY d.status`,
        [document.id],
      );

      expect(rows[0].status).toBe("DRAFT");
      expect(rows[0].received_total).toBe(0);
      expect(await ledgerCountOf(document.id)).toBe(0);
    });

    it("menjaga konsistensi ketika dua request penerimaan berjalan paralel", async () => {
      const inventoryBeforeA = await inventoryOf(productAId);
      const document = await createDocument("PARALLEL", [
        { product_id: productAId, expected_quantity: 10 },
      ]);

      const results = await Promise.allSettled([
        receiveDocumentItems(document.id, [{ product_id: productAId, quantity_received: 6 }]),
        receiveDocumentItems(document.id, [{ product_id: productAId, quantity_received: 6 }]),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OverReceivingExceededError);

      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT d.status, i.received_quantity
         FROM receiving_documents d
         JOIN receiving_items i ON i.document_id = d.id
         WHERE d.id = $1`,
        [document.id],
      );

      expect(rows[0].status).toBe("IN_PROGRESS");
      expect(rows[0].received_quantity).toBe(6);
      expect(await inventoryOf(productAId)).toBe(inventoryBeforeA + 6);
      expect(await ledgerCountOf(document.id)).toBe(1);
    });
  },
);
