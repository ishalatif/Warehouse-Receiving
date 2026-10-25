import { clearSession, getToken } from "./session";
import type {
  InventoryItem,
  InventoryTransaction,
  Product,
  ReceivingDocument,
  ReceivingDocumentDetail,
  Role,
  User,
} from "./types";

/**
 * Basis URL API backend. Dapat diatur lewat `NEXT_PUBLIC_API_URL`.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

/**
 * Error API terstruktur yang membawa kode dan status HTTP.
 */
export class ApiError extends Error {
  /**
   * @param message - Pesan aman untuk ditampilkan ke pengguna.
   * @param code - Kode error dari backend atau kode lokal.
   * @param status - Status HTTP; `0` untuk kegagalan jaringan.
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
}

/**
 * Bentuk respons sukses backend.
 */
interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/**
 * Bentuk respons error backend.
 */
interface ErrorEnvelope {
  success?: false;
  code?: string;
  message?: string;
}

/**
 * Mengirim request JSON ke backend dan mengembalikan `data` dari envelope.
 *
 * Token hanya dilampirkan untuk request terautentikasi. Pada `401`, sesi lokal
 * dibersihkan dan pengguna diarahkan ke halaman login. Tidak ada rahasia yang
 * dicatat.
 *
 * @param path - Path relatif terhadap `API_BASE_URL`, misal `/products`.
 * @param options - Method, body, dan apakah request memerlukan token.
 * @returns Promise<T> data dari respons sukses.
 * @throws {ApiError} Jika jaringan gagal atau respons bukan 2xx.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server.", "NETWORK_ERROR", 0);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ErrorEnvelope;
    if (response.status === 401 && auth) {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
    }
    throw new ApiError(
      errorPayload.message ?? "Terjadi kesalahan pada server.",
      errorPayload.code ?? "INTERNAL_ERROR",
      response.status,
    );
  }

  return (payload as SuccessEnvelope<T>).data;
}

/**
 * Melakukan login dan mengembalikan token beserta data user.
 *
 * @param email - Email pengguna.
 * @param password - Password pengguna.
 * @returns Promise<{ token: string; user: User }> sesi baru.
 * @throws {ApiError} Jika kredensial salah atau server gagal.
 */
export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: User }> {
  return apiRequest<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

/**
 * Mengambil katalog produk.
 *
 * @returns Promise<Product[]> daftar produk.
 */
export async function getProducts(): Promise<Product[]> {
  return apiRequest<Product[]>("/products");
}

/**
 * Membuat produk baru (khusus Supervisor).
 *
 * @param input - SKU, nama, dan deskripsi opsional.
 * @returns Promise<Product> produk yang dibuat.
 */
export async function createProduct(input: {
  sku: string;
  name: string;
  description: string | null;
}): Promise<Product> {
  return apiRequest<Product>("/products", { method: "POST", body: input });
}

/**
 * Mengambil daftar dokumen penerimaan.
 *
 * @returns Promise<ReceivingDocument[]> daftar dokumen.
 */
export async function getDocuments(): Promise<ReceivingDocument[]> {
  return apiRequest<ReceivingDocument[]>("/receiving-documents");
}

/**
 * Mengambil detail dokumen beserta item.
 *
 * @param id - ID dokumen.
 * @returns Promise<ReceivingDocumentDetail> detail dokumen.
 */
export async function getDocument(id: number): Promise<ReceivingDocumentDetail> {
  return apiRequest<ReceivingDocumentDetail>(`/receiving-documents/${id}`);
}

/**
 * Membuat dokumen penerimaan baru (khusus Supervisor).
 *
 * @param input - Nomor dokumen dan item harapan.
 * @returns Promise<ReceivingDocumentDetail> dokumen `DRAFT` yang dibuat.
 */
export async function createDocument(input: {
  document_number: string;
  items: Array<{ product_id: number; expected_quantity: number }>;
}): Promise<ReceivingDocumentDetail> {
  return apiRequest<ReceivingDocumentDetail>("/receiving-documents", {
    method: "POST",
    body: input,
  });
}

/**
 * Membatalkan dokumen `DRAFT` (khusus Supervisor).
 *
 * @param id - ID dokumen.
 * @returns Promise<ReceivingDocumentDetail> dokumen berstatus `CANCELLED`.
 */
export async function cancelDocument(id: number): Promise<ReceivingDocumentDetail> {
  return apiRequest<ReceivingDocumentDetail>(`/receiving-documents/${id}/cancel`, {
    method: "POST",
  });
}

/**
 * Mencatat penerimaan barang (khusus Operator).
 *
 * @param id - ID dokumen.
 * @param items - Produk dan kuantitas yang diterima.
 * @returns Promise<ReceivingDocumentDetail> detail dokumen terbaru.
 */
export async function receiveDocument(
  id: number,
  items: Array<{ product_id: number; quantity_received: number }>,
): Promise<ReceivingDocumentDetail> {
  return apiRequest<ReceivingDocumentDetail>(`/receiving-documents/${id}/receive`, {
    method: "POST",
    body: { items },
  });
}

/**
 * Mengambil saldo stok seluruh produk.
 *
 * @returns Promise<InventoryItem[]> saldo stok.
 */
export async function getInventory(): Promise<InventoryItem[]> {
  return apiRequest<InventoryItem[]>("/inventory");
}

/**
 * Mengambil riwayat transaksi stok.
 *
 * @returns Promise<InventoryTransaction[]> entry ledger terbaru lebih dahulu.
 */
export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  return apiRequest<InventoryTransaction[]>("/inventory/transactions");
}

/**
 * Memetakan role string menjadi label yang ditampilkan.
 *
 * @param role - Role pengguna.
 * @returns Label ramah pengguna.
 */
export function roleLabel(role: Role): string {
  return role === "SUPERVISOR" ? "Supervisor" : "Operator";
}
