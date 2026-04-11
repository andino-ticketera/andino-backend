import type { ValidationDetail } from "../types/index.js";

export function normalizeCategoriaNombre(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function validateNombre(nombre: string): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  if (!nombre) {
    errors.push({
      campo: "nombre",
      mensaje: "El nombre de la categoria es obligatorio",
    });
    return errors;
  }

  if (nombre.length < 2 || nombre.length > 50) {
    errors.push({
      campo: "nombre",
      mensaje: "El nombre de la categoria debe tener entre 2 y 50 caracteres",
    });
  }

  return errors;
}

function isBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return true;

  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "false";
}

export function validateCreateCategoria(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const nombre = normalizeCategoriaNombre(body.nombre);
  return validateNombre(nombre);
}

export function validateUpdateCategoria(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];
  const hasNombre = body.nombre !== undefined;
  const hasVisible = body.visible_en_app !== undefined;

  if (!hasNombre && !hasVisible) {
    errors.push({
      campo: "body",
      mensaje: "Debes enviar un nombre o la visibilidad de la categoria",
    });
    return errors;
  }

  if (hasNombre) {
    errors.push(...validateNombre(normalizeCategoriaNombre(body.nombre)));
  }

  if (hasVisible && !isBooleanLike(body.visible_en_app)) {
    errors.push({
      campo: "visible_en_app",
      mensaje: "visible_en_app debe ser true o false",
    });
  }

  return errors;
}
