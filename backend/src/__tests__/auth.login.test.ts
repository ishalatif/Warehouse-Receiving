import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../app";
import * as authService from "../services/auth.service";

vi.mock("../services/auth.service", () => ({
  login: vi.fn(),
}));

describe("POST /api/auth/login", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    app = createApp();
    server = app.listen(0);
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("mengembalikan 400 VALIDATION_ERROR untuk input tidak valid", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bukan-email", password: "" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "VALIDATION_ERROR" }));
  });

  it("mengembalikan 200 dengan token dan user ketika login berhasil", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      token: "test-jwt-token",
      user: { id: 1, email: "operator@example.com", role: "OPERATOR" },
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@example.com", password: "password" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: true }));
    expect(body.data).toEqual({
      token: "test-jwt-token",
      user: { id: 1, email: "operator@example.com", role: "OPERATOR" },
    });
    expect(body.data.user).not.toHaveProperty("password_hash");
  });

  it("mengembalikan 401 UNAUTHORIZED ketika kredensial tidak valid", async () => {
    vi.mocked(authService.login).mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@example.com", password: "password" }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "UNAUTHORIZED" }));
  });

  it("mengembalikan 500 INTERNAL_ERROR ketika service login gagal", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(authService.login).mockRejectedValue(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@example.com", password: "password" }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ success: false, code: "INTERNAL_ERROR" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith("Login service failed");
    consoleErrorSpy.mockRestore();
  });
});
