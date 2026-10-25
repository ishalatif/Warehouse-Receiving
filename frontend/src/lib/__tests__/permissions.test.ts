import { describe, expect, it } from "vitest";
import {
  canCancelDocuments,
  canCreateDocuments,
  canManageProducts,
  canReceiveGoods,
} from "../permissions";
import { isRole } from "../session";

describe("role permissions", () => {
  it("hanya Supervisor yang boleh mengelola produk, dokumen, dan pembatalan", () => {
    expect(canManageProducts("SUPERVISOR")).toBe(true);
    expect(canManageProducts("OPERATOR")).toBe(false);
    expect(canCreateDocuments("SUPERVISOR")).toBe(true);
    expect(canCreateDocuments("OPERATOR")).toBe(false);
    expect(canCancelDocuments("SUPERVISOR")).toBe(true);
    expect(canCancelDocuments("OPERATOR")).toBe(false);
  });

  it("hanya Operator yang boleh mencatat penerimaan", () => {
    expect(canReceiveGoods("OPERATOR")).toBe(true);
    expect(canReceiveGoods("SUPERVISOR")).toBe(false);
  });
});

describe("isRole", () => {
  it("menerima hanya role yang dikenal", () => {
    expect(isRole("OPERATOR")).toBe(true);
    expect(isRole("SUPERVISOR")).toBe(true);
    expect(isRole("ADMIN")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
