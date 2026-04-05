import { describe, expect, it } from "vitest";
import { normalizeRole } from "../../src/services/auth-role.js";

describe("normalizeRole", () => {
  it("acepta roles validos en mayusculas", () => {
    expect(normalizeRole("ADMIN")).toBe("ADMIN");
    expect(normalizeRole("ORGANIZADOR")).toBe("ORGANIZADOR");
    expect(normalizeRole("USUARIO")).toBe("USUARIO");
  });

  it("normaliza espacios y mayusculas", () => {
    expect(normalizeRole("  admin  ")).toBe("ADMIN");
    expect(normalizeRole("organizador")).toBe("ORGANIZADOR");
  });

  it("mapea USER a USUARIO", () => {
    expect(normalizeRole("USER")).toBe("USUARIO");
  });

  it("retorna null para valores no permitidos", () => {
    expect(normalizeRole("SUPERADMIN")).toBeNull();
    expect(normalizeRole("")).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});
