"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, login } from "@/lib/api";
import { readSession, saveSession } from "@/lib/session";
import { validateLogin, type FieldErrors } from "@/lib/validation";
import { ErrorAlert } from "@/components/ui";

/**
 * Halaman login.
 *
 * Memvalidasi input, memanggil API login, menyimpan sesi, lalu mengarahkan ke
 * katalog. Tidak ada pendaftaran publik atau kredensial bawaan.
 *
 * @returns Elemen halaman login.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (readSession()) {
      router.replace("/products");
    }
  }, [router]);

  /**
   * Menangani submit form login.
   *
   * @param event - Event submit form.
   * @returns Promise<void>
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setApiError(null);

    const validationErrors = validateLogin(email, password);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      saveSession({ token: result.token, user: result.user });
      router.replace("/products");
    } catch (error) {
      setApiError(
        error instanceof ApiError ? error.message : "Login gagal. Silakan coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink px-12 py-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 font-bold">
            WR
          </span>
          <span className="text-sm font-semibold tracking-wide">Warehouse Receiving System</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Penerimaan barang yang rapi, stok yang bisa dipercaya.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Catat penerimaan, pantau progres dokumen, dan telusuri riwayat stok dalam satu
            tempat. Setiap perubahan stok tercatat atomik oleh backend.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Akses hanya untuk pengguna terdaftar. Hubungi Supervisor bila belum memiliki akun.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 font-bold text-white">
              WR
            </span>
            <h1 className="mt-4 text-2xl font-bold text-ink">Warehouse Receiving System</h1>
          </div>

          <h2 className="text-2xl font-bold text-ink">Masuk ke akun Anda</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gunakan akun yang diberikan oleh Supervisor.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {apiError ? <ErrorAlert message={apiError} /> : null}

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email ? <p className="field-error">{errors.email}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? <p className="field-error">{errors.password}</p> : null}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
