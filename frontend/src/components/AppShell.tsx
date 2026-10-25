"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roleLabel } from "@/lib/api";
import { clearSession, readSession } from "@/lib/session";
import type { Session } from "@/lib/types";
import { Loading } from "./ui";

const NAV_ITEMS = [
  { href: "/products", label: "Katalog Produk" },
  { href: "/documents", label: "Dokumen" },
  { href: "/inventory", label: "Stok" },
  { href: "/history", label: "Riwayat" },
];

/**
 * Kerangka aplikasi: penjaga sesi klien, navigasi role-aware, dan logout.
 *
 * Penjagaan di sini hanya untuk pengalaman pengguna; backend tetap menjadi
 * sumber otorisasi sebenarnya.
 *
 * @param props.children - Konten halaman.
 * @returns Elemen shell aplikasi.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const stored = readSession();
    if (!stored) {
      router.replace("/login");
      setSession(null);
      return;
    }
    setSession(stored);
  }, [router]);

  /**
   * Menghapus sesi lokal dan kembali ke halaman login.
   *
   * @returns void
   */
  const handleLogout = (): void => {
    clearSession();
    router.replace("/login");
  };

  if (session === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Loading label="Memeriksa sesi..." />
      </div>
    );
  }

  if (session === null) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/products" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              WR
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight text-ink">
                Warehouse Receiving
              </span>
              <span className="block text-xs text-slate-500">Sistem penerimaan barang</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{session.user.email}</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {roleLabel(session.user.role)}
            </span>
            <button type="button" onClick={handleLogout} className="btn-secondary">
              Keluar
            </button>
          </div>
        </div>

        <nav aria-label="Navigasi utama" className="mx-auto max-w-6xl px-4">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`inline-block border-b-2 px-3 py-3 text-sm font-medium transition ${
                      active
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
