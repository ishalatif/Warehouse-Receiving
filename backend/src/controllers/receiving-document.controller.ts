import { Request, Response } from "express";
import {
  cancelReceivingDocument as cancelReceivingDocumentService,
  createReceivingDocument as createReceivingDocumentService,
  DocumentNotFoundError,
  DocumentNumberAlreadyExistsError,
  DuplicateProductError,
  getReceivingDocument as getReceivingDocumentService,
  InvalidDocumentStatusError,
  listReceivingDocuments as listReceivingDocumentsService,
  OverReceivingExceededError,
  ProductNotFoundError,
  ProductNotInDocumentError,
  receiveDocumentItems as receiveDocumentItemsService,
  type ReceiveItemInput,
} from "../services/receiving-document.service";

/**
 * Item payload yang sudah lolos validasi.
 */
interface ValidatedItem {
  product_id: number;
  expected_quantity: number;
}

/**
 * Mem-parse parameter `id` menjadi bilangan bulat positif.
 *
 * @param raw - Nilai parameter mentah dari Express.
 * @returns Bilangan bulat positif, atau `null` jika tidak valid.
 */
function parsePositiveId(raw: string | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Memvalidasi array item pembuatan dokumen.
 *
 * @param rawItems - Nilai `items` mentah dari body request.
 * @returns Daftar item valid, atau `null` jika ada item/duplikasi tidak valid.
 */
function validateItems(rawItems: unknown): ValidatedItem[] | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const items: ValidatedItem[] = [];
  const seenProductIds = new Set<number>();

  for (const rawItem of rawItems) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return null;
    }

    const { product_id: productId, expected_quantity: expectedQuantity } = rawItem as {
      product_id?: unknown;
      expected_quantity?: unknown;
    };

    if (typeof productId !== "number" || !Number.isSafeInteger(productId) || productId <= 0) {
      return null;
    }
    if (
      typeof expectedQuantity !== "number" ||
      !Number.isSafeInteger(expectedQuantity) ||
      expectedQuantity <= 0
    ) {
      return null;
    }
    if (seenProductIds.has(productId)) {
      return null;
    }

    seenProductIds.add(productId);
    items.push({ product_id: productId, expected_quantity: expectedQuantity });
  }

  return items;
}

/**
 * Memvalidasi array item payload penerimaan.
 *
 * @param rawItems - Nilai `items` mentah dari body request.
 * @returns Daftar item valid, atau `null` jika ada item/duplikasi tidak valid.
 */
function validateReceiveItems(rawItems: unknown): ReceiveItemInput[] | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const items: ReceiveItemInput[] = [];
  const seenProductIds = new Set<number>();

  for (const rawItem of rawItems) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return null;
    }

    const { product_id: productId, quantity_received: quantityReceived } = rawItem as {
      product_id?: unknown;
      quantity_received?: unknown;
    };

    if (typeof productId !== "number" || !Number.isSafeInteger(productId) || productId <= 0) {
      return null;
    }
    if (
      typeof quantityReceived !== "number" ||
      !Number.isSafeInteger(quantityReceived) ||
      quantityReceived <= 0
    ) {
      return null;
    }
    if (seenProductIds.has(productId)) {
      return null;
    }

    seenProductIds.add(productId);
    items.push({ product_id: productId, quantity_received: quantityReceived });
  }

  return items;
}

/**
 * Mengirim respons `500 INTERNAL_ERROR` standar tanpa membocorkan detail internal.
 *
 * @param res - Response HTTP ke klien.
 * @param logMessage - Pesan log server-side yang aman (tanpa rahasia/kredensial).
 * @returns void
 */
function sendInternalError(res: Response, logMessage: string): void {
  console.error(logMessage);
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan pada server.",
  });
}

/**
 * Menangani error service pembuatan dokumen dan memetakannya ke respons HTTP.
 *
 * @param res - Response HTTP ke klien.
 * @param error - Error yang dilempar service.
 * @returns `true` jika error sudah dipetakan, `false` jika bukan error yang dikenal.
 */
function handleCreateError(res: Response, error: unknown): boolean {
  if (error instanceof DocumentNumberAlreadyExistsError) {
    res.status(409).json({
      success: false,
      code: "DOCUMENT_NUMBER_ALREADY_EXISTS",
      message: "Nomor dokumen sudah digunakan.",
    });
    return true;
  }

  if (error instanceof ProductNotFoundError) {
    res.status(404).json({
      success: false,
      code: "NOT_FOUND",
      message: "Produk tidak ditemukan.",
    });
    return true;
  }

  if (error instanceof DuplicateProductError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Produk tidak boleh muncul lebih dari sekali dalam satu dokumen.",
    });
    return true;
  }

  return false;
}

/**
 * Handler untuk `GET /api/receiving-documents`.
 *
 * Mengembalikan daftar seluruh dokumen penerimaan untuk pengguna terautentikasi.
 *
 * @param req - Request HTTP dari klien.
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200` atau `500`.
 */
export async function listReceivingDocuments(req: Request, res: Response): Promise<void> {
  try {
    const documents = await listReceivingDocumentsService();
    res.status(200).json({ success: true, data: documents });
  } catch {
    sendInternalError(res, "Receiving document listing failed");
  }
}

