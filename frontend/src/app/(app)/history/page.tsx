"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getInventoryTransactions } from "@/lib/api";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { InventoryTransaction } from "@/lib/types";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/ui";

/**
 * Halaman riwayat transaksi stok (ledger penerimaan).
 *
 * @returns Elemen halaman riwayat.
 */
export default function HistoryPage() {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Memuat riwayat transaksi dari API.
   *
   * @returns Promise<void>
   */
  const loadTransactions = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setTransactions(await getInventoryTransactions());
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Gagal memuat riwayat transaksi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  return (
    <div>
      <PageHeader
        title="Riwayat Transaksi"
        description="Ledger penerimaan barang yang mengubah saldo stok."
      />

      <div className="space-y-4">
        {error ? <ErrorAlert message={error} /> : null}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="px-4">
              <Loading />
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState message="Belum ada transaksi penerimaan." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ID Produk</th>
                    <th>ID Dokumen</th>
                    <th className="text-right">Perubahan</th>
                    <th>Jenis</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="font-mono text-xs text-slate-500">{transaction.id}</td>
                      <td className="font-mono text-xs font-semibold text-slate-900">
                        {transaction.product_id}
                      </td>
                      <td className="font-mono text-xs text-slate-700">
                        {transaction.document_id}
                      </td>
                      <td className="text-right font-semibold text-emerald-700">
                        +{formatQuantity(transaction.quantity_change)}
                      </td>
                      <td>
                        <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                          {transaction.type}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(transaction.created_at)}
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
