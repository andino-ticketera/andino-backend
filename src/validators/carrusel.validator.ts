import type { ValidationDetail } from "../types/index.js";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function normalizeCarruselEventIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
}

export function validateUpdateCarrusel(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  if (!Array.isArray(body.eventIds)) {
    errors.push({
      campo: "eventIds",
      mensaje: "eventIds debe ser un array de IDs de eventos",
    });
    return errors;
  }

  const eventIds = normalizeCarruselEventIds(body.eventIds);

  if (eventIds.length !== body.eventIds.length) {
    errors.push({
      campo: "eventIds",
      mensaje: "Todos los IDs deben ser strings no vacios",
    });
  }

  if (eventIds.length > 6) {
    errors.push({
      campo: "eventIds",
      mensaje: "El carrusel permite como maximo 6 eventos",
    });
  }

  const seen = new Set<string>();
  for (const id of eventIds) {
    if (!isValidUUID(id)) {
      errors.push({
        campo: "eventIds",
        mensaje: `ID de evento invalido: ${id}`,
      });
      continue;
    }

    if (seen.has(id)) {
      errors.push({
        campo: "eventIds",
        mensaje: `ID de evento duplicado: ${id}`,
      });
      continue;
    }

    seen.add(id);
  }

  return errors;
}
