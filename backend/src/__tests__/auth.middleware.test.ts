import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const JWT_SECRET = "test-jwt-secret-for-auth";

describe("auth middleware", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  });

  const createRes = (): Response => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res as unknown as Response;
  };

  it("mengembalikan 401 ketika token tidak ada", async () => {
    const req = { headers: {} } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("mengembalikan 401 ketika token tidak valid", async () => {
    const req = { headers: { authorization: "Bearer invalid.token.value" } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("mengembalikan 401 ketika token kedaluwarsa", async () => {
    const expiredToken = jwt.sign(
      { sub: 1, email: "operator@example.com", role: "OPERATOR", exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${expiredToken}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("melanjutkan proses dan menempelkan user ketika token valid", async () => {
    const token = jwt.sign(
      { sub: 1, email: "operator@example.com", role: "OPERATOR" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 1, email: "operator@example.com", role: "OPERATOR" });
  });

  it("mengembalikan 401 ketika token tidak memiliki role yang valid", async () => {
    const token = jwt.sign(
      { sub: 1, email: "operator@example.com" },
      JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("mengembalikan 401 ketika token memiliki sub tidak valid", async () => {
    const token = jwt.sign(
      { sub: 0, email: "operator@example.com", role: "OPERATOR" },
      JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("mengembalikan 401 ketika requireRole dipakai tanpa user", async () => {
    const req = { user: undefined } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireRole("SUPERVISOR")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("mengembalikan 403 FORBIDDEN saat role tidak diizinkan", async () => {
    const req = {
      user: { id: 2, email: "operator@example.com", role: "OPERATOR" },
    } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireRole("SUPERVISOR")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "FORBIDDEN" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("melanjutkan proses saat role diizinkan", async () => {
    const req = {
      user: { id: 1, email: "supervisor@example.com", role: "SUPERVISOR" },
    } as unknown as Request;
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireRole("SUPERVISOR")(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
