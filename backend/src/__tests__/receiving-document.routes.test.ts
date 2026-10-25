import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import * as receivingDocumentService from "../services/receiving-document.service";

vi.mock("../services/receiving-document.service", () => {
  class DocumentNumberAlreadyExistsError extends Error {
    constructor() {
      super("Nomor dokumen sudah digunakan.");
      this.name = "DocumentNumberAlreadyExistsError";
    }
  }
  class ProductNotFoundError extends Error {
    constructor() {
      super("Produk tidak ditemukan.");
      this.name = "ProductNotFoundError";
    }
  }
  class DuplicateProductError extends Error {
    constructor() {
      super("Produk duplikat.");
      this.name = "DuplicateProductError";
    }
  }
  class DocumentNotFoundError extends Error {
    constructor() {
      super("Dokumen tidak ditemukan.");
      this.name = "DocumentNotFoundError";
    }
  }
  class InvalidDocumentStatusError extends Error {
    constructor(message = "Status dokumen tidak mengizinkan operasi ini.") {
      super(message);
      this.name = "InvalidDocumentStatusError";
    }
  }

  return {
    listReceivingDocuments: vi.fn(),
    getReceivingDocument: vi.fn(),
    createReceivingDocument: vi.fn(),
    cancelReceivingDocument: vi.fn(),
    DocumentNumberAlreadyExistsError,
    ProductNotFoundError,
    DuplicateProductError,
    DocumentNotFoundError,
    InvalidDocumentStatusError,
  };
});

const JWT_SECRET = "test-jwt-secret-for-documents";

/**
 * Membuat token JWT untuk pengujian route.
 *
 * @param role - Role yang akan disematkan pada token.
 * @param id - ID user pada klaim `sub`.
 * @returns Token JWT bertanda tangan.
 */
const signToken = (role: "OPERATOR" | "SUPERVISOR", id = 1): string =>
  jwt.sign({ sub: id, email: `${role.toLowerCase()}@example.com`, role }, JWT_SECRET, {
    expiresIn: "1h",
  });

/**
 * Fixture dokumen penerimaan untuk respons service tiruan.
 *
 * @returns Objek dokumen lengkap dengan satu item.
 */
const buildDocument = () => ({
  id: 10,
  document_number: "DOC-001",
  status: "DRAFT" as const,
  created_by: 1,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  items: [
    {
      product_id: 3,
      sku: "SKU-001",
      product_name: "Produk Contoh",
      expected_quantity: 5,
      received_quantity: 0,
    },
  ],
});