/**
 * Handler untuk `GET /api/receiving-documents/:id`.
 *
 * Mengembalikan detail dokumen beserta item dan progres penerimaannya.
 *
 * @param req - Request HTTP dari klien (parameter `id`).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200`, `400`, `404`, atau `500`.
 */
export async function getReceivingDocument(req: Request, res: Response): Promise<void> {
  const id = parsePositiveId(req.params.id);
  if (id === null) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "ID dokumen tidak valid.",
    });
    return;
  }

  try {
    const document = await getReceivingDocumentService(id);
    if (!document) {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Dokumen tidak ditemukan.",
      });
      return;
    }

    res.status(200).json({ success: true, data: document });
  } catch {
    sendInternalError(res, "Receiving document lookup failed");
  }
}

/**
 * Handler untuk `POST /api/receiving-documents` (Supervisor).
 *
 * Memvalidasi nomor dokumen dan item, lalu membuat dokumen `DRAFT` dengan
 * kuantitas diterima nol tanpa mengubah stok.
 *
 * @param req - Request HTTP dari klien (body berisi document_number dan items).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `201`, `400`, `404`, `409`, atau `500`.
 */
export async function createReceivingDocument(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { document_number?: unknown; items?: unknown };
  const documentNumber =
    typeof body.document_number === "string" ? body.document_number.trim() : "";
  const items = validateItems(body.items);

  if (documentNumber.length === 0 || documentNumber.length > 100 || !items) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Nomor dokumen dan item wajib valid.",
    });
    return;
  }

  const createdBy = req.user?.id;
  if (typeof createdBy !== "number" || !Number.isSafeInteger(createdBy) || createdBy <= 0) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Token tidak valid atau kedaluwarsa.",
    });
    return;
  }

  try {
    const document = await createReceivingDocumentService(
      { document_number: documentNumber, items },
      createdBy,
    );
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    if (handleCreateError(res, error)) {
      return;
    }
    sendInternalError(res, "Receiving document creation failed");
  }
}

/**
 * Handler untuk `POST /api/receiving-documents/:id/receive` (Operator).
 *
 * Memvalidasi ID dokumen dan payload item, lalu mencatat penerimaan secara
 * atomik. Over-receiving, produk asing/duplikat, atau status dokumen yang
 * tertutup ditolak tanpa mengubah data apa pun.
 *
 * @param req - Request HTTP dari klien (parameter `id`, body berisi items).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200`, `400`, `404`, atau `500`.
 */
export async function receiveReceivingDocument(req: Request, res: Response): Promise<void> {
  const id = parsePositiveId(req.params.id);
  if (id === null) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "ID dokumen tidak valid.",
    });
    return;
  }

  const body = (req.body ?? {}) as { items?: unknown };
  const items = validateReceiveItems(body.items);
  if (!items) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Item penerimaan wajib valid dan tidak duplikat.",
    });
    return;
  }

  try {
    const document = await receiveDocumentItemsService(id, items);
    res.status(200).json({ success: true, data: document });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Dokumen tidak ditemukan.",
      });
      return;
    }

    if (error instanceof InvalidDocumentStatusError) {
      res.status(400).json({
        success: false,
        code: "INVALID_DOCUMENT_STATUS",
        message: "Dokumen tidak menerima penerimaan pada status saat ini.",
      });
      return;
    }

    if (error instanceof ProductNotInDocumentError) {
      res.status(400).json({
        success: false,
        code: "PRODUCT_NOT_IN_DOCUMENT",
        message: "Produk bukan bagian dari dokumen.",
      });
      return;
    }

    if (error instanceof OverReceivingExceededError) {
      res.status(400).json({
        success: false,
        code: "OVER_RECEIVING_EXCEEDED",
        message: "Kuantitas penerimaan melebihi sisa kuantitas harapan.",
      });
      return;
    }

    if (error instanceof DuplicateProductError) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Produk tidak boleh muncul lebih dari sekali dalam satu payload.",
      });
      return;
    }

    sendInternalError(res, "Receiving document receive failed");
  }
}

/**
 * Handler untuk `POST /api/receiving-documents/:id/cancel` (Supervisor).
 *
 * Hanya dokumen berstatus `DRAFT` yang dapat dibatalkan.
 *
 * @param req - Request HTTP dari klien (parameter `id`).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200`, `400`, `404`, atau `500`.
 */
export async function cancelReceivingDocument(req: Request, res: Response): Promise<void> {
  const id = parsePositiveId(req.params.id);
  if (id === null) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "ID dokumen tidak valid.",
    });
    return;
  }

  try {
    const document = await cancelReceivingDocumentService(id);
    res.status(200).json({ success: true, data: document });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Dokumen tidak ditemukan.",
      });
      return;
    }

    if (error instanceof InvalidDocumentStatusError) {
      res.status(400).json({
        success: false,
        code: "INVALID_DOCUMENT_STATUS",
        message: "Hanya dokumen DRAFT yang dapat dibatalkan.",
      });
      return;
    }

    sendInternalError(res, "Receiving document cancellation failed");
  }
}
