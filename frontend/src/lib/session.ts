import type { Role, Session } from "./types";

const STORAGE_KEY = "wrs.session";
const ROLES: Role[] = ["OPERATOR", "SUPERVISOR"];

/**
 * Memeriksa apakah nilai merupakan role yang dikenal.
 *
 * @param value - Nilai yang diperiksa.
 * @returns `true` jika nilai adalah `OPERATOR` atau `SUPERVISOR`.
 */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

/**
 * Membaca sesi dari `localStorage` dengan validasi bentuk data.
 *
 * Data yang tidak valid diabaikan agar UI tidak memakai sesi rusak. Ini hanya
 * kenyamanan UI; otorisasi tetap ditentukan backend.
 *
 * @returns Sesi valid, atau `null` jika tidak ada/tidak valid.
 */
export function readSession(): Session | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      token?: unknown;
      user?: { id?: unknown; email?: unknown; role?: unknown };
    };

    if (typeof parsed.token !== "string" || parsed.token.length === 0) {
      return null;
    }
    if (
      !parsed.user ||
      typeof parsed.user.id !== "number" ||
      !Number.isSafeInteger(parsed.user.id) ||
      parsed.user.id <= 0 ||
      typeof parsed.user.email !== "string" ||
      parsed.user.email.length === 0 ||
      !isRole(parsed.user.role)
    ) {
      return null;
    }

    return {
      token: parsed.token,
      user: {
        id: parsed.user.id,
        email: parsed.user.email,
        role: parsed.user.role,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Menyimpan sesi ke `localStorage`.
 *
 * @param session - Token dan data user hasil login.
 * @returns void
 */
export function saveSession(session: Session): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Menghapus sesi dari `localStorage`.
 *
 * @returns void
 */
export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Mengambil token aktif dari sesi tersimpan.
 *
 * @returns Token JWT, atau `null` jika tidak ada sesi valid.
 */
export function getToken(): string | null {
  return readSession()?.token ?? null;
}
