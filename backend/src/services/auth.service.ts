import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env";
import { getPool } from "../config/db";

/**
 * JWT token lifetime yang digunakan untuk token access.
 * Ditetapkan 1 jam karena spesifikasi belum menetapkan nilai expires token.
 */
const TOKEN_EXPIRY = "1h";

/**
 * Data pengguna yang aman untuk dikembalikan ke klien (tanpa password hash).
 */
export interface AuthUserData {
  id: number;
  email: string;
  role: string;
}

/**
 * Hasil kegagalan autentikasi disimulasikan dengan nilai `null`
 * sehingga controller dapat menentukan respons HTTP yang tepat.
 */
export interface LoginResult {
  token: string;
  user: AuthUserData;
}

/**
 * Memvalidasi kredensial user dan menerbitkan JWT.
 *
 * User dicari dari database dengan query terparameterisasi; password
 * diverifikasi dengan bcrypt; token JWT ditandatangani dengan secret
 * dari environment.
 *
 * @param email - Email user yang akan diautentikasi.
 * @param password - Password yang akan diverifikasi.
 * @returns Promise<LoginResult | null> berisi token dan data user jika kredensial valid;
 *          `null` jika email atau password salah.
 * @throws Error jika query database gagal.
 */
export async function login(email: string, password: string): Promise<LoginResult | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id::int AS id, email, password_hash, role FROM users WHERE email = $1",
    [email],
  );

  const user = rows[0] as
    | { id: number; email: string; password_hash: string; role: string }
    | undefined;

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return null;
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    getEnv().JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY },
  );

  return { token, user: { id: user.id, email: user.email, role: user.role } };
}
