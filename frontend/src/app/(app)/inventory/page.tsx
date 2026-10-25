"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getInventory } from "@/lib/api";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/ui";

/**
 * Halaman saldo stok per produk.
 *
 * @returns Elemen halaman stok.
 */
export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Memuat saldo stok dari API.
   *
   * @returns Promise<void>
   */
  const loadInventory = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await getInventory());
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : "Gagal memuat stok.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const totalQuantity = inventory.reduce(
    (total, item) => total + item.quantity_on_hand,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Stok Gudang"
        description="Saldo stok saat ini berdasarkan seluruh penerimaan yang tercatat."
        action={
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
            Total unit:{" "}
            <span className="font-semibold text-slate-900">
              {formatQuantity(totalQuantity)}
            </span>
          </div>
        }
      />

      <div className="space-y-4">
        {error ? <ErrorAlert message={error} /> : null}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="px-4">
              <Loading />
            </div>
          ) : inventory.length === 0 ? (
            <EmptyState message="Belum ada produk dengan saldo stok." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produk</th>
                    <th className="text-right">Saldo</th>
                    <th>Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => (
                    <tr key={item.product_id}>
                      <td className="font-mono text-xs font-semibold text-slate-900">
                        {item.sku}
                      </td>
                      <td className="font-medium text-slate-900">{item.product_name}</td>
                      <td className="text-right">
                        <span className="inline-flex min-w-12 justify-end rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-900">
                          {formatQuantity(item.quantity_on_hand)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(item.updated_at)}
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
