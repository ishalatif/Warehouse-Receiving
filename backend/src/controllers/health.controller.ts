import { Request, Response } from "express";
import type { HealthCheckFn, HealthResponse } from "../services/health.service";

const HEALTH_CHECK_FAILED_MESSAGE = "Backend tidak siap atau koneksi database tidak tersedia.";

/**
 * Membuat controller untuk endpoint kesehatan aplikasi.
 *
 * Controller memanggil fungsi pemeriksa kesehatan yang diberikan dan mengembalikan
 * respons standar. Jika pemeriksaan gagal, controller mengembalikan error response
 * standar tanpa membocorkan detail internal ke klien.
 *
 * @param check - Fungsi pemeriksa kesiapan aplikasi/database.
 * @returns Object berisi handler `getHealth`.
 */
export function createHealthController(check: HealthCheckFn) {
  /**
   * Handler untuk `GET /api/health`.
   *
   * @param req - Request HTTP dari klien.
   * @param res - Response HTTP ke klien.
   * @returns Promise void; jika pemeriksaan berhasil kirim `200`, jika gagal kirim `503`.
   */
  const getHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const health: HealthResponse = await check();
      res.status(200).json(health);
    } catch {
      console.error("Health check failed");
      res.status(503).json({
        success: false,
        code: "HEALTH_CHECK_FAILED",
        message: HEALTH_CHECK_FAILED_MESSAGE,
      });
    }
  };

  return { getHealth };
}
