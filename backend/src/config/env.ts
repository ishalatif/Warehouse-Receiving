/**
 * Validasi dan pembacaan konfigurasi environment aplikasi.
 */
export interface Env {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  DATABASE_URL: string;
}

/**
 * Error khusus saat validasi environment gagal.
 */
export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentValidationError";
  }
}

/**
 * Membaca dan memvalidasi konfigurasi environment aplikasi.
 *
 * Aturan:
 * - `JWT_SECRET` dan `DATABASE_URL` wajib diisi (tanpa nilai default).
 * - `PORT` wajib berupa integer antara 1 dan 65535 (default 5000).
 * - `NODE_ENV` default `development`.
 *
 * @returns Konfigurasi environment yang telah tervalidasi.
 * @throws {EnvironmentValidationError} Jika terdapat konfigurasi yang tidak valid
 *         atau wajib tidak tersedia.
 */
export function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  const rawPort = process.env.PORT;
  const port = rawPort === undefined ? 5000 : Number(rawPort);

  const jwtSecret = process.env.JWT_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (jwtSecret === undefined || jwtSecret.trim().length === 0) {
    throw new EnvironmentValidationError("Environment variable JWT_SECRET is required.");
  }
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new EnvironmentValidationError("Environment variable DATABASE_URL is required.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new EnvironmentValidationError(
      "Environment variable PORT must be an integer between 1 and 65535.",
    );
  }

  return { NODE_ENV: nodeEnv, PORT: port, JWT_SECRET: jwtSecret, DATABASE_URL: databaseUrl };
}
