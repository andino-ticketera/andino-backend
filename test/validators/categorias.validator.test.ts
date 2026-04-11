import { describe, expect, it } from "vitest";
import {
  normalizeCategoriaNombre,
  validateCreateCategoria,
  validateUpdateCategoria,
} from "../../src/validators/categorias.validator.js";

describe("categorias.validator", () => {
  it("normalizeCategoriaNombre hace trim y colapsa espacios", () => {
    expect(normalizeCategoriaNombre("  Musica   en   Vivo  ")).toBe(
      "Musica en Vivo",
    );
  });

  it("validateCreateCategoria exige nombre", () => {
    const errors = validateCreateCategoria({ nombre: "   " });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.campo).toBe("nombre");
  });

  it("validateCreateCategoria valida longitud", () => {
    expect(validateCreateCategoria({ nombre: "A" })).toHaveLength(1);
    expect(validateCreateCategoria({ nombre: "Fiestas" })).toEqual([]);
  });

  it("validateUpdateCategoria reutiliza las mismas reglas", () => {
    expect(validateUpdateCategoria({ nombre: "" })).toHaveLength(1);
    expect(validateUpdateCategoria({ nombre: "Teatro" })).toEqual([]);
  });

  it("validateUpdateCategoria permite actualizar solo la visibilidad", () => {
    expect(validateUpdateCategoria({ visible_en_app: false })).toEqual([]);
    expect(validateUpdateCategoria({ visible_en_app: "true" })).toEqual([]);
  });

  it("validateUpdateCategoria exige al menos un cambio valido", () => {
    expect(validateUpdateCategoria({})).toHaveLength(1);
    expect(
      validateUpdateCategoria({ visible_en_app: "tal vez" }),
    ).toHaveLength(1);
  });
});
