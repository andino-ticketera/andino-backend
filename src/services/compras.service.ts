import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import { isMissingColumnError } from "../utils/db-compat.js";
import type {
  AuthUser,
  CompraDetalle,
  CompraGestionResumen,
  CompraResumen,
  EntradaDetalle,
  EntradaResumen,
  EstadoCompra,
  EstadoEntrada,
  MedioPago,
  PerfilComprador,
} from "../types/index.js";
import { getPublicUserById, getPublicUsersByIds } from "./auth.service.js";
import { buildTicketAssets } from "./ticket-assets.service.js";

interface CompraListRow {
  id: string;
  user_id: string;
  evento_id: string;
  evento_titulo: string;
  fecha_evento: Date;
  ubicacion_evento: string;
  creador_id: string;
  nombre_organizador: string | null;
  cantidad: number;
  precio_unitario: string;
  precio_total: string;
  metodo_pago: MedioPago;
  estado: EstadoCompra;
  fecha_compra: Date;
}

interface EntradaRow {
  id: string;
  compra_id: string;
  evento_id: string;
  numero_entrada: number;
  qr_token: string;
  estado: EstadoEntrada;
  usada_at: Date | null;
}

interface EntradaDetalleRow extends EntradaRow {
  compra_user_id: string;
  compra_estado: EstadoCompra;
  evento_titulo: string;
  fecha_evento: Date;
  locacion: string;
  direccion: string;
  creador_id: string;
  nombre_organizador: string | null;
}

interface PerfilCompradorRow {
  comprador_nombre: string | null;
  comprador_apellido: string | null;
  comprador_email: string | null;
  comprador_documento: string | null;
  comprador_tipo_documento: string | null;
}

interface CompraGestionRow extends CompraListRow {
  comprador_nombre: string | null;
  comprador_apellido: string | null;
  comprador_email: string | null;
  comprador_documento: string | null;
  comprador_tipo_documento: string | null;
  entradas_usadas: number;
}

interface CompraOwnerRow {
  id: string;
  estado: EstadoCompra;
  creador_id: string;
}

function toNumber(value: string): number {
  return Number.parseFloat(value);
}

