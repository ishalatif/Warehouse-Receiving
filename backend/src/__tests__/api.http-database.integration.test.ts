import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { closePool, getPool } from "../config/db";
import { createUserAccount, EmailAlreadyExistsError } from "../services/user.service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Memastikan target database adalah PostgreSQL lokal/disposable.
 *
 * Test ini menulis dan menghapus data, sehingga menolak berjalan pada host
 * non-loopback atau ketika environment produksi.
 *
 * @param rawUrl - Connection string target test.
 * @throws Error jika target tidak aman.
 */
function assertDisposableDatabase(rawUrl: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("HTTP+DB integration test menolak berjalan pada NODE_ENV=production.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL bukan URL PostgreSQL yang valid.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
      `HTTP+DB integration test hanya boleh memakai database loopback; host terdeteksi: ${host}.`,
    );
  }
}

describe.skipIf(!TEST_DATABASE_URL)(
  "HTTP API against real PostgreSQL (integration, disposable database)",
  () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const emailPrefix = `http-it-${suffix}`;
    const skuPrefix = `sku-http-it-${suffix}`;
    const docPrefix = `DOC-HTTP-IT-${suffix}`;
    const supervisorEmail = `${emailPrefix}-supervisor@example.test`;
    const operatorEmail = `${emailPrefix}-operator@example.test`;
    const supervisorPassword = randomBytes(18).toString("base64url");
    const operatorPassword = randomBytes(18).toString("base64url");

    let app: Express;
    let server: Server;
    let baseUrl: string;
    let supervisorToken: string;
    let operatorToken: string;
    let jwtSecret: string;
    let productId: number;
    let documentId: number;
    let rejectedSku: string;

    /**
     * Memanggil endpoint API dan mengembalikan status serta body JSON.
     *
     * @param path - Path relatif, misalnya `/api/health`.
     * @param options - Method, token, dan body opsional.
     * @returns Status HTTP dan body JSON.
     */
    const call = async (
      path: string,
      options: { method?: string; token?: string; body?: unknown } = {},
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      // File test lain berjalan paralel dan dapat menulis process.env; pastikan
      // verifikasi JWT memakai secret yang sama dengan saat token ditandatangani.
      process.env.JWT_SECRET = jwtSecret;

      const headers: Record<string, string> = {};
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const body = (await response.json()) as Record<string, unknown>;
      return { status: response.status, body };
    };

    /**
     * Mengambil saldo inventory satu produk langsung dari database.
     *
     * @param id - ID produk.
     * @returns Saldo stok saat ini.
     */
    const inventoryOf = async (id: number): Promise<number> => {
      const { rows } = await getPool().query(
        "SELECT quantity_on_hand::int AS quantity FROM inventory WHERE product_id = $1",
        [id],
      );
      return rows[0]?.quantity ?? 0;
    };

    /**
     * Mengambil jumlah entry dan total kuantitas ledger satu dokumen.
     *
     * @param id - ID dokumen.
     * @returns Jumlah entry dan total quantity_change.
     */
    const ledgerOf = async (id: number): Promise<{ count: number; total: number }> => {
      const { rows } = await getPool().query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(quantity_change), 0)::int AS total
         FROM inventory_transactions
         WHERE document_id = $1`,
        [id],
      );
      return rows[0];
    };

    beforeAll(async () => {
      assertDisposableDatabase(TEST_DATABASE_URL as string);
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      jwtSecret = `http-it-secret-${randomBytes(16).toString("hex")}`;
      process.env.JWT_SECRET = jwtSecret;

      await createUserAccount({
        email: supervisorEmail,
        password: supervisorPassword,
        role: "SUPERVISOR",
      });
      await createUserAccount({
        email: operatorEmail,
        password: operatorPassword,
        role: "OPERATOR",
      });

      app = createApp();
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections?.();
        });
      }

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
      await pool.query("DELETE FROM users WHERE email LIKE $1", [`${emailPrefix}%`]);
      await closePool();
    });

    it("melaporkan health siap dan menolak kredensial salah", async () => {
      const health = await call("/api/health");
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({ status: "ok", database: "ready" });

      const invalid = await call("/api/auth/login", {
        method: "POST",
        body: { email: supervisorEmail, password: `${supervisorPassword}-salah` },
      });
      expect(invalid.status).toBe(401);
      expect(invalid.body.code).toBe("UNAUTHORIZED");

      const operatorLogin = await call("/api/auth/login", {
        method: "POST",
        body: { email: operatorEmail, password: operatorPassword },
      });
      expect(operatorLogin.status).toBe(200);
      operatorToken = (operatorLogin.body.data as { token: string }).token;

      const supervisorLogin = await call("/api/auth/login", {
        method: "POST",
        body: { email: supervisorEmail, password: supervisorPassword },
      });
      expect(supervisorLogin.status).toBe(200);
      const data = supervisorLogin.body.data as {
        token: string;
        user: { email: string; role: string; password_hash?: string };
      };
      supervisorToken = data.token;
      expect(data.user).toMatchObject({ email: supervisorEmail, role: "SUPERVISOR" });
      expect(data.user).not.toHaveProperty("password_hash");
      expect(JSON.stringify(supervisorLogin.body)).not.toMatch(/password_hash|\$2[aby]\$/);
    });

    it("menolak email duplikat tanpa menambah baris user", async () => {
      await expect(
        createUserAccount({
          email: supervisorEmail.toUpperCase(),
          password: randomBytes(18).toString("base64url"),
          role: "OPERATOR",
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyExistsError);

      const { rows } = await getPool().query(
        "SELECT COUNT(*)::int AS count FROM users WHERE email = $1",
        [supervisorEmail],
      );
      expect(rows[0].count).toBe(1);
    });

    it("membuat produk lewat HTTP dan menolak Operator tanpa mengubah database", async () => {
      const created = await call("/api/products", {
        method: "POST",
        token: supervisorToken,
        body: {
          sku: `${skuPrefix}-A`,
          name: "Produk HTTP A",
          description: "Dibuat lewat HTTP",
        },
      });
      expect(created.status).toBe(201);
      const product = created.body.data as { id: number; sku: string };
      productId = product.id;
      expect(product.sku).toBe(`${skuPrefix}-A`);

      const { rows } = await getPool().query(
        "SELECT COUNT(*)::int AS count FROM products WHERE id = $1",
        [productId],
      );
      expect(rows[0].count).toBe(1);
      expect(await inventoryOf(productId)).toBe(0);

      rejectedSku = `${skuPrefix}-REJECTED`;
      const forbidden = await call("/api/products", {
        method: "POST",
        token: operatorToken,
        body: { sku: rejectedSku, name: "Tidak boleh dibuat", description: null },
      });
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe("FORBIDDEN");

      const rejected = await getPool().query(
        "SELECT COUNT(*)::int AS count FROM products WHERE lower(btrim(sku)) = lower($1)",
        [rejectedSku],
      );
      expect(rejected.rows[0].count).toBe(0);
    });

    it("menjalankan alur dokumen dan penerimaan lewat HTTP dengan data nyata", async () => {
      const createdDocument = await call("/api/receiving-documents", {
        method: "POST",
        token: supervisorToken,
        body: {
          document_number: `${docPrefix}-MAIN`,
          items: [{ product_id: productId, expected_quantity: 5 }],
        },
      });
      expect(createdDocument.status).toBe(201);
      const document = createdDocument.body.data as {
        id: number;
        status: string;
        items: Array<{ product_id: number; received_quantity: number }>;
      };
      documentId = document.id;
      expect(document.status).toBe("DRAFT");
      expect(document.items[0]).toMatchObject({ product_id: productId, received_quantity: 0 });

      const partial = await call(`/api/receiving-documents/${documentId}/receive`, {
        method: "POST",
        token: operatorToken,
        body: { items: [{ product_id: productId, quantity_received: 2 }] },
      });
      expect(partial.status).toBe(200);
      expect((partial.body.data as { status: string }).status).toBe("IN_PROGRESS");
      expect(await inventoryOf(productId)).toBe(2);
      expect(await ledgerOf(documentId)).toEqual({ count: 1, total: 2 });

      const forbidden = await call(`/api/receiving-documents/${documentId}/receive`, {
        method: "POST",
        token: supervisorToken,
        body: { items: [{ product_id: productId, quantity_received: 1 }] },
      });
      expect(forbidden.status).toBe(403);
      expect(await inventoryOf(productId)).toBe(2);
      expect(await ledgerOf(documentId)).toEqual({ count: 1, total: 2 });

      const inventory = await call("/api/inventory", { token: operatorToken });
      expect(inventory.status).toBe(200);
      expect(inventory.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ product_id: productId, quantity_on_hand: 2 }),
        ]),
      );

      const transactions = await call("/api/inventory/transactions", {
        token: operatorToken,
      });
      expect(transactions.status).toBe(200);
      expect(transactions.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            product_id: productId,
            document_id: documentId,
            quantity_change: 2,
            type: "RECEIPT_IN",
          }),
        ]),
      );

      const remainder = await call(`/api/receiving-documents/${documentId}/receive`, {
        method: "POST",
        token: operatorToken,
        body: { items: [{ product_id: productId, quantity_received: 3 }] },
      });
      expect(remainder.status).toBe(200);
      expect((remainder.body.data as { status: string }).status).toBe("COMPLETED");
      expect(await inventoryOf(productId)).toBe(5);
      expect(await ledgerOf(documentId)).toEqual({ count: 2, total: 5 });

      const detail = await call(`/api/receiving-documents/${documentId}`, {
        token: operatorToken,
      });
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ id: documentId, status: "COMPLETED" });
    });

    it("menolak token hilang/rusak tanpa mengubah data", async () => {
      const before = await getPool().query("SELECT COUNT(*)::int AS count FROM products");

      const missing = await call("/api/products");
      expect(missing.status).toBe(401);
      expect(missing.body.code).toBe("UNAUTHORIZED");

      const tampered = await call("/api/products", { token: "token-palsu" });
      expect(tampered.status).toBe(401);

      const after = await getPool().query("SELECT COUNT(*)::int AS count FROM products");
      expect(after.rows[0].count).toBe(before.rows[0].count);
    });
  },
);
