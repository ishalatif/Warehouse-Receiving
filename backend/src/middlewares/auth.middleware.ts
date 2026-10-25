import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env";

/**
 * Data pengguna yang disematkan pada request setelah token tervalidasi.
 */
export interface AuthUser {
  id: number;
  email: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * Middleware autentikasi JWT.
 *
 * Membaca token Bearer dari header `Authorization`, memverifikasi signature dan
 * masa berlaku dengan secret dari environment, serta memvalidasi klaim
 * `sub`/`id`, `email`, dan `role` pada token. Token yang kehilangan atau
 * memiliki klaim yang tidak valid, tidak dapat diproses, atau kedaluwarsa
 * mengembalikan `401`.
 *
 * @param req - Request HTTP dari klien (header authorization).
 * @param res - Response HTTP ke klien.
 * @param next - Callback untuk melanjutkan ke handler berikutnya.
 */
export const authenticate: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Token tidak ada.",
    });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as jwt.JwtPayload & {
      sub?: number;
      email?: string;
      role?: string;
    };

    const sub = decoded.sub;
    const email = decoded.email;
    const role = decoded.role;

    const isValidSub = typeof sub === "number" && sub > 0;
    const isValidEmail = typeof email === "string" && email.length > 0;
    const isValidRole = role === "OPERATOR" || role === "SUPERVISOR";

    if (!isValidSub || !isValidEmail || !isValidRole) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Token tidak valid atau kedaluwarsa.",
      });
      return;
    }

    req.user = { id: sub, email, role };
    next();
  } catch {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Token tidak valid atau kedaluwarsa.",
    });
  }
};

/**
 * Factory middleware pengecekan role.
 *
 * Memerlukan token tervalidasi terlebih dahulu (melalui `authenticate`);
 * jika role pada token tidak termasuk dalam role yang diizinkan, mengembalikan `403`.
 *
 * @param roles - Daftar role yang diizinkan untuk operasi.
 * @returns Handler middleware pengecekan role.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Token tidak valid atau kedaluwarsa.",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Role tidak memiliki akses untuk operasi ini.",
      });
      return;
    }

    next();
  };
}
