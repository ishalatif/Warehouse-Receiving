import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import * as productService from "../services/product.service";

vi.mock("../services/product.service", () => {
  class SkuAlreadyExistsError extends Error {
    constructor() {
      super("SKU sudah digunakan.");
      this.name = "SkuAlreadyExistsError";
    }
  }

  return {
    listProducts: vi.fn(),
    createProduct: vi.fn(),
    SkuAlreadyExistsError,
  };
});

const JWT_SECRET = "test-jwt-secret-for-products";

const signToken = (role: "OPERATOR" | "SUPERVISOR"): string =>
  jwt.sign({ sub: 1, email: `${role.toLowerCase()}@example.com`, role }, JWT_SECRET, {
    expiresIn: "1h",
  });

describe("product routes", () => {
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

  it("mengembalikan 401 untuk GET /api/products tanpa token", async () => {
    const response = await fetch(`${baseUrl}/api/products`);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan katalog untuk GET /api/products dengan token", async () => {
    vi.mocked(productService.listProducts).mockResolvedValue([
      {
        id: 1,
        sku: "SKU-001",
        name: "Produk Contoh",
        description: null,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await fetch(`${baseUrl}/api/products`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sku).toBe("SKU-001");
  });

  it("mengembalikan 401 untuk POST /api/products tanpa token", async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-002", name: "Produk" }),
    });

    expect(response.status).toBe(401);
  });

  it("mengembalikan 403 untuk POST /api/products oleh Operator", async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("OPERATOR")}`,
      },
      body: JSON.stringify({ sku: "SKU-003", name: "Produk" }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "FORBIDDEN" }));
  });

  it("mengembalikan 400 VALIDATION_ERROR untuk input tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({ sku: "   ", name: "" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("membuat produk dan mengembalikan 201 oleh Supervisor", async () => {
    vi.mocked(productService.createProduct).mockResolvedValue({
      id: 2,
      sku: "SKU-004",
      name: "Produk Baru",
      description: "Deskripsi",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({ sku: " SKU-004 ", name: " Produk Baru ", description: "Deskripsi" }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.sku).toBe("SKU-004");
  });

  it("mengembalikan 409 SKU_ALREADY_EXISTS saat SKU duplikat", async () => {
    vi.mocked(productService.createProduct).mockRejectedValue(
      new productService.SkuAlreadyExistsError(),
    );

    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({ sku: "SKU-005", name: "Produk Duplikat" }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "SKU_ALREADY_EXISTS" }));
  });
});
