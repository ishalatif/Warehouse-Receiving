"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getDocuments } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canCreateDocuments } from "@/lib/permissions";
import { useCurrentSession } from "@/lib/use-session";
import type { ReceivingDocument } from "@/lib/types";
import {
  EmptyState,
  ErrorAlert,
  Loading,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

/**
 * Halaman daftar dokumen penerimaan.
 *
 * @returns Elemen halaman daftar dokumen.
 */
export default function DocumentsPage() {
  const session = useCurrentSession();
  const [documents, setDocuments] = useState<ReceivingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Memuat daftar dokumen dari API.
   *
   * @returns Promise<void>
   */
  const loadDocuments = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await getDocuments());
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : "Gagal memuat dokumen.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div>
      <PageHeader
        title="Dokumen Penerimaan"
        description="Pantau status dan progres penerimaan setiap dokumen."
        action={
          session && canCreateDocuments(session.user.role) ? (
            <Link href="/documents/new" className="btn-primary">
              Buat Dokumen
            </Link>
          ) : null
        }
      />

      <div className="space-y-4">
        {error ? <ErrorAlert message={error} /> : null}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="px-4">
              <Loading />
            </div>
          ) : documents.length === 0 ? (
            <EmptyState message="Belum ada dokumen penerimaan." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Nomor Dokumen</th>
                    <th>Status</th>
                    <th>Dibuat</th>
                    <th>Diperbarui</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td className="font-mono text-xs font-semibold text-slate-900">
                        {document.document_number}
                      </td>
                      <td>
                        <StatusBadge status={document.status} />
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(document.created_at)}
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(document.updated_at)}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/documents/${document.id}`}
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        >
                          Lihat detail
                        </Link>
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