function toIsoString(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function isOrganizerNameColumnMissing(error: unknown): boolean {
  return isMissingColumnError(error, "nombre_organizador");
}

async function queryWithOrganizerNameFallback<T extends object>(
  sql: string,
  fallbackSql: string,
  params: unknown[],
) {
  try {
    return await query<T>(sql, params);
  } catch (error) {
    if (!isOrganizerNameColumnMissing(error)) {
      throw error;
    }

    return query<T>(fallbackSql, params);
  }
}

function buildCompraResumen(
  row: CompraListRow,
  organizerName: string,
): CompraResumen {
  return {
    id: row.id,
    user_id: row.user_id,
    evento_id: row.evento_id,
    evento_titulo: row.evento_titulo,
    fecha_evento: row.fecha_evento.toISOString(),
    ubicacion_evento: row.ubicacion_evento,
    nombre_organizador: organizerName,
    cantidad: row.cantidad,
    precio_unitario: toNumber(row.precio_unitario),
    precio_total: toNumber(row.precio_total),
    metodo_pago: row.metodo_pago,
    estado: row.estado,
    fecha_compra: row.fecha_compra.toISOString(),
  };
}

function buildEntradaResumen(row: EntradaRow): EntradaResumen {
  return {
    id: row.id,
    numero_entrada: row.numero_entrada,
    estado: row.estado,
    fecha_uso: toIsoString(row.usada_at),
  };
}

function buildCompraGestionResumen(
  row: CompraGestionRow,
  organizerName: string,
): CompraGestionResumen {
  return {
    ...buildCompraResumen(row, organizerName),
    comprador_nombre: row.comprador_nombre?.trim() || "",
    comprador_apellido: row.comprador_apellido?.trim() || "",
    comprador_email: row.comprador_email?.trim() || "",
    comprador_documento: row.comprador_documento?.trim() || "",
    comprador_tipo_documento: row.comprador_tipo_documento?.trim() || "DNI",
    entradas_usadas: Number(row.entradas_usadas || 0),
  };
}

async function resolveOrganizerNames(
  rows: CompraListRow[],
): Promise<Map<string, string>> {
  const organizerNames = new Map<string, string>();
  const pendingCreatorIds = new Set<string>();

  for (const row of rows) {
    const storedName = row.nombre_organizador?.trim();
    if (storedName) {
      organizerNames.set(row.creador_id, storedName);
      continue;
    }
    pendingCreatorIds.add(row.creador_id);
  }

  if (pendingCreatorIds.size === 0) {
    return organizerNames;
  }

  const usersById = await getPublicUsersByIds([...pendingCreatorIds]);

  for (const creatorId of pendingCreatorIds) {
    const organizer = usersById.get(creatorId);
    organizerNames.set(creatorId, organizer?.nombreCompleto || "Organizador");
  }

  return organizerNames;
}

export async function listComprasByUser(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<CompraResumen[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const result = await queryWithOrganizerNameFallback<CompraListRow>(
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      e.nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.user_id = $1
    ORDER BY c.created_at DESC
    LIMIT $2 OFFSET $3`,
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      NULL::text AS nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.user_id = $1
    ORDER BY c.created_at DESC
    LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const organizerNames = await resolveOrganizerNames(result.rows);

  return result.rows.map((row) =>
    buildCompraResumen(
      row,
      organizerNames.get(row.creador_id) || "Organizador",
    ),
  );
}

async function listComprasGestionadas(
  whereClause: string,
  params: unknown[],
  options?: { limit?: number; offset?: number },
): Promise<CompraGestionResumen[]> {
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);
  const offset = Math.max(options?.offset ?? 0, 0);
  const limitPosition = params.length + 1;
  const offsetPosition = params.length + 2;

  const result = await queryWithOrganizerNameFallback<CompraGestionRow>(
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      e.nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra,
      c.comprador_nombre,
      c.comprador_apellido,
      c.comprador_email,
      c.comprador_documento,
      c.comprador_tipo_documento,
      COALESCE(COUNT(en.id) FILTER (WHERE en.estado = 'USADA'), 0)::int AS entradas_usadas
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    LEFT JOIN entradas en ON en.compra_id = c.id
    ${whereClause}
    GROUP BY
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo,
      e.fecha_evento,
      e.locacion,
      e.localidad,
      e.provincia,
      e.creador_id,
      e.nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at,
      c.comprador_nombre,
      c.comprador_apellido,
      c.comprador_email,
      c.comprador_documento,
      c.comprador_tipo_documento
    ORDER BY c.created_at DESC
    LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      NULL::text AS nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra,
      c.comprador_nombre,
      c.comprador_apellido,
      c.comprador_email,
      c.comprador_documento,
      c.comprador_tipo_documento,
      COALESCE(COUNT(en.id) FILTER (WHERE en.estado = 'USADA'), 0)::int AS entradas_usadas
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    LEFT JOIN entradas en ON en.compra_id = c.id
    ${whereClause}
    GROUP BY
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo,
      e.fecha_evento,
      e.locacion,
      e.localidad,
      e.provincia,
      e.creador_id,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at,
      c.comprador_nombre,
      c.comprador_apellido,
      c.comprador_email,
      c.comprador_documento,
      c.comprador_tipo_documento
    ORDER BY c.created_at DESC
    LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    [...params, limit, offset],
  );

  const organizerNames = await resolveOrganizerNames(result.rows);

  return result.rows.map((row) =>
    buildCompraGestionResumen(
      row,
      organizerNames.get(row.creador_id) || "Organizador",
    ),
  );
}

export async function listComprasForAdmin(
  options?: { limit?: number; offset?: number },
): Promise<CompraGestionResumen[]> {
  return listComprasGestionadas("", [], options);
}

export async function listComprasByOrganizer(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<CompraGestionResumen[]> {
  return listComprasGestionadas("WHERE e.creador_id = $1", [userId], options);
}

export async function getCompraDetalleByUser(
  userId: string,
  compraId: string,
): Promise<CompraDetalle> {
  const compraResult = await queryWithOrganizerNameFallback<CompraListRow>(
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      e.nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.id = $1 AND c.user_id = $2
    LIMIT 1`,
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
      NULL::text AS nombre_organizador,
      c.cantidad,
      c.precio_unitario,
      c.precio_total,
      c.metodo_pago,
      c.estado,
      c.created_at AS fecha_compra
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.id = $1 AND c.user_id = $2
    LIMIT 1`,
    [compraId, userId],
  );

  if (compraResult.rows.length === 0) {
    throw new AppError(404, "COMPRA_NO_ENCONTRADA", "Compra no encontrada");
  }

  const compraRow = compraResult.rows[0];
  const organizerNames = await resolveOrganizerNames([compraRow]);
  const entradasResult = await query<EntradaRow>(
    `SELECT
      id,
      compra_id,
      evento_id,
      numero_entrada,
      qr_token,
      estado,
      usada_at
    FROM entradas
    WHERE compra_id = $1
    ORDER BY numero_entrada ASC`,
    [compraId],
  );

  return {
    ...buildCompraResumen(
      compraRow,
      organizerNames.get(compraRow.creador_id) || "Organizador",
    ),
    entradas: entradasResult.rows.map(buildEntradaResumen),
  };
}

export async function getPerfilCompradorByUser(
  userId: string,
): Promise<PerfilComprador | null> {
  const result = await query<PerfilCompradorRow>(
    `SELECT
      comprador_nombre,
      comprador_apellido,
      comprador_email,
      comprador_documento,
      comprador_tipo_documento
    FROM compras
    WHERE user_id = $1
      AND comprador_email IS NOT NULL
      AND comprador_documento IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    nombre: row.comprador_nombre?.trim() || "",
    apellido: row.comprador_apellido?.trim() || "",
    email: row.comprador_email?.trim() || "",
    documento: row.comprador_documento?.trim() || "",
    tipoDocumento: row.comprador_tipo_documento?.trim() || "DNI",
  };
}

function buildEntradaNoDisponibleError(compraEstado: EstadoCompra): AppError {
  if (compraEstado === "PENDIENTE") {
    return new AppError(
      400,
      "ENTRADA_NO_DISPONIBLE",
      "Entrada no disponible, pago pendiente",
    );
  }

  return new AppError(
    400,
    "ENTRADA_NO_DISPONIBLE",
    "Esta entrada no esta disponible porque la compra fue cancelada",
  );
}

export async function getEntradaDetalleByUser(
  userId: string,
  entradaId: string,
): Promise<EntradaDetalle> {
  const result = await queryWithOrganizerNameFallback<EntradaDetalleRow>(
    `SELECT
      en.id,
      en.compra_id,
      en.evento_id,
      en.numero_entrada,
      en.qr_token,
      en.estado,
      en.usada_at,
      c.user_id AS compra_user_id,
      c.estado AS compra_estado,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      e.locacion,
      e.direccion,
      e.creador_id,
      e.nombre_organizador
    FROM entradas en
    INNER JOIN compras c ON c.id = en.compra_id
    INNER JOIN eventos e ON e.id = en.evento_id
    WHERE en.id = $1 AND c.user_id = $2
    LIMIT 1`,
    `SELECT
      en.id,
      en.compra_id,
      en.evento_id,
      en.numero_entrada,
      en.qr_token,
      en.estado,
      en.usada_at,
      c.user_id AS compra_user_id,
      c.estado AS compra_estado,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      e.locacion,
      e.direccion,
      e.creador_id,
      NULL::text AS nombre_organizador
    FROM entradas en
    INNER JOIN compras c ON c.id = en.compra_id
    INNER JOIN eventos e ON e.id = en.evento_id
    WHERE en.id = $1 AND c.user_id = $2
    LIMIT 1`,
    [entradaId, userId],
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "ENTRADA_NO_ENCONTRADA", "Entrada no encontrada");
  }

  const row = result.rows[0];
  if (row.compra_estado !== "PAGADO") {
    throw buildEntradaNoDisponibleError(row.compra_estado);
  }

  const [buyer, organizer] = await Promise.all([
    getPublicUserById(row.compra_user_id),
    row.nombre_organizador?.trim()
      ? Promise.resolve(null)
      : getPublicUserById(row.creador_id),
  ]);

  if (!buyer) {
    throw new AppError(
      500,
      "USUARIO_NO_ENCONTRADO",
      "No se pudo resolver el comprador de la entrada",
    );
  }

  const organizerName =
    row.nombre_organizador?.trim() ||
    organizer?.nombreCompleto ||
    "Organizador";
  // URL publica que codificamos dentro del QR. Cuando alguien escanea el QR
  // con el celular se abre directamente la pagina de confirmacion de la
  // compra sin requerir sesion. El check-in del organizador sigue usando
  // el compraId via PATCH /api/compras/organizador/:id/checkin, asi que no
  // depende del contenido del QR.
  const qrTargetUrl = `${env.frontendUrl.replace(/\/$/, "")}/checkout/estado?compra=${encodeURIComponent(row.compra_id)}`;
  const ticketAssets = await buildTicketAssets({
    entradaId: row.id,
    eventoTitulo: row.evento_titulo,
    fechaEvento: row.fecha_evento.toISOString(),
    locacion: row.locacion,
    direccion: row.direccion,
    organizador: organizerName,
    compradorNombre: buyer.nombreCompleto,
    qrData: qrTargetUrl,
  });

  return {
    entrada_id: row.id,
    compra_id: row.compra_id,
    numero_entrada: row.numero_entrada,
    qr_token: row.qr_token,
    qr_data: qrTargetUrl,
    qr_image_data_url: ticketAssets.qrImageDataUrl,
    qr_image_url: ticketAssets.qrImageUrl,
    qr_pdf_url: ticketAssets.qrPdfUrl,
    estado: row.estado,
    fecha_uso: toIsoString(row.usada_at),
    evento: {
      id: row.evento_id,
      titulo: row.evento_titulo,
      fecha_evento: row.fecha_evento.toISOString(),
      locacion: row.locacion,
      direccion: row.direccion,
      organizador: organizerName,
    },
    comprador: {
      id: buyer.id,
      nombre_completo: buyer.nombreCompleto,
      email: buyer.email,
    },
  };
}

export async function setCompraCheckInStatus(
  authUser: AuthUser,
  compraId: string,
  checkedIn: boolean,
): Promise<{ compraId: string; entradasUsadas: number }> {
  const result = await query<CompraOwnerRow>(
    `SELECT
      c.id,
      c.estado,
      e.creador_id
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.id = $1
    LIMIT 1`,
    [compraId],
  );

  const compra = result.rows[0];
  if (!compra) {
    throw new AppError(404, "COMPRA_NO_ENCONTRADA", "Compra no encontrada");
  }

  if (authUser.role === "ORGANIZADOR" && compra.creador_id !== authUser.id) {
    throw new AppError(
      403,
      "SIN_PERMISOS",
      "No tiene permisos para gestionar el check-in de esta compra",
    );
  }

  if (compra.estado !== "PAGADO") {
    throw new AppError(
      409,
      "COMPRA_NO_HABILITADA",
      "Solo las compras pagadas pueden marcarse en el check-in",
    );
  }

  if (checkedIn) {
    await query(
      `UPDATE entradas
       SET estado = 'USADA',
           usada_at = COALESCE(usada_at, NOW())
       WHERE compra_id = $1`,
      [compraId],
    );
  } else {
    await query(
      `UPDATE entradas
       SET estado = 'DISPONIBLE',
           usada_at = NULL
       WHERE compra_id = $1`,
      [compraId],
    );
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM entradas
     WHERE compra_id = $1
       AND estado = 'USADA'`,
    [compraId],
  );

  return {
    compraId,
    entradasUsadas: Number.parseInt(countResult.rows[0]?.count || "0", 10),
  };
}
