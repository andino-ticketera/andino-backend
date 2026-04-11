import pool, { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import type { CarruselEvento } from "../types/index.js";

interface CarruselEventoRow {
  evento_id: string;
}

interface ExistingEventoRow {
  id: string;
}

function rowToCarruselEvento(row: CarruselEventoRow): CarruselEvento {
  return {
    evento_id: row.evento_id,
  };
}

function isVisibleInAppColumnMissing(error: unknown): boolean {
  const dbError = error as { code?: string; message?: string };
  return (
    dbError?.code === "42703" &&
    String(dbError.message || "").includes("visible_en_app")
  );
}

async function ensureEventosExistAndAreVisible(
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;

  let result;
  try {
    result = await query<ExistingEventoRow>(
      `SELECT id
       FROM eventos
       WHERE id = ANY($1::uuid[])
         AND estado IN ('ACTIVO', 'AGOTADO')
         AND visible_en_app = TRUE`,
      [eventIds],
    );
  } catch (error) {
    if (!isVisibleInAppColumnMissing(error)) {
      throw error;
    }

    result = await query<ExistingEventoRow>(
      `SELECT id
       FROM eventos
       WHERE id = ANY($1::uuid[])
         AND estado IN ('ACTIVO', 'AGOTADO')`,
      [eventIds],
    );
  }

  const existingIds = new Set(result.rows.map((row) => row.id));
  const invalidIds = eventIds.filter((id) => !existingIds.has(id));

  if (invalidIds.length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Hay errores de validacion en el request",
      [
        {
          campo: "eventIds",
          mensaje: `Los siguientes eventos no existen o no estan disponibles: ${invalidIds.join(", ")}`,
        },
      ],
    );
  }
}

export async function listCarruselEventos(): Promise<CarruselEvento[]> {
  let result;
  try {
    result = await query<CarruselEventoRow>(
      `SELECT c.evento_id
       FROM carrusel_eventos c
       INNER JOIN eventos e ON e.id = c.evento_id
       WHERE e.estado IN ('ACTIVO', 'AGOTADO')
         AND e.visible_en_app = TRUE
       ORDER BY c.created_at ASC`,
    );
  } catch (error) {
    if (!isVisibleInAppColumnMissing(error)) {
      throw error;
    }

    result = await query<CarruselEventoRow>(
      `SELECT c.evento_id
       FROM carrusel_eventos c
       INNER JOIN eventos e ON e.id = c.evento_id
       WHERE e.estado IN ('ACTIVO', 'AGOTADO')
       ORDER BY c.created_at ASC`,
    );
  }

  return result.rows.map(rowToCarruselEvento);
}

export async function updateCarruselEventos(
  eventIds: string[],
): Promise<CarruselEvento[]> {
  await ensureEventosExistAndAreVisible(eventIds);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM carrusel_eventos");

    for (const eventId of eventIds) {
      await client.query(
        `INSERT INTO carrusel_eventos (evento_id)
         VALUES ($1)`,
        [eventId],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listCarruselEventos();
}
