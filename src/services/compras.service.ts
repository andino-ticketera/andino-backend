import { query } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import type {
  CompraDetalle,
  CompraResumen,
  EntradaDetalle,
  EntradaResumen,
  EstadoCompra,
  EstadoEntrada,
  MedioPago,
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
}

function toNumber(value: string): number {
  return Number.parseFloat(value);
}

function toIsoString(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
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
    qr_token: row.qr_token,
    estado: row.estado,
    fecha_uso: toIsoString(row.usada_at),
  };
}

async function resolveOrganizerNames(
  rows: CompraListRow[],
): Promise<Map<string, string>> {
  const usersById = await getPublicUsersByIds(
    rows.map((row) => row.creador_id),
  );
  const organizerNames = new Map<string, string>();

  for (const row of rows) {
    const organizer = usersById.get(row.creador_id);
    organizerNames.set(
      row.creador_id,
      organizer?.nombreCompleto || "Organizador",
    );
  }

  return organizerNames;
}

export async function listComprasByUser(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<CompraResumen[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const result = await query<CompraListRow>(
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
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

export async function getCompraDetalleByUser(
  userId: string,
  compraId: string,
): Promise<CompraDetalle> {
  const compraResult = await query<CompraListRow>(
    `SELECT
      c.id,
      c.user_id,
      c.evento_id,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      CONCAT(e.locacion, ', ', e.localidad, ', ', e.provincia) AS ubicacion_evento,
      e.creador_id,
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
  const result = await query<EntradaDetalleRow>(
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
      e.creador_id
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
    getPublicUserById(row.creador_id),
  ]);

  if (!buyer) {
    throw new AppError(
      500,
      "USUARIO_NO_ENCONTRADO",
      "No se pudo resolver el comprador de la entrada",
    );
  }

  const organizerName = organizer?.nombreCompleto || "Organizador";
  const ticketAssets = await buildTicketAssets({
    entradaId: row.id,
    eventoTitulo: row.evento_titulo,
    fechaEvento: row.fecha_evento.toISOString(),
    locacion: row.locacion,
    direccion: row.direccion,
    organizador: organizerName,
    compradorNombre: buyer.nombreCompleto,
    qrData: row.id,
  });

  return {
    entrada_id: row.id,
    compra_id: row.compra_id,
    numero_entrada: row.numero_entrada,
    qr_token: row.qr_token,
    qr_data: row.id,
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
