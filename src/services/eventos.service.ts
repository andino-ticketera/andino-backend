import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import type {
  Evento,
  CreateEventoDTO,
  UpdateEventoDTO,
  AuthUser,
  PaginationMeta,
  ListEventosQuery,
  MedioPago,
  ValidationDetail,
  CreadorRol,
} from "../types/index.js";
import { parseMediosPago } from "../validators/eventos.validator.js";
import { getPublicUserById } from "./auth.service.js";

interface EventoRow {
  id: string;
  titulo: string;
  descripcion: string;
  fecha_evento: Date;
  locacion: string;
  direccion: string;
  provincia: string;
  localidad: string;
  precio: string;
  cantidad_entradas: number;
  entradas_vendidas: number;
  categoria: string;
  imagen_url: string;
  flyer_url: string | null;
  medios_pago: string[];
  instagram: string | null;
  tiktok: string | null;
  estado: string;
  visible_en_app: boolean;
  creador_id: string;
  creador_rol: string;
  creado_por_admin_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateEventoResult {
  evento: Evento;
  idempotentReplay: boolean;
}

function throwCategoriaInvalidaError(): never {
  const detalles: ValidationDetail[] = [
    {
      campo: "categoria",
      mensaje: "La categoria seleccionada no existe",
    },
  ];
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Hay errores de validacion en el request",
    detalles,
  );
}

function rowToEvento(row: EventoRow): Evento {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha_evento: row.fecha_evento.toISOString(),
    locacion: row.locacion,
    direccion: row.direccion,
    provincia: row.provincia,
    localidad: row.localidad,
    precio: parseFloat(row.precio),
    cantidad_entradas: row.cantidad_entradas,
    entradas_vendidas: row.entradas_vendidas,
    categoria: row.categoria,
    imagen_url: row.imagen_url,
    flyer_url: row.flyer_url,
    medios_pago: row.medios_pago as MedioPago[],
    instagram: row.instagram,
    tiktok: row.tiktok,
    estado: row.estado as Evento["estado"],
    visible_en_app: row.visible_en_app !== false,
    creador_id: row.creador_id,
    creador_rol: row.creador_rol as Evento["creador_rol"],
    creado_por_admin_id: row.creado_por_admin_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return String(value).trim().toLowerCase() === "true";
}

function isVisibleInAppColumnMissing(error: unknown): boolean {
  const dbError = error as { code?: string; message?: string };
  return (
    dbError?.code === "42703" &&
    String(dbError.message || "").includes("visible_en_app")
  );
}

function isCategoriaVisibleColumnMissing(error: unknown): boolean {
  const dbError = error as { code?: string; message?: string };
  return (
    dbError?.code === "42703" &&
    String(dbError.message || "").includes("categorias.visible_en_app")
  );
}

/**
 * Resuelve a quién le queda asignado el evento. Solo un ADMIN puede delegar
 * la titularidad a un organizador existente pasando `organizador_id`. Si el
 * caller no es ADMIN, el campo se ignora silenciosamente (seguridad: evita
 * que un organizador intente asignar eventos a otro usuario).
 */
async function resolveEventoOwnership(
  dto: CreateEventoDTO,
  caller: AuthUser,
): Promise<{
  creadorId: string;
  creadorRol: CreadorRol;
  creadoPorAdminId: string | null;
}> {
  const rawOrganizadorId = String(dto.organizador_id || "").trim();

  if (caller.role !== "ADMIN" || !rawOrganizadorId) {
    return {
      creadorId: caller.id,
      creadorRol: caller.role as CreadorRol,
      creadoPorAdminId: null,
    };
  }

  // Admin asignando el evento a un organizador existente.
  if (rawOrganizadorId === caller.id) {
    // Admin se asigna a sí mismo: equivalente a no pasar el campo.
    return {
      creadorId: caller.id,
      creadorRol: "ADMIN",
      creadoPorAdminId: null,
    };
  }

  const target = await getPublicUserById(rawOrganizadorId);
  if (!target) {
    throw new AppError(
      400,
      "ORGANIZADOR_INVALIDO",
      "El organizador destino no existe",
      [
        {
          campo: "organizador_id",
          mensaje: "No se encontro el usuario destino",
        },
      ],
    );
  }

  if (target.rol !== "ORGANIZADOR" && target.rol !== "ADMIN") {
    throw new AppError(
      400,
      "ORGANIZADOR_INVALIDO",
      "El usuario destino no es un organizador",
      [
        {
          campo: "organizador_id",
          mensaje:
            "El usuario destino debe tener rol ORGANIZADOR para recibir el evento",
        },
      ],
    );
  }

  return {
    creadorId: target.id,
    // Siempre lo registramos como ORGANIZADOR aunque el destino sea ADMIN,
    // para mantener la semántica de que el dueño operativo del evento es
    // un organizador. Esto también evita que se mezcle con el listado de
    // "eventos creados por un admin".
    creadorRol: "ORGANIZADOR",
    creadoPorAdminId: caller.id,
  };
}

