import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import * as receivingDocumentService from "../services/receiving-document.service";

vi.mock("../services/receiving-document.service", () => {
  class DocumentNumberAlreadyExistsError extends Error {}
  class ProductNotFoundError extends Error {}
  class DuplicateProductError extends Error {}
  class DocumentNotFoundError extends Error {}
  class InvalidDocumentStatusError extends Error {}
  class ProductNotInDocumentError extends Error {}
  class OverReceivingExceededError extends Error {}

  return {
    listReceivingDocuments: vi.fn(),
    getReceivingDocument: vi.fn(),
    createReceivingDocument: vi.fn(),
    cancelReceivingDocument: vi.fn(),
    receiveDocumentItems: vi.fn(),
    DocumentNumberAlreadyExistsError,
    ProductNotFoundError,
    DuplicateProductError,
    DocumentNotFoundError,
    InvalidDocumentStatusError,
    ProductNotInDocumentError,
    OverReceivingExceededError,
  };
});

const JWT_SECRET = "test-jwt-secret-for-receiving";

/**
 * Membuat token JWT untuk pengujian route penerimaan.
 *
 * @param role - Role yang akan disematkan pada token.
 * @returns Token JWT bertanda tangan.
 */
const signToken = (role: "OPERATOR" | "SUPERVISOR"): string =>
  jwt.sign({ sub: 5, email: `${role.toLowerCase()}@example.com`, role }, JWT_SECRET, {
    expiresIn: "1h",
  });

/**
 * Fixture detail dokumen setelah penerimaan parsial.
 *
 * @returns Objek dokumen dengan satu item yang sudah menerima sebagian.
 */
const buildReceivedDocument = () => ({
  id: 10,
  document_number: "DOC-001",
  status: "IN_PROGRESS" as const,
  created_by: 1,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-02T00:00:00.000Z"),
  items: [
    {
      product_id: 3,
      sku: "SKU-001",
      product_name: "Produk Contoh",
      expected_quantity: 5,
      received_quantity: 2,
    },
  ],
});

describe("POST /api/receiving-documents/:id/receive", () => {
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

  /**
   * Memanggil endpoint penerimaan dengan payload tertentu.
   *
   * @param payload - Body JSON yang dikirim.
   * @param role - Role token; `null` berarti tanpa token.
   * @param id - Segmen ID dokumen pada URL.
   * @returns Respons `fetch`.
   */
  const callReceive = (
    payload: unknown,
    role: "OPERATOR" | "SUPERVISOR" | null = "OPERATOR",
    id = "10",
  ): Promise<Response> =>
    fetch(`${baseUrl}/api/receiving-documents/${id}/receive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(role ? { Authorization: `Bearer ${signToken(role)}` } : {}),
      },
      body: JSON.stringify(payload),
    });

  it("mengembalikan 401 tanpa token", async () => {
    const response = await callReceive(
      { items: [{ product_id: 3, quantity_received: 1 }] },
      null,
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan 403 ketika Supervisor mencoba menerima", async () => {
    const response = await callReceive(
      { items: [{ product_id: 3, quantity_received: 1 }] },
      "SUPERVISOR",
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "FORBIDDEN" }));
  });

  it("mengembalikan 400 untuk ID dokumen tidak valid", async () => {
    const response = await callReceive(
      { items: [{ product_id: 3, quantity_received: 1 }] },
      "OPERATOR",
      "abc",
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 400 untuk payload tanpa item", async () => {
    const response = await callReceive({ items: [] });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 400 untuk kuantitas non-positif atau non-integer", async () => {
    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 1.5 }],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 400 untuk produk duplikat dalam payload", async () => {
    const response = await callReceive({
      items: [
        { product_id: 3, quantity_received: 1 },
        { product_id: 3, quantity_received: 2 },
      ],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
    expect(receivingDocumentService.receiveDocumentItems).not.toHaveBeenCalled();
  });

  it("mencatat penerimaan dan mengembalikan 200", async () => {
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockResolvedValue(
      buildReceivedDocument(),
    );

    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 2 }],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("IN_PROGRESS");
    expect(body.data.items[0].received_quantity).toBe(2);
    expect(receivingDocumentService.receiveDocumentItems).toHaveBeenCalledWith(10, [
      { product_id: 3, quantity_received: 2 },
    ]);
  });

  it("mengembalikan 404 ketika dokumen tidak ditemukan", async () => {
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockRejectedValue(
      new receivingDocumentService.DocumentNotFoundError(),
    );

    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 1 }],
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "NOT_FOUND" }));
  });

  it("mengembalikan 400 INVALID_DOCUMENT_STATUS untuk dokumen tertutup", async () => {
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockRejectedValue(
      new receivingDocumentService.InvalidDocumentStatusError(),
    );

    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 1 }],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ success: false, code: "INVALID_DOCUMENT_STATUS" }),
    );
  });

  it("mengembalikan 400 OVER_RECEIVING_EXCEEDED", async () => {
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockRejectedValue(
      new receivingDocumentService.OverReceivingExceededError(),
    );

    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 99 }],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ success: false, code: "OVER_RECEIVING_EXCEEDED" }),
    );
  });

  it("mengembalikan 400 PRODUCT_NOT_IN_DOCUMENT untuk produk asing", async () => {
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockRejectedValue(
      new receivingDocumentService.ProductNotInDocumentError(),
    );

    const response = await callReceive({
      items: [{ product_id: 999, quantity_received: 1 }],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ success: false, code: "PRODUCT_NOT_IN_DOCUMENT" }),
    );
  });

  it("mengembalikan 500 INTERNAL_ERROR ketika service gagal", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(receivingDocumentService.receiveDocumentItems).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await callReceive({
      items: [{ product_id: 3, quantity_received: 1 }],
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "INTERNAL_ERROR" }));
    expect(consoleErrorSpy).toHaveBeenCalledWith("Receiving document receive failed");
    consoleErrorSpy.mockRestore();
  });
});
