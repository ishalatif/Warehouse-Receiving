import { Request, Response } from "express";
import { login as loginService, LoginResult } from "../services/auth.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Handler untuk `POST /api/auth/login`.
 *
 * Validasi input (email dan password), memanggil service autentikasi, dan
 * mengembalikan token JWT serta data user (tanpa password hash) pada sukses.
 * Jika service gagal, handler mengembalikan error standar `500 INTERNAL_ERROR`.
 * Jika kredensial tidak valid, handler mengembalikan `401 UNAUTHORIZED`.
 *
 * @param req - Request HTTP dari klien (body berisi email dan password).
 * @param res - Response HTTP ke klien.
 * @returns Promise<void> membentuk respons `200`, `400`, `401`, atau `500`.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const isValidEmail =
    email.length > 0 && email.length <= 255 && EMAIL_REGEX.test(email);
  const isValidPassword = password.length > 0;

  if (!isValidEmail || !isValidPassword) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Email dan password wajib valid.",
    });
    return;
  }

  try {
    const result: LoginResult | null = await loginService(email, password);

    if (!result) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Email atau password salah.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { token: result.token, user: result.user },
    });
  } catch {
    console.error("Login service failed");
    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Terjadi kesalahan pada server.",
    });
  }
}
