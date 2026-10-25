import { describe, expect, it } from "vitest";
import {
  parsePositiveInteger,
  validateDocumentDraft,
  validateLogin,
  validateProductInput,
  validateReceiveInput,
} from "../validation";

describe("parsePositiveInteger", () => {
  it("menerima bilangan bulat positif", () => {
    expect(parsePositiveInteger("12")).toBe(12);
    expect(parsePositiveInteger(" 3 ")).toBe(3);
  });

  it("menolak nol, negatif, desimal, dan teks", () => {
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("-1")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("abc")).toBeNull();
    expect(parsePositiveInteger("")).toBeNull();
  });
});

describe("validateLogin", () => {
  it("lolos untuk email dan password valid", () => {
    expect(validateLogin("operator@example.com", "password")).toEqual({});
  });

  it("menolak email kosong/tidak valid dan password kosong", () => {
    expect(validateLogin("", "")).toEqual({
      email: "Email wajib diisi.",
      password: "Password wajib diisi.",
    });
    expect(validateLogin("bukan-email", "x").email).toBeDefined();
  });
});

describe("validateProductInput", () => {
  it("mewajibkan SKU dan nama setelah trim", () => {
    expect(validateProductInput("   ", "  ")).toEqual({
      sku: "SKU wajib diisi.",
      name: "Nama produk wajib diisi.",
    });
  });

  it("membatasi panjang SKU dan nama", () => {
    const errors = validateProductInput("x".repeat(101), "y".repeat(256));
    expect(errors.sku).toContain("100");
    expect(errors.name).toContain("255");
  });
});

describe("validateDocumentDraft", () => {
  it("lolos untuk nomor dan item valid", () => {
    expect(
      validateDocumentDraft("DOC-001", [{ product_id: "1", expected_quantity: "5" }]),
    ).toEqual({});
  });

  it("menolak dokumen tanpa item", () => {
    expect(validateDocumentDraft("DOC-001", []).items).toBeDefined();
  });

  it("menolak produk duplikat dan kuantitas tidak valid", () => {
    const errors = validateDocumentDraft("DOC-001", [
      { product_id: "1", expected_quantity: "5" },
      { product_id: "1", expected_quantity: "2" },
      { product_id: "2", expected_quantity: "1.5" },
    ]);

    expect(errors["row-1"]).toContain("lebih dari sekali");
    expect(errors["row-2"]).toContain("bilangan bulat positif");
  });

  it("menolak nomor dokumen kosong", () => {
    expect(
      validateDocumentDraft("  ", [{ product_id: "1", expected_quantity: "1" }])
        .document_number,
    ).toBeDefined();
  });
});

describe("validateReceiveInput", () => {
  it("mewajibkan minimal satu kuantitas diisi", () => {
    expect(
      validateReceiveInput([{ product_id: 1, remaining: 5, quantity: "" }]).items,
    ).toBeDefined();
  });

  it("menolak kuantitas melebihi sisa", () => {
    const errors = validateReceiveInput([
      { product_id: 1, remaining: 5, quantity: "6" },
    ]);
    expect(errors["row-0"]).toContain("melebihi sisa 5");
  });

  it("lolos untuk kuantitas valid", () => {
    expect(
      validateReceiveInput([
        { product_id: 1, remaining: 5, quantity: "3" },
        { product_id: 2, remaining: 2, quantity: "" },
      ]),
    ).toEqual({});
  });
});
