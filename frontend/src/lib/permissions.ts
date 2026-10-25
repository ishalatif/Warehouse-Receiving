import type { Role } from "./types";

/**
 * Menentukan apakah role boleh membuat produk.
 *
 * @param role - Role pengguna aktif.
 * @returns `true` hanya untuk `SUPERVISOR`.
 */
export function canManageProducts(role: Role): boolean {
  return role === "SUPERVISOR";
}

/**
 * Menentukan apakah role boleh membuat dokumen penerimaan.
 *
 * @param role - Role pengguna aktif.
 * @returns `true` hanya untuk `SUPERVISOR`.
 */
export function canCreateDocuments(role: Role): boolean {
  return role === "SUPERVISOR";
}

/**
 * Menentukan apakah role boleh membatalkan dokumen.
 *
 * @param role - Role pengguna aktif.
 * @returns `true` hanya untuk `SUPERVISOR`.
 */
export function canCancelDocuments(role: Role): boolean {
  return role === "SUPERVISOR";
}

/**
 * Menentukan apakah role boleh mencatat penerimaan barang.
 *
 * @param role - Role pengguna aktif.
 * @returns `true` hanya untuk `OPERATOR`.
 */
export function canReceiveGoods(role: Role): boolean {
  return role === "OPERATOR";
}
