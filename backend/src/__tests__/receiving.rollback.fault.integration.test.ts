import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../config/db";
import { createProduct } from "../services/product.service";
import {
  createReceivingDocument,
  receiveDocumentItems,
  type ReceivingDocumentDetail,
} from "../services/receiving-document.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const LEDGER_FUNCTION = "wrs_tc17_fail_ledger";
const LEDGER_TRIGGER = "wrs_tc17_fail_ledger_trg";
const STATUS_FUNCTION = "wrs_tc17_fail_status";
const STATUS_TRIGGER = "wrs_tc17_fail_status_trg";

describe.skipIf(!TEST_DATABASE_URL)(
  "receiving rollback on forced write failure (integration, disposable database)",
  () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const docPrefix = `DOC-FAULT-IT-${suffix}`;
    const skuPrefix = `sku-fault-it-${suffix}`;
    let userId: number;
    let productAId: number;
    let productBId: number;

    /**
     * Membuat dokumen uji dengan nomor unik.
     *
     * @param label - Label unik untuk nomor dokumen.
     * @param productId - Produk yang masuk ke dokumen.
     * @param expectedQuantity - Kuantitas harapan.
     * @returns Detail dokumen yang dibuat.
     */
    const createDocument = (
      label: string,
      productId: number,
      expectedQuantity: number,
    ): Promise<ReceivingDocumentDetail> =>
      createReceivingDocument(
        {
          document_number: `${docPrefix}-${label}`,
          items: [{ product_id: productId, expected_quantity: expectedQuantity }],
        },
        userId,
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
     * Mengambil received quantity satu item dokumen.
     *
     * @param documentId - ID dokumen.
     * @param productId - ID produk.
     * @returns Kuantitas yang sudah diterima.
     */
    const receivedOf = async (documentId: number, productId: number): Promise<number> => {
      const { rows } = await getPool().query(
        `SELECT received_quantity
         FROM receiving_items
         WHERE document_id = $1 AND product_id = $2`,
        [documentId, productId],
      );
      return rows[0]?.received_quantity ?? 0;
    };

    /**
     * Mengambil jumlah ledger dan total kuantitas untuk satu dokumen.
     *
     * @param documentId - ID dokumen.
     * @returns Jumlah entry dan total quantity_change.
     */
    const ledgerOf = async (
      documentId: number,
    ): Promise<{ count: number; total: number }> => {
      const { rows } = await getPool().query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(quantity_change), 0)::int AS total
         FROM inventory_transactions
         WHERE document_id = $1`,
        [documentId],
      );
      return rows[0];
    };

    /**
     * Mengambil status dokumen.
     *
     * @param documentId - ID dokumen.
     * @returns Status dokumen saat ini.
     */
    const statusOf = async (documentId: number): Promise<string> => {
      const { rows } = await getPool().query(
        "SELECT status FROM receiving_documents WHERE id = $1",
        [documentId],
      );
      return rows[0].status;
    };

    /**
     * Memasang trigger yang menggagalkan insert ledger untuk satu dokumen.
     *
     * Trigger dibatasi pada `document_id` tertentu agar test lain yang berjalan
     * paralel pada database yang sama tidak terpengaruh.
     *
     * @param documentId - Dokumen yang insert ledger-nya harus gagal.
     * @returns Promise<void>
     */
    const installLedgerFailure = async (documentId: number): Promise<void> => {
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        throw new Error("documentId tidak valid untuk trigger uji.");
      }
      await getPool().query(`
        CREATE OR REPLACE FUNCTION ${LEDGER_FUNCTION}() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.document_id = ${documentId} THEN
            RAISE EXCEPTION 'injected ledger failure for document %', NEW.document_id;
          END IF;
          RETURN NEW;
        END;
        $$;
        DROP TRIGGER IF EXISTS ${LEDGER_TRIGGER} ON inventory_transactions;
        CREATE TRIGGER ${LEDGER_TRIGGER}
        BEFORE INSERT ON inventory_transactions
        FOR EACH ROW EXECUTE FUNCTION ${LEDGER_FUNCTION}();
      `);
    };

    /**
     * Memasang trigger yang menggagalkan perubahan status untuk satu dokumen.
     *
     * @param documentId - Dokumen yang update status-nya harus gagal.
     * @returns Promise<void>
     */
    const installStatusFailure = async (documentId: number): Promise<void> => {
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        throw new Error("documentId tidak valid untuk trigger uji.");
      }
      await getPool().query(`
        CREATE OR REPLACE FUNCTION ${STATUS_FUNCTION}() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.id = ${documentId} AND NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'injected status failure for document %', NEW.id;
          END IF;
          RETURN NEW;
        END;
        $$;
        DROP TRIGGER IF EXISTS ${STATUS_TRIGGER} ON receiving_documents;
        CREATE TRIGGER ${STATUS_TRIGGER}
        BEFORE UPDATE ON receiving_documents
        FOR EACH ROW EXECUTE FUNCTION ${STATUS_FUNCTION}();
      `);
    };

    /**
     * Melepas seluruh trigger dan fungsi uji.
     *
     * @returns Promise<void>
     */
    const removeFailureTriggers = async (): Promise<void> => {
      const pool = getPool();
      await pool.query(`DROP TRIGGER IF EXISTS ${LEDGER_TRIGGER} ON inventory_transactions`);
      await pool.query(`DROP TRIGGER IF EXISTS ${STATUS_TRIGGER} ON receiving_documents`);
      await pool.query(`DROP FUNCTION IF EXISTS ${LEDGER_FUNCTION}()`);
      await pool.query(`DROP FUNCTION IF EXISTS ${STATUS_FUNCTION}()`);
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      process.env.JWT_SECRET = "test-jwt-secret-for-fault-injection";

      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'OPERATOR')
         RETURNING id::int AS id`,
        [`fault-it-${suffix}@example.test`, "not-a-real-hash"],
      );
      userId = rows[0].id;

      const productA = await createProduct({
        sku: `${skuPrefix}-A`,
        name: "Produk Fault A",
        description: null,
      });
      const productB = await createProduct({
        sku: `${skuPrefix}-B`,
        name: "Produk Fault B",
        description: null,
      });
      productAId = productA.id;
      productBId = productB.id;

      await removeFailureTriggers();
    });

    afterAll(async () => {
      await removeFailureTriggers();
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
      await pool.query("DELETE FROM users WHERE email = $1", [`fault-it-${suffix}@example.test`]);
      await closePool();
    });

    it("me-rollback item dan inventory ketika insert ledger gagal", async () => {
      const document = await createDocument("LEDGER", productAId, 5);

      const first = await receiveDocumentItems(document.id, [
        { product_id: productAId, quantity_received: 2 },
      ]);
      expect(first.status).toBe("IN_PROGRESS");

      const receivedBefore = await receivedOf(document.id, productAId);
      const inventoryBefore = await inventoryOf(productAId);
      const ledgerBefore = await ledgerOf(document.id);
      expect(receivedBefore).toBe(2);
      expect(inventoryBefore).toBe(2);
      expect(ledgerBefore).toEqual({ count: 1, total: 2 });

      await installLedgerFailure(document.id);

      await expect(
        receiveDocumentItems(document.id, [
          { product_id: productAId, quantity_received: 2 },
        ]),
      ).rejects.toThrow(/injected ledger failure/);

      expect(await receivedOf(document.id, productAId)).toBe(receivedBefore);
      expect(await inventoryOf(productAId)).toBe(inventoryBefore);
      expect(await ledgerOf(document.id)).toEqual(ledgerBefore);
      expect(await statusOf(document.id)).toBe("IN_PROGRESS");

      await removeFailureTriggers();

      const afterRecovery = await receiveDocumentItems(document.id, [
        { product_id: productAId, quantity_received: 1 },
      ]);
      expect(afterRecovery.status).toBe("IN_PROGRESS");
      expect(await receivedOf(document.id, productAId)).toBe(3);
      expect(await inventoryOf(productAId)).toBe(3);
      expect(await ledgerOf(document.id)).toEqual({ count: 2, total: 3 });
    });

    it("me-rollback ledger dan inventory ketika update status gagal", async () => {
      const document = await createDocument("STATUS", productBId, 4);

      const inventoryBefore = await inventoryOf(productBId);
      expect(inventoryBefore).toBe(0);

      await installStatusFailure(document.id);

      await expect(
        receiveDocumentItems(document.id, [
          { product_id: productBId, quantity_received: 2 },
        ]),
      ).rejects.toThrow(/injected status failure/);

      expect(await receivedOf(document.id, productBId)).toBe(0);
      expect(await inventoryOf(productBId)).toBe(inventoryBefore);
      expect(await ledgerOf(document.id)).toEqual({ count: 0, total: 0 });
      expect(await statusOf(document.id)).toBe("DRAFT");

      await removeFailureTriggers();

      const afterRecovery = await receiveDocumentItems(document.id, [
        { product_id: productBId, quantity_received: 2 },
      ]);
      expect(afterRecovery.status).toBe("IN_PROGRESS");
      expect(await receivedOf(document.id, productBId)).toBe(2);
      expect(await inventoryOf(productBId)).toBe(2);
      expect(await ledgerOf(document.id)).toEqual({ count: 1, total: 2 });
    });
  },
);
