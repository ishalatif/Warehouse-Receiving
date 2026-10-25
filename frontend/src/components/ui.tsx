import type { DocumentStatus } from "@/lib/types";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "Diproses",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

/**
 * Menampilkan badge status dokumen.
 *
 * @param props.status - Status dokumen.
 * @returns Elemen badge.
 */
export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Menampilkan pesan error API/form.
 *
 * @param props.message - Pesan yang ditampilkan; tidak dirender jika kosong.
 * @returns Elemen alert atau `null`.
 */
export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

/**
 * Menampilkan pesan sukses.
 *
 * @param props.message - Pesan yang ditampilkan; tidak dirender jika kosong.
 * @returns Elemen alert atau `null`.
 */
export function SuccessAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      {message}
    </div>
  );
}

/**
 * Indikator loading sederhana.
 *
 * @param props.label - Teks yang ditampilkan di samping spinner.
 * @returns Elemen loading.
 */
export function Loading({ label = "Memuat data..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
      />
      {label}
    </div>
  );
}

/**
 * Keadaan kosong untuk tabel/daftar.
 *
 * @param props.message - Pesan keadaan kosong.
 * @returns Elemen keadaan kosong.
 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-slate-500">{message}</div>
  );
}

/**
 * Header halaman dengan judul dan deskripsi.
 *
 * @param props.title - Judul halaman.
 * @param props.description - Deskripsi singkat.
 * @param props.action - Aksi opsional di sisi kanan.
 * @returns Elemen header.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
