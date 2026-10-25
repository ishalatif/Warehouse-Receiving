"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, createDocument, getProducts } from "@/lib/api";
import { canCreateDocuments } from "@/lib/permissions";
import { useCurrentSession } from "@/lib/use-session";
import {
  parsePositiveInteger,
  validateDocumentDraft,
  type DraftRowInput,
  type FieldErrors,
} from "@/lib/validation";
import type { Product } from "@/lib/types";
import { ErrorAlert, Loading, PageHeader } from "@/components/ui";

/**
 * Halaman pembuatan dokumen penerimaan (khusus Supervisor).
 *
 * @returns Elemen form dokumen baru.
 */
export default function NewDocumentPage() {
  const router = useRouter();
  const session = useCurrentSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [rows, setRows] = useState<DraftRowInput[]>([
    { product_id: "", expected_quantity: "" },
  ]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Memuat produk untuk pilihan item.
   *
   * @returns Promise<void>
   */
  const loadProducts = useCallback(async (): Promise<void> => {
    setLoadingProducts(true);
    setLoadError(null);
    try {
      setProducts(await getProducts());
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : "Gagal memuat produk.",
      );
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  /**
   * Mengubah nilai satu baris item.
   *
   * @param index - Indeks baris.
   * @param field - Field yang diubah.
   * @param value - Nilai baru.
   * @returns void
   */
  const updateRow = (index: number, field: keyof DraftRowInput, value: string): void => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  /**
   * Menambah baris item kosong.
   *
   * @returns void
   */
  const addRow = (): void => {
    setRows((current) => [...current, { product_id: "", expected_quantity: "" }]);
  };

  /**
   * Menghapus satu baris item.
   *
   * @param index - Indeks baris yang dihapus.
   * @returns void
   */
  const removeRow = (index: number): void => {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  /**
   * Menangani submit pembuatan dokumen.
   *
   * @param event - Event submit form.
   * @returns Promise<void>
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setApiError(null);

    const validationErrors = validateDocumentDraft(documentNumber, rows);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const items = rows.map((row) => ({
      product_id: parsePositiveInteger(row.product_id) as number,
      expected_quantity: parsePositiveInteger(row.expected_quantity) as number,
    }));

    setSubmitting(true);
    try {
      const created = await createDocument({
        document_number: documentNumber.trim(),
        items,
      });
      router.push(`/documents/${created.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "DOCUMENT_NUMBER_ALREADY_EXISTS") {
          setApiError("Nomor dokumen sudah digunakan. Gunakan nomor lain.");
        } else if (error.code === "NOT_FOUND") {
          setApiError("Salah satu produk tidak ditemukan. Muat ulang halaman.");
        } else {
          setApiError(error.message);
        }
      } else {
        setApiError("Gagal membuat dokumen.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (session && !canCreateDocuments(session.user.role)) {
    return (
      <div>
        <PageHeader
          title="Buat Dokumen"
          description="Pembuatan dokumen hanya dapat dilakukan Supervisor."
        />
        <div className="card p-6 text-sm text-slate-600">
          Akun Anda tidak memiliki akses untuk membuat dokumen. Kembali ke{" "}
          <Link href="/documents" className="font-semibold text-brand-700 hover:underline">
            daftar dokumen
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Buat Dokumen Penerimaan"
        description="Dokumen baru berstatus DRAFT dan belum mengubah stok."
      />

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {loadError ? <ErrorAlert message={loadError} /> : null}
        {apiError ? <ErrorAlert message={apiError} /> : null}

        <div className="card space-y-5 p-5">
          <div className="max-w-md">
            <label htmlFor="document-number" className="label">
              Nomor Dokumen
            </label>
            <input
              id="document-number"
              className="input"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errors.document_number)}
              placeholder="Contoh: DO-2026-001"
            />
            {errors.document_number ? (
              <p className="field-error">{errors.document_number}</p>
            ) : null}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Item Dokumen</h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={addRow}
                disabled={submitting}
              >
                Tambah Item
              </button>
            </div>

            {errors.items ? <p className="field-error mb-2">{errors.items}</p> : null}

            {loadingProducts ? (
              <Loading label="Memuat produk..." />
            ) : products.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Belum ada produk. Tambahkan produk terlebih dahulu di halaman katalog.
              </p>
            ) : (
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_180px_auto]"
                  >
                    <div>
                      <label htmlFor={`product-${index}`} className="label">
                        Produk
                      </label>
                      <select
                        id={`product-${index}`}
                        className="input"
                        value={row.product_id}
                        onChange={(event) =>
                          updateRow(index, "product_id", event.target.value)
                        }
                        disabled={submitting}
                      >
                        <option value="">Pilih produk</option>
                        {products.map((product) => (
                          <option key={product.id} value={String(product.id)}>
                            {product.sku} — {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`quantity-${index}`} className="label">
                        Kuantitas Harapan
                      </label>
                      <input
                        id={`quantity-${index}`}
                        inputMode="numeric"
                        className="input"
                        value={row.expected_quantity}
                        onChange={(event) =>
                          updateRow(index, "expected_quantity", event.target.value)
                        }
                        disabled={submitting}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn-danger w-full sm:w-auto"
                        onClick={() => removeRow(index)}
                        disabled={submitting || rows.length === 1}
                      >
                        Hapus
                      </button>
                    </div>
                    {errors[`row-${index}`] ? (
                      <p className="field-error sm:col-span-3">
                        {errors[`row-${index}`]}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || loadingProducts || products.length === 0}
          >
            {submitting ? "Menyimpan..." : "Simpan Dokumen"}
          </button>
          <Link href="/documents" className="btn-secondary">
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