export async function createEvento(
  dto: CreateEventoDTO,
  imagenUrl: string,
  flyerUrl: string | null,
  user: AuthUser,
): Promise<CreateEventoResult> {
  const mediosPago = parseMediosPago(dto.medios_pago);

  // Resolver titularidad: admin puede asignar el evento a un organizador
  // existente via dto.organizador_id. Si el caller no es admin o no envia
  // el campo, el evento queda a nombre del caller (comportamiento legacy).
  const ownership = await resolveEventoOwnership(dto, user);

  // Verificar idempotency_key contra el creador resuelto (no contra el
  // caller), asi el replay funciona igual cuando un admin vuelve a enviar
  // el mismo request en nombre del mismo organizador.
  if (dto.idempotency_key) {
    const existing = await query<EventoRow>(
      `SELECT * FROM eventos WHERE creador_id = $1 AND idempotency_key = $2`,
      [ownership.creadorId, dto.idempotency_key],
    );
    if (existing.rows.length > 0) {
      return {
        evento: rowToEvento(existing.rows[0]),
        idempotentReplay: true,
      };
    }
  }

  try {
    const result = await query<EventoRow>(
      `INSERT INTO eventos (
        titulo, descripcion, fecha_evento, locacion, direccion,
        provincia, localidad, precio, cantidad_entradas, categoria,
        imagen_url, flyer_url, medios_pago, instagram, tiktok,
        creador_id, creador_rol, creado_por_admin_id, idempotency_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        dto.titulo.trim(),
        dto.descripcion.trim(),
        dto.fecha_evento,
        dto.locacion.trim(),
        dto.direccion.trim(),
        dto.provincia.trim(),
        dto.localidad.trim(),
        dto.precio,
        dto.cantidad_entradas,
        dto.categoria.trim(),
        imagenUrl,
        flyerUrl,
        mediosPago,
        dto.instagram?.trim() || null,
        dto.tiktok?.trim() || null,
        ownership.creadorId,
        ownership.creadorRol,
        ownership.creadoPorAdminId,
        dto.idempotency_key || null,
      ],
    );

    return {
      evento: rowToEvento(result.rows[0]),
      idempotentReplay: false,
    };
  } catch (err) {
    const dbError = err as { code?: string; constraint?: string };

    if (
      dbError.code === "23503" &&
      dbError.constraint === "fk_eventos_categoria"
    ) {
      throwCategoriaInvalidaError();
    }

    if (
      dto.idempotency_key &&
      dbError.code === "23505" &&
      dbError.constraint === "ux_eventos_creador_idempotency"
    ) {
      const existing = await query<EventoRow>(
        `SELECT * FROM eventos WHERE creador_id = $1 AND idempotency_key = $2`,
        [ownership.creadorId, dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return {
          evento: rowToEvento(existing.rows[0]),
          idempotentReplay: true,
        };
      }
    }

    throw err;
  }
}

export async function listEventos(
  filters: ListEventosQuery,
): Promise<{ data: Evento[]; pagination: PaginationMeta }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Estado filter (default: ACTIVO + AGOTADO, nunca CANCELADO en publico)
  const estados = filters.estado
    ? filters.estado.split(",").map((s) => s.trim().toUpperCase())
    : ["ACTIVO", "AGOTADO"];
  const estadosPermitidos = estados.filter(
    (e) => e === "ACTIVO" || e === "AGOTADO",
  );
  conditions.push(`eventos.estado = ANY($${paramIndex})`);
  params.push(
    estadosPermitidos.length > 0 ? estadosPermitidos : ["__ESTADO_SIN_MATCH__"],
  );
  paramIndex++;

  if (filters.categoria) {
    conditions.push(`eventos.categoria = $${paramIndex}`);
    params.push(filters.categoria);
    paramIndex++;
  }

  if (filters.provincia) {
    conditions.push(`eventos.provincia = $${paramIndex}`);
    params.push(filters.provincia);
    paramIndex++;
  }

  if (filters.localidad) {
    conditions.push(`eventos.localidad = $${paramIndex}`);
    params.push(filters.localidad);
    paramIndex++;
  }

  if (filters.q) {
    conditions.push(
      `(eventos.titulo ILIKE $${paramIndex} OR eventos.descripcion ILIKE $${paramIndex} OR eventos.locacion ILIKE $${paramIndex})`,
    );
    params.push(`%${filters.q}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const publicVisibilityConditions = [
    "eventos.visible_en_app = TRUE",
    "categorias.visible_en_app = TRUE",
    ...conditions,
  ];
  const whereClauseWithVisibility = `WHERE ${publicVisibilityConditions.join(" AND ")}`;

  // Consulta unica: datos + total con window function COUNT(*) OVER()
  let dataResult;
  try {
    dataResult = await query<EventoRow & { _total: string }>(
      `SELECT eventos.*, COUNT(*) OVER() AS _total
       FROM eventos
       INNER JOIN categorias ON categorias.nombre = eventos.categoria
       ${whereClauseWithVisibility}
       ORDER BY eventos.fecha_evento ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );
  } catch (error) {
    if (
      !isVisibleInAppColumnMissing(error) &&
      !isCategoriaVisibleColumnMissing(error)
    ) {
      throw error;
    }

    dataResult = await query<EventoRow & { _total: string }>(
      `SELECT *, COUNT(*) OVER() AS _total
       FROM eventos
       ${whereClause}
       ORDER BY fecha_evento ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );
  }

  const total =
    dataResult.rows.length > 0 ? parseInt(dataResult.rows[0]._total, 10) : 0;

  return {
    data: dataResult.rows.map(rowToEvento),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getEventoById(id: string): Promise<Evento> {
  let result;
  try {
    result = await query<EventoRow>(
      `SELECT eventos.*
       FROM eventos
       INNER JOIN categorias ON categorias.nombre = eventos.categoria
       WHERE eventos.id = $1
         AND eventos.estado != 'CANCELADO'
         AND eventos.visible_en_app = TRUE
         AND categorias.visible_en_app = TRUE`,
      [id],
    );
  } catch (error) {
    if (
      !isVisibleInAppColumnMissing(error) &&
      !isCategoriaVisibleColumnMissing(error)
    ) {
      throw error;
    }

    result = await query<EventoRow>(
      `SELECT * FROM eventos
       WHERE id = $1
         AND estado != 'CANCELADO'`,
      [id],
    );
  }

  if (result.rows.length === 0) {
    throw new AppError(
      404,
      "EVENTO_NO_ENCONTRADO",
      "El evento solicitado no existe",
    );
  }

  return rowToEvento(result.rows[0]);
}

export async function listEventosByCreator(userId: string): Promise<Evento[]> {
  const result = await query<EventoRow>(
    `SELECT * FROM eventos WHERE creador_id = $1 AND estado != 'CANCELADO' ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(rowToEvento);
}

export async function listEventosForAdmin(): Promise<Evento[]> {
  const result = await query<EventoRow>(
    `SELECT * FROM eventos
     WHERE estado != 'CANCELADO'
     ORDER BY created_at DESC`,
  );

  return result.rows.map(rowToEvento);
}

export async function updateEvento(
  id: string,
  dto: UpdateEventoDTO,
  imagenUrl?: string,
  flyerUrl?: string,
  options?: { removeFlyer?: boolean },
): Promise<Evento> {
  // Buscar evento actual (incluyendo CANCELADO para dar 404 correcto)
  const current = await query<EventoRow>(
    `SELECT * FROM eventos WHERE id = $1`,
    [id],
  );

  if (current.rows.length === 0 || current.rows[0].estado === "CANCELADO") {
    throw new AppError(
      404,
      "EVENTO_NO_ENCONTRADO",
      "El evento solicitado no existe",
    );
  }

  const evento = current.rows[0];

  // Construir SET dinamico
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const fields: Array<{ key: keyof UpdateEventoDTO; value: unknown }> = [];

  if (dto.titulo !== undefined)
    fields.push({ key: "titulo", value: dto.titulo.trim() });
  if (dto.descripcion !== undefined)
    fields.push({ key: "descripcion", value: dto.descripcion.trim() });
  if (dto.fecha_evento !== undefined)
    fields.push({ key: "fecha_evento", value: dto.fecha_evento });
  if (dto.locacion !== undefined)
    fields.push({ key: "locacion", value: dto.locacion.trim() });
  if (dto.direccion !== undefined)
    fields.push({ key: "direccion", value: dto.direccion.trim() });
  if (dto.provincia !== undefined)
    fields.push({ key: "provincia", value: dto.provincia.trim() });
  if (dto.localidad !== undefined)
    fields.push({ key: "localidad", value: dto.localidad.trim() });
  if (dto.precio !== undefined)
    fields.push({ key: "precio", value: dto.precio });
  if (dto.cantidad_entradas !== undefined)
    fields.push({ key: "cantidad_entradas", value: dto.cantidad_entradas });
  if (dto.categoria !== undefined)
    fields.push({ key: "categoria", value: dto.categoria.trim() });
  if (dto.medios_pago !== undefined)
    fields.push({
      key: "medios_pago",
      value: parseMediosPago(dto.medios_pago),
    });
  if (dto.instagram !== undefined)
    fields.push({ key: "instagram", value: dto.instagram.trim() || null });
  if (dto.tiktok !== undefined)
    fields.push({ key: "tiktok", value: dto.tiktok.trim() || null });
  if (dto.visible_en_app !== undefined) {
    fields.push({
      key: "visible_en_app",
      value: parseBooleanLike(dto.visible_en_app),
    });
  }

  for (const field of fields) {
    setClauses.push(`${field.key} = $${paramIndex}`);
    params.push(field.value);
    paramIndex++;
  }

  if (imagenUrl) {
    setClauses.push(`imagen_url = $${paramIndex}`);
    params.push(imagenUrl);
    paramIndex++;
  }

  if (flyerUrl) {
    setClauses.push(`flyer_url = $${paramIndex}`);
    params.push(flyerUrl);
    paramIndex++;
  } else if (options?.removeFlyer) {
    setClauses.push(`flyer_url = $${paramIndex}`);
    params.push(null);
    paramIndex++;
  }

  // Verificar si el estado debe cambiar de AGOTADO a ACTIVO
  if (dto.cantidad_entradas !== undefined) {
    const newCantidad = dto.cantidad_entradas;
    const nextEstado =
      newCantidad <= evento.entradas_vendidas ? "AGOTADO" : "ACTIVO";
    setClauses.push(`estado = $${paramIndex}`);
    params.push(nextEstado);
    paramIndex++;
  }

  if (setClauses.length === 0) {
    return rowToEvento(evento);
  }

  params.push(id);
  let result;
  try {
    result = await query<EventoRow>(
      `UPDATE eventos SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );
  } catch (err) {
    const dbError = err as { code?: string; constraint?: string };
    if (
      dbError.code === "23503" &&
      dbError.constraint === "fk_eventos_categoria"
    ) {
      throwCategoriaInvalidaError();
    }
    throw err;
  }

  if (result.rows[0]?.visible_en_app === false) {
    await query(`DELETE FROM carrusel_eventos WHERE evento_id = $1`, [id]);
  }

  return rowToEvento(result.rows[0]);
}

export async function deleteEvento(
  id: string,
): Promise<{ mensaje: string; imagenUrl?: string; flyerUrl?: string }> {
  const current = await query<EventoRow>(
    `SELECT * FROM eventos WHERE id = $1`,
    [id],
  );

  if (current.rows.length === 0 || current.rows[0].estado === "CANCELADO") {
    throw new AppError(
      404,
      "EVENTO_NO_ENCONTRADO",
      "El evento solicitado no existe",
    );
  }

  const evento = current.rows[0];

  await query(`DELETE FROM carrusel_eventos WHERE evento_id = $1`, [id]);

  if (evento.entradas_vendidas === 0) {
    // Eliminacion fisica
    await query(`DELETE FROM eventos WHERE id = $1`, [id]);
    return {
      mensaje: "Evento eliminado correctamente",
      imagenUrl: evento.imagen_url,
      flyerUrl: evento.flyer_url || undefined,
    };
  } else {
    // Eliminacion logica
    await query(`UPDATE eventos SET estado = 'CANCELADO' WHERE id = $1`, [id]);
    return {
      mensaje: "Evento eliminado correctamente",
      imagenUrl: evento.imagen_url,
      flyerUrl: evento.flyer_url || undefined,
    };
  }
}

export async function getEventoRaw(id: string): Promise<EventoRow | null> {
  const result = await query<EventoRow>(`SELECT * FROM eventos WHERE id = $1`, [
    id,
  ]);
  return result.rows[0] || null;
}

export async function isPublicAssetFilename(
  filename: string,
): Promise<boolean> {
  const assetUrlSuffix = `/uploads/events/${filename}`;

  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM eventos
      WHERE estado IN ('ACTIVO', 'AGOTADO')
        AND (
          imagen_url LIKE $1
          OR flyer_url LIKE $1
        )
    ) AS exists`,
    [`%${assetUrlSuffix}`],
  );

  return Boolean(result.rows[0]?.exists);
}
