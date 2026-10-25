import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import * as inventoryService from "../services/inventory.service";

vi.mock("../services/inventory.service", () => ({
  listInventory: vi.fn(),
  listInventoryTransactions: vi.fn(),
}));

const JWT_SECRET = "test-jwt-secret-for-inventory";

/**
 * Membuat token JWT untuk pengujian route inventory.
 *
 * @param role - Role yang akan disematkan pada token.
 * @returns Token JWT bertanda tangan.
 */
const signToken = (role: "OPERATOR" | "SUPERVISOR"): string =>
  jwt.sign({ sub: 1, email: `${role.toLowerCase()}@example.com`, role }, JWT_SECRET, {
    expiresIn: "1h",
  });

describe("inventory routes", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    app = createApp();
    server = app.listen(0);
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("mengembalikan 401 untuk GET /api/inventory tanpa token", async () => {
    const response = await fetch(`${baseUrl}/api/inventory`);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan 401 untuk GET /api/inventory/transactions tanpa token", async () => {
    const response = await fetch(`${baseUrl}/api/inventory/transactions`);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan saldo stok untuk Operator", async () => {
    vi.mocked(inventoryService.listInventory).mockResolvedValue([
      {
        product_id: 1,
        sku: "SKU-001",
        product_name: "Produk Contoh",
        quantity_on_hand: 7,
        updated_at: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const response = await fetch(`${baseUrl}/api/inventory`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      expect.objectContaining({
        product_id: 1,
        sku: "SKU-001",
        product_name: "Produk Contoh",
        quantity_on_hand: 7,
      }),
    ]);
  });

  it("mengembalikan riwayat transaksi untuk Supervisor", async () => {
    vi.mocked(inventoryService.listInventoryTransactions).mockResolvedValue([
      {
        id: 11,
        product_id: 1,
        document_id: 3,
        quantity_change: 5,
        type: "RECEIPT_IN",
        created_at: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const response = await fetch(`${baseUrl}/api/inventory/transactions`, {
      headers: { Authorization: `Bearer ${signToken("SUPERVISOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 11,
        product_id: 1,
        document_id: 3,
        quantity_change: 5,
        type: "RECEIPT_IN",
      }),
    ]);
  });

  it("mengembalikan 500 INTERNAL_ERROR ketika daftar stok gagal", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inventoryService.listInventory).mockRejectedValue(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/inventory`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "INTERNAL_ERROR" }));
    expect(consoleErrorSpy).toHaveBeenCalledWith("Inventory listing failed");
    consoleErrorSpy.mockRestore();
  });

  it("mengembalikan 500 INTERNAL_ERROR ketika riwayat transaksi gagal", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inventoryService.listInventoryTransactions).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await fetch(`${baseUrl}/api/inventory/transactions`, {
      headers: { Authorization: `Bearer ${signToken("SUPERVISOR")}` },
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "INTERNAL_ERROR" }));
    expect(consoleErrorSpy).toHaveBeenCalledWith("Inventory transaction listing failed");
    consoleErrorSpy.mockRestore();
  });
});
