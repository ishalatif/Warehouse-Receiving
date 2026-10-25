import { getPool } from "../config/db";

/**
 * Respons kesehatan aplikasi setelah pemeriksaan database berhasil.
 */
export interface HealthResponse {
  status: "ok";
  database: "ready";
}

/**
 * Fungsi pemeriksa kesiapan aplikasi/database.
 */
export type HealthCheckFn = () => Promise<HealthResponse>;

/**
 * Memeriksa kesiapan database PostgreSQL (query `SELECT 1`).
 *
 * @returns Promise `HealthResponse` dengan status `ok` dan database `ready`
 *          setelah koneksi database berhasil.
 * @throws Error jika pemeriksaan database gagal.
 */
async function pingDatabase(): Promise<HealthResponse> {
  const pool = getPool();
  await pool.query("SELECT 1");
  return { status: "ok", database: "ready" };
}

/**
 * Fungsi pemeriksa kesiapan aplikasi untuk endpoint health.
 * Default-nya memeriksa database melalui `pingDatabase`.
 */
export const checkHealth: HealthCheckFn = () => pingDatabase();
