import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../config/db";
import { createProduct } from "../services/product.service";
import {
  cancelReceivingDocument,
  createReceivingDocument,
  DocumentNotFoundError,
  DocumentNumberAlreadyExistsError,
  DuplicateProductError,
  getReceivingDocument,
  InvalidDocumentStatusError,
  ProductNotFoundError,
} from "../services/receiving-document.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "receiving document service (integration, disposable database)",
  () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const docPrefix = `DOC-IT-${suffix}`;
    const skuPrefix = `sku-doc-it-${suffix}`;
    let userId: number;
    let productAId: number;
    let productBId: number;

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      process.env.JWT_SECRET = "test-jwt-secret-for-documents";

      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'SUPERVISOR')
         RETURNING id::int AS id`,
        [`doc-it-${suffix}@example.test`, "not-a-real-hash"],
      );
      userId = rows[0].id;

      const productA = await createProduct({
        sku: `${skuPrefix}-A`,
        name: "Produk Dokumen A",
        description: null,
      });
      const productB = await createProduct({
        sku: `${skuPrefix}-B`,
        name: "Produk Dokumen B",
        description: null,
      });
      productAId = productA.id;
      productBId = productB.id;
    });

    afterAll(async () => {
      const pool = getPool();
      await pool.query("DELETE FROM receiving_documents WHERE document_number LIKE $1", [
        `${docPrefix}%`,
      ]);
      await pool.query(
        "DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE lower(btrim(sku)) LIKE $1)",
        [`${skuPrefix}%`],
      );
      await pool.query("DELETE FROM products WHERE lower(btrim(sku)) LIKE $1", [`${skuPrefix}%`]);
      await pool.query("DELETE FROM users WHERE email = $1", [`doc-it-${suffix}@example.test`]);
      await closePool();
    });

    it("membuat dokumen DRAFT dengan item nol dan tidak mengubah stok", async () => {
      const document = await createReceivingDocument(
        {
          document_number: `${docPrefix}-CREATE`,
          items: [
            { product_id: productAId, expected_quantity: 5 },
            { product_id: productBId, expected_quantity: 3 },
          ],
        },
        userId,
      );

      expect(document.status).toBe("DRAFT");
      expect(document.created_by).toBe(userId);
      expect(document.items).toHaveLength(2);
      expect(document.items[0]).toEqual(
        expect.objectContaining({
          product_id: productAId,
          sku: `${skuPrefix}-A`,
          expected_quantity: 5,
          received_quantity: 0,
        }),
      );

      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT quantity_on_hand::int AS quantity FROM inventory WHERE product_id = $1",
        [productAId],
      );
      expect(rows[0].quantity).toBe(0);
    });

    it("menolak nomor dokumen duplikat tanpa membuat dokumen kedua", async () => {
      const documentNumber = `${docPrefix}-DUP`;

      await createReceivingDocument(
        { document_number: documentNumber, items: [{ product_id: productAId, expected_quantity: 1 }] },
        userId,
      );

      await expect(
        createReceivingDocument(
          {
            document_number: documentNumber,
            items: [{ product_id: productBId, expected_quantity: 2 }],
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(DocumentNumberAlreadyExistsError);

      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM receiving_documents WHERE document_number = $1",
        [documentNumber],
      );
      expect(rows[0].count).toBe(1);
    });

    it("me-rollback dokumen ketika produk tidak ditemukan", async () => {
      const documentNumber = `${docPrefix}-MISSING`;

      await expect(
        createReceivingDocument(
          {
            document_number: documentNumber,
            items: [{ product_id: productAId, expected_quantity: 1 }, { product_id: 2147483000, expected_quantity: 2 }],
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(ProductNotFoundError);

      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM receiving_documents WHERE document_number = $1",
        [documentNumber],
      );
      expect(rows[0].count).toBe(0);
    });

    it("menolak produk duplikat di dalam satu dokumen", async () => {
      await expect(
        createReceivingDocument(
          {
            document_number: `${docPrefix}-DUPPRODUCT`,
            items: [
              { product_id: productAId, expected_quantity: 1 },
              { product_id: productAId, expected_quantity: 2 },
            ],
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(DuplicateProductError);
    });

    it("membatalkan dokumen DRAFT dan menyimpan status CANCELLED", async () => {
      const document = await createReceivingDocument(
        {
          document_number: `${docPrefix}-CANCEL`,
          items: [{ product_id: productAId, expected_quantity: 4 }],
        },
        userId,
      );

      const cancelled = await cancelReceivingDocument(document.id);
      expect(cancelled.status).toBe("CANCELLED");

      const reloaded = await getReceivingDocument(document.id);
      expect(reloaded?.status).toBe("CANCELLED");
    });

    it("menolak pembatalan dokumen yang bukan DRAFT", async () => {
      const document = await createReceivingDocument(
        {
          document_number: `${docPrefix}-NODRAFT`,
          items: [{ product_id: productBId, expected_quantity: 2 }],
        },
        userId,
      );

      const pool = getPool();
      await pool.query("UPDATE receiving_documents SET status = 'IN_PROGRESS' WHERE id = $1", [
        document.id,
      ]);

      await expect(cancelReceivingDocument(document.id)).rejects.toBeInstanceOf(
        InvalidDocumentStatusError,
      );

      const reloaded = await getReceivingDocument(document.id);
      expect(reloaded?.status).toBe("IN_PROGRESS");
    });

    it("mengembalikan error ketika dokumen tidak ditemukan", async () => {
      expect(await getReceivingDocument(2147483000)).toBeNull();
      await expect(cancelReceivingDocument(2147483000)).rejects.toBeInstanceOf(
        DocumentNotFoundError,
      );
    });
  },
);
