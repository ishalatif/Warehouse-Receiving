import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../config/db";
import { listInventory, listInventoryTransactions } from "../services/inventory.service";
import { createProduct } from "../services/product.service";
import {
  createReceivingDocument,
  receiveDocumentItems,
} from "../services/receiving-document.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("inventory and ledger (integration, disposable database)", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const docPrefix = `DOC-INV-IT-${suffix}`;
  const skuPrefix = `sku-inv-it-${suffix}`;
  let userId: number;
  let productAId: number;
  let productBId: number;
  let documentId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL as string;
    process.env.JWT_SECRET = "test-jwt-secret-for-inventory";

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'OPERATOR')
       RETURNING id::int AS id`,
      [`inv-it-${suffix}@example.test`, "not-a-real-hash"],
    );
    userId = rows[0].id;

    const productA = await createProduct({
      sku: `${skuPrefix}-A`,
      name: "Produk Stok A",
      description: null,
    });
    const productB = await createProduct({
      sku: `${skuPrefix}-B`,
      name: "Produk Stok B",
      description: null,
    });
    productAId = productA.id;
    productBId = productB.id;

    const document = await createReceivingDocument(
      {
        document_number: `${docPrefix}-MAIN`,
        items: [
          { product_id: productAId, expected_quantity: 10 },
          { product_id: productBId, expected_quantity: 5 },
        ],
      },
      userId,
    );
    documentId = document.id;

    await receiveDocumentItems(document.id, [
      { product_id: productAId, quantity_received: 4 },
      { product_id: productBId, quantity_received: 5 },
    ]);
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
    await pool.query("DELETE FROM users WHERE email = $1", [`inv-it-${suffix}@example.test`]);
    await closePool();
  });

  it("menampilkan saldo stok sesuai hasil penerimaan", async () => {
    const inventory = await listInventory();
    const itemA = inventory.find((item) => item.product_id === productAId);
    const itemB = inventory.find((item) => item.product_id === productBId);

    expect(itemA).toEqual(
      expect.objectContaining({
        sku: `${skuPrefix}-A`,
        product_name: "Produk Stok A",
        quantity_on_hand: 4,
      }),
    );
    expect(itemB).toEqual(
      expect.objectContaining({
        sku: `${skuPrefix}-B`,
        product_name: "Produk Stok B",
        quantity_on_hand: 5,
      }),
    );
  });

  it("menampilkan riwayat transaksi dengan produk, dokumen, jumlah, dan jenis", async () => {
    const transactions = (await listInventoryTransactions()).filter(
      (transaction) => transaction.document_id === documentId,
    );

    expect(transactions).toHaveLength(2);
    expect(transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_id: productAId,
          quantity_change: 4,
          type: "RECEIPT_IN",
        }),
        expect.objectContaining({
          product_id: productBId,
          quantity_change: 5,
          type: "RECEIPT_IN",
        }),
      ]),
    );
  });

  it("membandingkan saldo stok dengan agregat ledger", async () => {
    const { rows } = await getPool().query(
      `SELECT i.product_id::int AS product_id,
              i.quantity_on_hand::int AS quantity_on_hand,
              COALESCE(SUM(t.quantity_change), 0)::int AS ledger_total
       FROM inventory i
       LEFT JOIN inventory_transactions t ON t.product_id = i.product_id
       WHERE i.product_id = ANY($1::bigint[])
       GROUP BY i.product_id, i.quantity_on_hand
       ORDER BY i.product_id`,
      [[productAId, productBId]],
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.quantity_on_hand).toBe(row.ledger_total);
    }
  });

  it("menampilkan transaksi terbaru lebih dahulu", async () => {
    await receiveDocumentItems(documentId, [
      { product_id: productAId, quantity_received: 1 },
    ]);

    const transactions = (await listInventoryTransactions()).filter(
      (transaction) => transaction.product_id === productAId,
    );

    expect(transactions.length).toBeGreaterThanOrEqual(2);
    expect(transactions[0]).toEqual(
      expect.objectContaining({ product_id: productAId, quantity_change: 1 }),
    );
  });
});
