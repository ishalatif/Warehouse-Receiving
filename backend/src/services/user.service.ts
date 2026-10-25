import bcrypt from "bcryptjs";
import { getPool } from "../config/db";

/**
 * Role pengguna yang didukung sistem.
 */
export type UserRole = "OPERATOR" | "SUPERVISOR";

/**
 * Biaya bcrypt yang dipakai saat membuat hash password pengguna baru.
 */
const BCRYPT_COST = 12;

/**
 * Panjang minimum password yang diterima untuk akun baru.
 */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Batas maksimum password dalam byte; bcrypt mengabaikan byte setelah 72.
 */
const PASSWORD_MAX_BYTES = 72;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 255;

/**
 * Input pembuatan akun pengguna.
 */
export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Data pengguna yang aman dikembalikan setelah pembuatan akun.
 */
export interface CreatedUser {
  id: number;
  email: string;
  role: UserRole;
}

/**
 * Error validasi input pembuatan akun.
 */
export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

/**
 * Error ketika email sudah terdaftar.
 */
export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email ${email} sudah terdaftar.`);
    this.name = "EmailAlreadyExistsError";
  }
}

/**
 * Memvalidasi input pembuatan akun tanpa menyentuh database.
 *
 * Email dinormalisasi menjadi huruf kecil dan di-trim. Password tidak
 * di-trim karena spasi di awal/akhir adalah karakter yang sah.
 *
 * @param input - Input mentah pembuatan akun.
 * @returns Input yang sudah dinormalisasi.
 * @throws {UserValidationError} Jika email, role, atau password tidak valid.
 */
export function validateNewUser(input: CreateUserInput): CreateUserInput {
  const email = input.email.trim().toLowerCase();
  const role = input.role;
  const password = input.password;

  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(email)) {
    throw new UserValidationError("Email tidak valid.");
  }
  if (role !== "OPERATOR" && role !== "SUPERVISOR") {
    throw new UserValidationError("Role harus OPERATOR atau SUPERVISOR.");
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new UserValidationError(
      `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`,
    );
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new UserValidationError(`Password maksimal ${PASSWORD_MAX_BYTES} byte.`);
  }

  return { email, role, password };
}

/**
 * Membuat akun pengguna baru dengan password yang di-hash bcrypt.
 *
 * Tidak ada nilai default untuk email, password, maupun role: seluruh nilai
 * wajib diberikan pemanggil. Query menggunakan parameter terikat sehingga
 * tidak ada interpolasi input ke SQL.
 *
 * @param input - Email, password, dan role pengguna baru.
 * @returns Data pengguna yang dibuat (tanpa hash password).
 * @throws {UserValidationError} Jika input tidak valid.
 * @throws {EmailAlreadyExistsError} Jika email sudah terdaftar.
 * @throws Error jika operasi database gagal.
 */
export async function createUserAccount(input: CreateUserInput): Promise<CreatedUser> {
  const { email, password, role } = validateNewUser(input);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const { rows } = await getPool().query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id::int AS id, email, role`,
      [email, passwordHash, role],
    );
    return rows[0] as CreatedUser;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new EmailAlreadyExistsError(email);
    }
    throw error;
  }
}
