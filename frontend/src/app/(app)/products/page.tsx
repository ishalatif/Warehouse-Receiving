"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, createProduct, getProducts } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canManageProducts } from "@/lib/permissions";
import { useCurrentSession } from "@/lib/use-session";
import { validateProductInput, type FieldErrors } from "@/lib/validation";
import type { Product } from "@/lib/types";
import {
  EmptyState,
  ErrorAlert,
  Loading,
  PageHeader,
  SuccessAlert,
} from "@/components/ui";

/**
 * Halaman katalog produk dengan form pembuatan untuk Supervisor.
 *
 * @returns Elemen halaman katalog.
 */
export default function ProductsPage() {
  const session = useCurrentSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Memuat katalog produk dari API.
   *
   * @returns Promise<void>
   */
  const loadProducts = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      setProducts(await getProducts());
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Gagal memuat katalog produk.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  /**
   * Mereset dan menutup form produk.
   *
   * @returns void
   */
  const resetForm = (): void => {
    setSku("");
    setName("");
    setDescription("");
    setErrors({});
    setFormError(null);
    setShowForm(false);
  };

  /**
   * Menangani submit pembuatan produk.
   *
   * @param event - Event submit form.
   * @returns Promise<void>
   */
  const handleCreate = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const validationErrors = validateProductInput(sku, name);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await createProduct({
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
      });
      setProducts((current) => [...current, created]);
      setSuccess(`Produk ${created.sku} berhasil dibuat dengan stok awal 0.`);
      resetForm();
    } catch (error) {
      if (error instanceof ApiError && error.code === "SKU_ALREADY_EXISTS") {
        setFormError("SKU sudah digunakan. Gunakan SKU lain.");
      } else {
        setFormError(
          error instanceof ApiError ? error.message : "Gagal membuat produk.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Katalog Produk"
        description="Daftar produk yang dapat dimasukkan ke dokumen penerimaan."
        action={
          session && canManageProducts(session.user.role) ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowForm((current) => !current)}
            >
              {showForm ? "Tutup Form" : "Tambah Produk"}
            </button>
          ) : null
        }
      />

      <div className="space-y-5">
        <SuccessAlert message={success} />
        {loadError ? <ErrorAlert message={loadError} /> : null}

        {showForm ? (
          <form
            onSubmit={handleCreate}
            className="card space-y-4 p-5"
            noValidate
          >
            <h2 className="text-base font-semibold text-ink">Produk Baru</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sku" className="label">
                  SKU
                </label>
                <input
                  id="sku"
                  className="input"
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.sku)}
                  placeholder="Contoh: SKU-001"
                />
                {errors.sku ? (
                  <p className="field-error">{errors.sku}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="product-name" className="label">
                  Nama Produk
                </label>
                <input
                  id="product-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.name)}
                  placeholder="Nama produk"
                />
                {errors.name ? (
                  <p className="field-error">{errors.name}</p>
                ) : null}
              </div>
            </div>
            <div>
              <label htmlFor="product-description" className="label">
                Deskripsi{" "}
                <span className="font-normal text-slate-400">(opsional)</span>
              </label>
              <textarea
                id="product-description"
                className="input min-h-20"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={submitting}
              />
            </div>
            <ErrorAlert message={formError} />
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Menyimpan..." : "Simpan Produk"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Batal
              </button>
            </div>
          </form>
        ) : null}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="px-4">
              <Loading />
            </div>
          ) : products.length === 0 ? (
            <EmptyState message="Belum ada produk. Supervisor dapat menambahkan produk baru." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nama</th>
                    <th>Deskripsi</th>
                    <th>Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="font-mono text-xs font-semibold text-slate-900">
                        {product.sku}
                      </td>
                      <td className="font-medium text-slate-900">
                        {product.name}
                      </td>
                      <td className="text-slate-500">
                        {product.description ?? "-"}
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(product.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
