import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEnv, EnvironmentValidationError } from "../config/env";

const ENV_KEYS = ["NODE_ENV", "PORT", "JWT_SECRET", "DATABASE_URL"] as const;

describe("getEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it("membaca konfigurasi environment yang valid", () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "5001";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test";

    const env = getEnv();

    expect(env.NODE_ENV).toBe("test");
    expect(env.PORT).toBe(5001);
    expect(env.JWT_SECRET).toBe("test-jwt-secret");
    expect(env.DATABASE_URL).toBe("postgresql://user:password@localhost:5432/test");
  });

  it("membutuhkan JWT_SECRET", () => {
    delete process.env.JWT_SECRET;
    expect(() => getEnv()).toThrow(EnvironmentValidationError);
  });

  it("membutuhkan DATABASE_URL", () => {
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(EnvironmentValidationError);
  });

  it("memvalidasi format PORT", () => {
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test";
    process.env.PORT = "bukan-angka";

    expect(() => getEnv()).toThrow(EnvironmentValidationError);
  });
});
