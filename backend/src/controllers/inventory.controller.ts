import { Request, Response } from "express";
import {
  listInventory as listInventoryService,
  listInventoryTransactions as listInventoryTransactionsService,
} from "../services/inventory.service";

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
 * Handler untuk `GET /api/inventory`.
 *
 * Mengembalikan saldo stok per produk untuk pengguna terautentikasi
 * (Operator maupun Supervisor).
 *
 * @param req - Request HTTP dari klien.
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200` atau `500`.
 */
export async function listInventory(req: Request, res: Response): Promise<void> {
  try {
    const inventory = await listInventoryService();
    res.status(200).json({ success: true, data: inventory });
  } catch {
    sendInternalError(res, "Inventory listing failed");
  }
}

/**
 * Handler untuk `GET /api/inventory/transactions`.
 *
 * Mengembalikan riwayat transaksi stok (ledger penerimaan) untuk pengguna
 * terautentikasi (Operator maupun Supervisor).
 *
 * @param req - Request HTTP dari klien.
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200` atau `500`.
 */
export async function listInventoryTransactions(req: Request, res: Response): Promise<void> {
  try {
    const transactions = await listInventoryTransactionsService();
    res.status(200).json({ success: true, data: transactions });
  } catch {
    sendInternalError(res, "Inventory transaction listing failed");
  }
}
