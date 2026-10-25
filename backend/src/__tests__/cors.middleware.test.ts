import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../app";

const ALLOWED_ORIGIN = "http://localhost:3000";

describe("CORS middleware", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    process.env.CORS_ORIGIN = ALLOWED_ORIGIN;
    process.env.JWT_SECRET = "test-jwt-secret-for-cors";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    app = createApp(async () => ({ status: "ok", database: "ready" }));
    server = app.listen(0);
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.CORS_ORIGIN;
  });

  it("menambahkan header CORS untuk origin yang diizinkan", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("menjawab preflight OPTIONS dengan 204", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("tidak menambahkan header CORS untuk origin yang tidak cocok", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://evil.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
