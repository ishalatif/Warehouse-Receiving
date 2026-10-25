"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, cancelDocument, getDocument, receiveDocument } from "@/lib/api";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { canCancelDocuments, canReceiveGoods } from "@/lib/permissions";
import { useCurrentSession } from "@/lib/use-session";
import { parsePositiveInteger, validateReceiveInput, type FieldErrors } from "@/lib/validation";
import type { ReceivingDocumentDetail } from "@/lib/types";
import {
  ErrorAlert,
  Loading,
  PageHeader,
  StatusBadge,
  SuccessAlert,
} from "@/components/ui";

/**
 * Halaman detail dokumen dengan aksi penerimaan/pembatalan sesuai role.
 *
 * @returns Elemen halaman detail dokumen.
 */
export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const session = useCurrentSession();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const documentId = rawId ? parsePositiveInteger(rawId) : null;

  const [document, setDocument] = useState<ReceivingDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  /**
   * Memuat detail dokumen dari API.
   *
   * @returns Promise<void>
   */
  const loadDocument = useCallback(async (): Promise<void> => {
    if (documentId === null) {
      setLoading(false);
      setLoadError("ID dokumen tidak valid.");
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const detail = await getDocument(documentId);
      setDocument(detail);
      setQuantities(
        Object.fromEntries(detail.items.map((item) => [item.product_id, ""])),
      );
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : "Gagal memuat dokumen.",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  /**
   * Menangani pembatalan dokumen DRAFT.
   *
   * @returns Promise<void>
   */
  const handleCancel = async (): Promise<void> => {
    if (documentId === null) {
      return;
    }
    if (!window.confirm("Batalkan dokumen ini? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }

    setActionError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const updated = await cancelDocument(documentId);
      setDocument(updated);
      setSuccess("Dokumen berhasil dibatalkan.");
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "Gagal membatalkan dokumen.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Menangani submit penerimaan barang.
   *
   * @param event - Event submit form.
   * @returns Promise<void>
   */
  const handleReceive = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (documentId === null || !document) {
      return;
    }

    setActionError(null);
    setSuccess(null);

    const rows = document.items.map((item) => ({
      product_id: item.product_id,
      remaining: item.expected_quantity - item.received_quantity,
      quantity: quantities[item.product_id] ?? "",
    }));

    const validationErrors = validateReceiveInput(rows);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const items = rows
      .filter((row) => row.quantity.trim().length > 0)
      .map((row) => ({
        product_id: row.product_id,
        quantity_received: parsePositiveInteger(row.quantity) as number,
      }));

    setSubmitting(true);
    try {
      const updated = await receiveDocument(documentId, items);
      setDocument(updated);
      setQuantities(
        Object.fromEntries(updated.items.map((item) => [item.product_id, ""])),
      );
      setSuccess(
        updated.status === "COMPLETED"
          ? "Penerimaan dicatat. Seluruh item telah terpenuhi."
          : "Penerimaan berhasil dicatat. Stok telah diperbarui.",
      );
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "OVER_RECEIVING_EXCEEDED") {
          setActionError("Kuantitas melebihi sisa yang diharapkan. Periksa kembali.");
        } else if (error.code === "INVALID_DOCUMENT_STATUS") {
          setActionError("Dokumen sudah tidak menerima penerimaan.");
        } else if (error.code === "PRODUCT_NOT_IN_DOCUMENT") {
          setActionError("Produk tidak termasuk dalam dokumen ini.");
        } else {
          setActionError(error.message);
        }
      } else {
        setActionError("Gagal mencatat penerimaan.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading label="Memuat dokumen..." />;
  }

  if (loadError || !document) {
    return (
      <div>
        <PageHeader title="Detail Dokumen" description="Dokumen penerimaan." />
        <ErrorAlert message={loadError ?? "Dokumen tidak ditemukan."} />
        <Link href="/documents" className="btn-secondary mt-4">
          Kembali ke daftar
        </Link>
      </div>
    );
  }

  const role = session?.user.role;
  const canReceive = role ? canReceiveGoods(role) : false;
  const canCancel = role ? canCancelDocuments(role) : false;
  const isOpen = document.status === "DRAFT" || document.status === "IN_PROGRESS";

  return (
    <div>
      <PageHeader
        title={document.document_number}
        description={`Dibuat ${formatDateTime(document.created_at)} · Diperbarui ${formatDateTime(
          document.updated_at,
        )}`}
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/documents" className="btn-secondary">
              Kembali
            </Link>
            {canCancel && document.status === "DRAFT" ? (
              <button
                type="button"
                className="btn-danger"
                onClick={handleCancel}
                disabled={submitting}
              >
                Batalkan Dokumen
              </button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-5">
        <SuccessAlert message={success} />
        <ErrorAlert message={actionError} />

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-500">Status</span>
            <StatusBadge status={document.status} />
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produk</th>
                  <th className="text-right">Harapan</th>
                  <th className="text-right">Diterima</th>
                  <th className="text-right">Sisa</th>
                  <th>Progres</th>
                </tr>
              </thead>
              <tbody>
                {document.items.map((item) => {
                  const remaining = item.expected_quantity - item.received_quantity;
                  const percentage =
                    item.expected_quantity === 0
                      ? 0
                      : Math.min(
                          100,
                          Math.round((item.received_quantity / item.expected_quantity) * 100),
                        );
                  return (
                    <tr key={item.product_id}>
                      <td className="font-mono text-xs font-semibold text-slate-900">
                        {item.sku}
                      </td>
                      <td className="font-medium text-slate-900">{item.product_name}</td>
                      <td className="text-right">{formatQuantity(item.expected_quantity)}</td>
                      <td className="text-right">{formatQuantity(item.received_quantity)}</td>
                      <td className="text-right font-semibold">{formatQuantity(remaining)}</td>
                      <td className="min-w-32">
                        <div className="h-2 w-full rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-brand-600"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="mt-1 block text-xs text-slate-500">{percentage}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {canReceive && isOpen ? (
          <form onSubmit={handleReceive} className="card space-y-4 p-5" noValidate>
            <div>
              <h2 className="text-base font-semibold text-ink">Catat Penerimaan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Isi kuantitas yang benar-benar diterima. Kosongkan item yang belum datang.
              </p>
            </div>

            {fieldErrors.items ? <p className="field-error">{fieldErrors.items}</p> : null}

            <div className="space-y-3">
              {document.items.map((item, index) => {
                const remaining = item.expected_quantity - item.received_quantity;
                const disabled = remaining <= 0;
                return (
                  <div
                    key={item.product_id}
                    className="grid items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_200px]"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {item.sku} — {item.product_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Sisa {formatQuantity(remaining)} dari{" "}
                        {formatQuantity(item.expected_quantity)}
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`receive-${index}`} className="label">
                        Kuantitas Diterima
                      </label>
                      <input
                        id={`receive-${index}`}
                        inputMode="numeric"
                        className="input"
                        value={quantities[item.product_id] ?? ""}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.product_id]: event.target.value,
                          }))
                        }
                        disabled={disabled || submitting}
                        placeholder={disabled ? "Sudah penuh" : "0"}
                      />
                      {fieldErrors[`row-${index}`] ? (
                        <p className="field-error">{fieldErrors[`row-${index}`]}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Menyimpan..." : "Simpan Penerimaan"}
            </button>
          </form>
        ) : null}

        {role && !canReceive && isOpen ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Penerimaan barang hanya dapat dicatat oleh Operator.
          </p>
        ) : null}

        {!isOpen ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Dokumen tidak lagi menerima penerimaan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
