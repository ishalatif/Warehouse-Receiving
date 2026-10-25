import type { RequestHandler } from "express";

/**
 * Membuat middleware CORS untuk satu origin browser yang diizinkan.
 *
 * Origin dibaca dari `CORS_ORIGIN`; jika tidak diset, middleware tidak
 * menambahkan header CORS (perilaku default pengembangan tanpa frontend
 * terpisah tetap sama). Hanya origin yang cocok yang diizinkan, bukan `*`,
 * sehingga token Bearer tidak dapat dipakai dari origin sembarang.
 *
 * @param allowedOrigin - Origin frontend yang diizinkan, misal `http://localhost:3000`.
 * @returns Middleware Express; no-op jika `allowedOrigin` kosong.
 */
export function createCorsMiddleware(
  allowedOrigin: string | undefined,
): RequestHandler {
  const origin = allowedOrigin?.trim();

  return (req, res, next): void => {
    if (!origin || req.headers.origin !== origin) {
      next();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