describe("receiving document routes", () => {
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

  it("mengembalikan 401 untuk GET daftar tanpa token", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents`);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan daftar dokumen untuk pengguna terautentikasi", async () => {
    vi.mocked(receivingDocumentService.listReceivingDocuments).mockResolvedValue([
      buildDocument(),
    ]);

    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].document_number).toBe("DOC-001");
  });

  it("mengembalikan 403 ketika Operator membuat dokumen", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("OPERATOR")}`,
      },
      body: JSON.stringify({
        document_number: "DOC-002",
        items: [{ product_id: 1, expected_quantity: 2 }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "FORBIDDEN" }));
  });

  it("mengembalikan 400 VALIDATION_ERROR untuk payload tanpa item", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({ document_number: "DOC-003", items: [] }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 400 VALIDATION_ERROR untuk produk duplikat dalam payload", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({
        document_number: "DOC-004",
        items: [
          { product_id: 1, expected_quantity: 2 },
          { product_id: 1, expected_quantity: 3 },
        ],
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
    expect(receivingDocumentService.createReceivingDocument).not.toHaveBeenCalled();
  });

  it("membuat dokumen dan mengembalikan 201 oleh Supervisor", async () => {
    vi.mocked(receivingDocumentService.createReceivingDocument).mockResolvedValue(
      buildDocument(),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR", 7)}`,
      },
      body: JSON.stringify({
        document_number: "  DOC-001  ",
        items: [{ product_id: 3, expected_quantity: 5 }],
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.status).toBe("DRAFT");
    expect(body.data.items[0].received_quantity).toBe(0);
    expect(receivingDocumentService.createReceivingDocument).toHaveBeenCalledWith(
      { document_number: "DOC-001", items: [{ product_id: 3, expected_quantity: 5 }] },
      7,
    );
  });

  it("mengembalikan 404 NOT_FOUND ketika produk tidak ada", async () => {
    vi.mocked(receivingDocumentService.createReceivingDocument).mockRejectedValue(
      new receivingDocumentService.ProductNotFoundError(),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({
        document_number: "DOC-005",
        items: [{ product_id: 999, expected_quantity: 1 }],
      }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "NOT_FOUND" }));
  });

  it("mengembalikan 409 DOCUMENT_NUMBER_ALREADY_EXISTS untuk nomor duplikat", async () => {
    vi.mocked(receivingDocumentService.createReceivingDocument).mockRejectedValue(
      new receivingDocumentService.DocumentNumberAlreadyExistsError(),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken("SUPERVISOR")}`,
      },
      body: JSON.stringify({
        document_number: "DOC-006",
        items: [{ product_id: 1, expected_quantity: 1 }],
      }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ success: false, code: "DOCUMENT_NUMBER_ALREADY_EXISTS" }),
    );
  });

  it("mengembalikan 400 untuk ID dokumen tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents/abc`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 404 ketika dokumen tidak ditemukan", async () => {
    vi.mocked(receivingDocumentService.getReceivingDocument).mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/receiving-documents/99`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "NOT_FOUND" }));
  });

  it("mengembalikan detail dokumen beserta item", async () => {
    vi.mocked(receivingDocumentService.getReceivingDocument).mockResolvedValue(buildDocument());

    const response = await fetch(`${baseUrl}/api/receiving-documents/10`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(10);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toEqual(
      expect.objectContaining({ product_id: 3, expected_quantity: 5, received_quantity: 0 }),
    );
  });

  it("mengembalikan 403 ketika Operator membatalkan dokumen", async () => {
    const response = await fetch(`${baseUrl}/api/receiving-documents/10/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(403);
  });

  it("mengembalikan 400 INVALID_DOCUMENT_STATUS ketika dokumen bukan DRAFT", async () => {
    vi.mocked(receivingDocumentService.cancelReceivingDocument).mockRejectedValue(
      new receivingDocumentService.InvalidDocumentStatusError(),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents/10/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signToken("SUPERVISOR")}` },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ success: false, code: "INVALID_DOCUMENT_STATUS" }),
    );
  });

  it("membatalkan dokumen DRAFT dan mengembalikan 200", async () => {
    vi.mocked(receivingDocumentService.cancelReceivingDocument).mockResolvedValue({
      ...buildDocument(),
      status: "CANCELLED",
    });

    const response = await fetch(`${baseUrl}/api/receiving-documents/10/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signToken("SUPERVISOR")}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("CANCELLED");
  });

  it("mengembalikan 404 ketika membatalkan dokumen yang tidak ada", async () => {
    vi.mocked(receivingDocumentService.cancelReceivingDocument).mockRejectedValue(
      new receivingDocumentService.DocumentNotFoundError(),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents/99/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signToken("SUPERVISOR")}` },
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "NOT_FOUND" }));
  });

  it("mengembalikan 500 INTERNAL_ERROR ketika service gagal", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(receivingDocumentService.listReceivingDocuments).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await fetch(`${baseUrl}/api/receiving-documents`, {
      headers: { Authorization: `Bearer ${signToken("OPERATOR")}` },
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "INTERNAL_ERROR" }));
    expect(consoleErrorSpy).toHaveBeenCalledWith("Receiving document listing failed");
    consoleErrorSpy.mockRestore();
  });
});
