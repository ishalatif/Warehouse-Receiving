/**
 * Memformat timestamp ISO menjadi tanggal dan waktu lokal Indonesia.
 *
 * @param value - Timestamp ISO dari API.
 * @returns String tanggal-waktu, atau "-" jika tidak valid.
 */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Memformat angka kuantitas dengan pemisah ribuan Indonesia.
 *
 * @param value - Nilai kuantitas.
 * @returns String angka terformat.
 */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}
