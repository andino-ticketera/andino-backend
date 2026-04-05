import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeFullName,
  validateLoginAuth,
  validatePasswordResetRequest,
  validateRegisterAuth,
  validateRoleUpdateAuth,
} from "../../src/validators/auth.validator.js";

describe("auth.validator", () => {
  it("normalizeEmail normaliza trim y lowercase", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("normalizeFullName colapsa espacios", () => {
    expect(normalizeFullName("  Juan   Perez   Gomez ")).toBe(
      "Juan Perez Gomez",
    );
  });

  it("validateRegisterAuth valida requeridos y formatos", () => {
    const errors = validateRegisterAuth({
      nombre_completo: "",
      email: "mal-email",
      password: "123",
    });

    expect(errors.some((error) => error.campo === "nombre_completo")).toBe(
      true,
    );
    expect(errors.some((error) => error.campo === "email")).toBe(true);
    expect(errors.some((error) => error.campo === "password")).toBe(true);
  });

  it("validateRegisterAuth acepta payload valido", () => {
    const errors = validateRegisterAuth({
      nombre_completo: "Juan Perez",
      email: "juan@example.com",
      password: "pass-123456",
    });

    expect(errors).toEqual([]);
  });

  it("validateLoginAuth falla con email invalido o password corta", () => {
    const errors = validateLoginAuth({
      email: "not-an-email",
      password: "123",
    });

    expect(errors.some((error) => error.campo === "email")).toBe(true);
    expect(errors.some((error) => error.campo === "password")).toBe(true);
  });

  it("validatePasswordResetRequest valida email", () => {
    const errors = validatePasswordResetRequest({ email: "foo" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.campo).toBe("email");
  });

  it("validateRoleUpdateAuth solo acepta roles permitidos", () => {
    expect(validateRoleUpdateAuth({ role: "ADMIN" })).toEqual([]);

    const errors = validateRoleUpdateAuth({ role: "SUPERADMIN" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.campo).toBe("role");
  });
});
