import { Request, Response } from "express";
import {
  createProduct as createProductService,
  listProducts as listProductsService,
  SkuAlreadyExistsError,
} from "../services/product.service";

/**
 * Handler untuk `GET /api/products`.
 *
 * Mengembalikan katalog produk untuk pengguna terautentikasi.
 *
 * @param req - Request HTTP dari klien.
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200` atau `500`.
 */
export async function listProducts(req: Request, res: Response): Promise<void> {
  try {
    const products = await listProductsService();
    res.status(200).json({ success: true, data: products });
  } catch {
    console.error("Product listing failed");
    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Terjadi kesalahan pada server.",
    });
  }
}

/**
 * Handler untuk `POST /api/products` (Supervisor).
 *
 * Memvalidasi SKU/nama (wajib, setelah trim), memanggil service pembuatan
 * produk, dan mengembalikan produk baru dengan stok awal nol. SKU duplikat
 * (termasuk perbedaan kapitalisasi) menghasilkan `409 SKU_ALREADY_EXISTS`.
 *
 * @param req - Request HTTP dari klien (body berisi sku, name, description opsional).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `201`, `400`, `409`, atau `500`.
 */
export async function createProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as {
    sku?: unknown;
    name?: unknown;
    description?: unknown;
  };
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description : null;
  const isDescriptionValid =
    body.description === undefined ||
    body.description === null ||
    typeof body.description === "string";

  if (
    sku.length === 0 ||
    sku.length > 100 ||
    name.length === 0 ||
    name.length > 255 ||
    !isDescriptionValid
  ) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "SKU dan nama wajib valid.",
    });
    return;
  }

  try {
    const product = await createProductService({ sku, name, description });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    if (error instanceof SkuAlreadyExistsError) {
      res.status(409).json({
        success: false,
        code: "SKU_ALREADY_EXISTS",
        message: "SKU sudah digunakan.",
      });
      return;
    }

    console.error("Product creation failed");
    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Terjadi kesalahan pada server.",
    });
  }
}
