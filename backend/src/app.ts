import express from "express";
import type { Express } from "express";
import { checkHealth } from "./services/health.service";
import { createHealthController } from "./controllers/health.controller";
import { login } from "./controllers/auth.controller";
import { createProduct, listProducts } from "./controllers/product.controller";
import {
  listInventory,
  listInventoryTransactions,
} from "./controllers/inventory.controller";
import {
  cancelReceivingDocument,
  createReceivingDocument,
  getReceivingDocument,
  listReceivingDocuments,
  receiveReceivingDocument,
} from "./controllers/receiving-document.controller";
import { authenticate, requireRole } from "./middlewares/auth.middleware";
import { createCorsMiddleware } from "./middlewares/cors.middleware";
import type { HealthCheckFn, HealthResponse } from "./services/health.service";

/**
 * Membuat instance aplikasi Express untuk Warehouse Receiving System.
 *
 * Instance ini memuat middleware dasar (`express.json`), CORS opsional untuk
 * frontend terpisah (`CORS_ORIGIN`), route kesehatan
 * (`GET /api/health`), route autentikasi (`POST /api/auth/login`), route
 * katalog produk (`GET /api/products` dan `POST /api/products`), route
 * dokumen penerimaan, serta route stok dan riwayat transaksi yang sudah
 * dikaitkan dengan controller dan middleware yang sesuai. Instance aplikasi diciptakan
 * terpisah dari proses `app.listen` agar aplikasi dapat diuji tanpa membuka port
 * jaringan.
 *
 * @param check - Fungsi pemeriksa kesiapan aplikasi/database.
 *                Berfungsi default: `checkHealth`.
 * @returns Instance aplikasi Express yang siap digunakan.
 */
export function createApp(check: HealthCheckFn = checkHealth): Express {
  const app = express();
  app.use(createCorsMiddleware(process.env.CORS_ORIGIN));
  app.use(express.json());

  const { getHealth } = createHealthController(check);
  app.get("/api/health", getHealth);

  app.post("/api/auth/login", login);

  app.get("/api/products", authenticate, listProducts);
  app.post("/api/products", authenticate, requireRole("SUPERVISOR"), createProduct);

  app.get("/api/receiving-documents", authenticate, listReceivingDocuments);
  app.post(
    "/api/receiving-documents",
    authenticate,
    requireRole("SUPERVISOR"),
    createReceivingDocument,
  );
  app.get("/api/receiving-documents/:id", authenticate, getReceivingDocument);
  app.post(
    "/api/receiving-documents/:id/receive",
    authenticate,
    requireRole("OPERATOR"),
    receiveReceivingDocument,
  );
  app.post(
    "/api/receiving-documents/:id/cancel",
    authenticate,
    requireRole("SUPERVISOR"),
    cancelReceivingDocument,
  );

  app.get("/api/inventory", authenticate, listInventory);
  app.get("/api/inventory/transactions", authenticate, listInventoryTransactions);

  return app;
}
