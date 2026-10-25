import { describe, expect, it } from "vitest";
import { UserValidationError, validateNewUser } from "../services/user.service";

describe("validasi pembuatan user", () => {
  const validPassword = "password-yang-cukup-panjang";

  it("menormalkan email menjadi huruf kecil dan trim", () => {
    const result = validateNewUser({
      email: "  Supervisor.Contoh@Example.Test ",
      password: validPassword,
      role: "SUPERVISOR",
    });

    expect(result.email).toBe("supervisor.contoh@example.test");
    expect(result.role).toBe("SUPERVISOR");
  });

  it("menolak email tidak valid", () => {
    expect(() =>
      validateNewUser({ email: "bukan-email", password: validPassword, role: "OPERATOR" }),
    ).toThrow(UserValidationError);
    expect(() =>
      validateNewUser({ email: "  ", password: validPassword, role: "OPERATOR" }),
    ).toThrow(UserValidationError);
  });

  it("menolak role di luar OPERATOR/SUPERVISOR", () => {
    expect(() =>
      validateNewUser({
        email: "user@example.test",
        password: validPassword,
        role: "ADMIN" as "OPERATOR",
      }),
    ).toThrow(UserValidationError);
  });

  it("menolak password pendek atau melebihi 72 byte", () => {
    expect(() =>
      validateNewUser({ email: "user@example.test", password: "pendek", role: "OPERATOR" }),
    ).toThrow(/minimal/);
    expect(() =>
      validateNewUser({
        email: "user@example.test",
        password: "a".repeat(73),
        role: "OPERATOR",
      }),
    ).toThrow(/72 byte/);
  });
});
