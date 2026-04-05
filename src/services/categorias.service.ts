import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import type {
  Categoria,
  CreateCategoriaDTO,
  UpdateCategoriaDTO,
} from "../types/index.js";

interface CategoriaRow {
  id: string;
  nombre: string;
  created_at: Date;
  updated_at: Date;
}

function rowToCategoria(row: CategoriaRow): Categoria {
  return {
    id: row.id,
    nombre: row.nombre,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function handleCategoriaDbError(err: unknown): never {
  const dbError = err as { code?: string; constraint?: string };

  if (
    dbError.code === "23505" &&
    (dbError.constraint === "uq_categorias_nombre" ||
      dbError.constraint === "ux_categorias_nombre_lower")
  ) {
    throw new AppError(
      409,
      "CATEGORIA_DUPLICADA",
      "Ya existe una categoria con ese nombre",
    );
  }

  if (
    dbError.code === "23503" &&
    dbError.constraint === "fk_eventos_categoria"
  ) {
    throw new AppError(
      409,
      "CATEGORIA_EN_USO",
      "No se puede eliminar la categoria porque tiene eventos asociados",
    );
  }

  throw err;
}

export async function listCategorias(): Promise<Categoria[]> {
  const result = await query<CategoriaRow>(
    `SELECT * FROM categorias ORDER BY LOWER(nombre) ASC`,
  );

  return result.rows.map(rowToCategoria);
}

export async function getCategoriaById(id: string): Promise<Categoria> {
  const result = await query<CategoriaRow>(
    `SELECT * FROM categorias WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError(
      404,
      "CATEGORIA_NO_ENCONTRADA",
      "La categoria solicitada no existe",
    );
  }

  return rowToCategoria(result.rows[0]);
}

export async function existsCategoriaByNombre(
  nombre: string,
): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM categorias WHERE LOWER(nombre) = LOWER($1)
    ) as exists`,
    [nombre],
  );

  return result.rows[0]?.exists === true;
}

export async function createCategoria(
  dto: CreateCategoriaDTO,
): Promise<Categoria> {
  try {
    const result = await query<CategoriaRow>(
      `INSERT INTO categorias (nombre)
       VALUES ($1)
       RETURNING *`,
      [dto.nombre],
    );

    return rowToCategoria(result.rows[0]);
  } catch (err) {
    handleCategoriaDbError(err);
  }
}

export async function updateCategoria(
  id: string,
  dto: UpdateCategoriaDTO,
): Promise<Categoria> {
  const existing = await query<CategoriaRow>(
    `SELECT * FROM categorias WHERE id = $1`,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new AppError(
      404,
      "CATEGORIA_NO_ENCONTRADA",
      "La categoria solicitada no existe",
    );
  }

  const current = existing.rows[0];
  if (current.nombre === dto.nombre) {
    return rowToCategoria(current);
  }

  try {
    const result = await query<CategoriaRow>(
      `UPDATE categorias
       SET nombre = $1
       WHERE id = $2
       RETURNING *`,
      [dto.nombre, id],
    );

    return rowToCategoria(result.rows[0]);
  } catch (err) {
    handleCategoriaDbError(err);
  }
}

export async function deleteCategoria(id: string): Promise<void> {
  const result = await query<CategoriaRow>(
    `SELECT * FROM categorias WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError(
      404,
      "CATEGORIA_NO_ENCONTRADA",
      "La categoria solicitada no existe",
    );
  }

  try {
    await query(`DELETE FROM categorias WHERE id = $1`, [id]);
  } catch (err) {
    handleCategoriaDbError(err);
  }
}

export async function deleteCategoriaByNombre(nombre: string): Promise<void> {
  const result = await query<CategoriaRow>(
    `SELECT * FROM categorias WHERE LOWER(nombre) = LOWER($1)`,
    [nombre],
  );

  if (result.rows.length === 0) {
    throw new AppError(
      404,
      "CATEGORIA_NO_ENCONTRADA",
      "La categoria solicitada no existe",
    );
  }

  try {
    await query(`DELETE FROM categorias WHERE id = $1`, [result.rows[0].id]);
  } catch (err) {
    handleCategoriaDbError(err);
  }
}
