import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../config/db";
import { createProduct, SkuAlreadyExistsError } from "../services/product.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("product service (integration, disposable database)", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const skuPrefix = `sku-it-${suffix}`;

  beforeAll(() => {
    process.env.DATABASE_URL = TEST_DATABASE_URL as string;
    process.env.JWT_SECRET = "test-jwt-secret-for-products";
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(
      "DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE lower(btrim(sku)) LIKE $1)",
      [`${skuPrefix}%`],
    );
    await pool.query("DELETE FROM products WHERE lower(btrim(sku)) LIKE $1", [`${skuPrefix}%`]);
    await closePool();
  });

  it("membuat produk baru dengan saldo inventory nol", async () => {
    const product = await createProduct({
      sku: `SKU-IT-NEW-${suffix}`,
      name: "Produk Integrasi",
      description: null,
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT quantity_on_hand FROM inventory WHERE product_id = $1",
      [product.id],
    );

    expect(product.sku).toBe(`SKU-IT-NEW-${suffix}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity_on_hand).toBe("0");
  });

  it("menolak SKU duplikat tanpa membedakan kapitalisasi", async () => {
    const sku = `SKU-IT-DUP-${suffix}`;

    await createProduct({ sku, name: "Produk Duplikat", description: null });

    await expect(
      createProduct({ sku: `  ${sku.toLowerCase()}  `, name: "Produk Duplikat Kedua", description: null }),
    ).rejects.toBeInstanceOf(SkuAlreadyExistsError);

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM products WHERE lower(btrim(sku)) = lower(btrim($1))",
      [sku],
    );

    expect(rows[0].count).toBe(1);
  });
});
