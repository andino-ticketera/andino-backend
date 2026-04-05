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

export function validateCreateCategoria(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const nombre = normalizeCategoriaNombre(body.nombre);
  return validateNombre(nombre);
}

export function validateUpdateCategoria(
  body: Record<string, unknown>,
): ValidationDetail[] {
  return validateCreateCategoria(body);
}
