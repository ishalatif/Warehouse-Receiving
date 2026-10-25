import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../session", () => ({
  getToken: vi.fn(() => "test-token"),
  clearSession: vi.fn(),
}));

import { ApiError, API_BASE_URL, apiRequest, login } from "../api";
import { clearSession } from "../session";

/**
 * Membuat objek Response JSON untuk mock fetch.
 *
 * @param body - Body respons.
 * @param status - Status HTTP.
 * @returns Response palsu.
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("mengembalikan data dari envelope sukses dan melampirkan token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: [{ id: 1, sku: "SKU-1" }] }),
    );

    const result = await apiRequest<Array<{ id: number }>>("/products");

    expect(result).toEqual([{ id: 1, sku: "SKU-1" }]);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${API_BASE_URL}/products`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("mengirim body JSON untuk POST", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, data: { id: 2 } }));

    await apiRequest("/products", { method: "POST", body: { sku: "SKU-2" } });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${API_BASE_URL}/products`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sku: "SKU-2" }),
      }),
    );
  });

  it("memetakan error API menjadi ApiError dengan kode backend", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { success: false, code: "SKU_ALREADY_EXISTS", message: "SKU sudah digunakan." },
        409,
      ),
    );

    await expect(apiRequest("/products", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      code: "SKU_ALREADY_EXISTS",
      status: 409,
      message: "SKU sudah digunakan.",
    });
  });

  it("menghasilkan NETWORK_ERROR ketika fetch gagal", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));

    await expect(apiRequest("/products")).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("membersihkan sesi pada 401 request terautentikasi", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, code: "UNAUTHORIZED", message: "Token tidak valid." }, 401),
    );

    await expect(apiRequest("/products")).rejects.toBeInstanceOf(ApiError);
    expect(clearSession).toHaveBeenCalled();
  });

  it("tidak melampirkan token pada login", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { token: "new-token", user: { id: 1, email: "a@b.test", role: "OPERATOR" } },
      }),
    );

    const result = await login("a@b.test", "secret");

    expect(result.token).toBe("new-token");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
