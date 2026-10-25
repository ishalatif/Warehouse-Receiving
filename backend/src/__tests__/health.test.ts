import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../app";
import type { HealthCheckFn, HealthResponse } from "../services/health.service";

describe("GET /api/health", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  const check = vi.fn(async (): Promise<HealthResponse> => ({
    status: "ok",
    database: "ready",
  }));

  beforeAll(() => {
    app = createApp(check as HealthCheckFn);
    server = app.listen(0);
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("mengembalikan 200 dan database ready saat check berhasil", async () => {
    check.mockResolvedValue({ status: "ok", database: "ready" });

    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as HealthResponse;
    expect(body).toEqual({ status: "ok", database: "ready" });
  });

  it("mengembalikan 503 saat check database gagal", async () => {
    check.mockRejectedValue(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(503);

    const body = (await response.json()) as { success: boolean; code: string; message: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("HEALTH_CHECK_FAILED");
  });
});
