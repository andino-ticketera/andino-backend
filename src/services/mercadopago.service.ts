import crypto from "node:crypto";
import pool, { query } from "../db/pool.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../lib/logger.js";
import { sendPurchaseConfirmationEmail } from "./mail.service.js";
import type {
  EstadoCompra,
  EstadoMercadoPagoConexion,
  MercadoPagoConnectionStatus,
  MercadoPagoPreferenceInput,
  MercadoPagoPreferenceResult,
  MedioPago,
  PublicCheckoutStatus,
} from "../types/index.js";

interface OrganizerMercadoPagoRow {
  user_id: string;
  mp_user_id: string;
  mp_email: string | null;
  access_token: string;
  refresh_token: string | null;
  public_key: string | null;
  token_type: string | null;
  scope: string | null;
  expires_in: number | null;
  status: EstadoMercadoPagoConexion;
  connected_at: Date;
  last_checked_at: Date | null;
}

interface EventoCheckoutRow {
  id: string;
  titulo: string;
  precio: string;
  cantidad_entradas: number;
  entradas_vendidas: number;
  estado: string;
  medios_pago: MedioPago[];
  creador_id: string;
}

interface CompraWebhookRow {
  id: string;
  user_id: string | null;
  evento_id: string;
  cantidad: number;
  estado: EstadoCompra;
  organizador_mp_user_id: string | null;
}

interface CompraApproveRow extends CompraWebhookRow {
  entradas_vendidas: number;
  cantidad_entradas: number;
}

interface PublicCheckoutStatusRow {
  id: string;
  estado: EstadoCompra;
  mp_status: string | null;
  cantidad: number;
  precio_total: string;
  comprador_email: string | null;
  created_at: Date;
  evento_titulo: string;
}

interface MercadoPagoOAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number | string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

interface MercadoPagoPaymentResponse {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  order?: {
    id?: number | string;
  };
}

/** Enmascara un email para no exponer PII en endpoints publicos: "gas***@gmail.com" */
function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return email ? "***@***" : "";
  const visible = email.slice(0, Math.min(3, atIndex));
  return `${visible}***${email.slice(atIndex)}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getBackendPublicUrl(): string {
  return env.backendPublicUrl.replace(/\/$/, "");
}

function isPublicHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.trim().toLowerCase();

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function buildOAuthRedirectUri(): string {
  return `${getBackendPublicUrl()}${env.mercadoPagoOAuthRedirectPath}`;
}

function buildSignedState(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, ts: Date.now() }),
    "utf8",
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", env.mercadoPagoOAuthStateSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

// Tiempo maximo de validez del state OAuth: 10 minutos
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function parseSignedState(state: string): { userId: string; ts: number } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new AppError(400, "MP_STATE_INVALIDO", "State OAuth invalido");
  }

  const expected = crypto
    .createHmac("sha256", env.mercadoPagoOAuthStateSecret)
    .update(payload)
    .digest("base64url");

  // Comparacion en tiempo constante para evitar timing attacks
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new AppError(400, "MP_STATE_INVALIDO", "State OAuth invalido");
  }

  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    userId?: string;
    ts?: number;
  };

  if (!parsed.userId || !parsed.ts) {
    throw new AppError(400, "MP_STATE_INVALIDO", "State OAuth invalido");
  }

  // Verificar que el state no haya expirado
  if (Date.now() - parsed.ts > OAUTH_STATE_MAX_AGE_MS) {
    throw new AppError(
      400,
      "MP_STATE_EXPIRADO",
      "El enlace de autorizacion de Mercado Pago expiro. Volve a intentarlo desde el panel.",
    );
  }

  return { userId: parsed.userId, ts: parsed.ts };
}

function getOrganizerDashboardUrl(
  queryParams?: Record<string, string>,
): string {
  const target = new URL(
    `${env.frontendUrl.replace(/\/$/, "")}/organizador/dashboard`,
  );
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      target.searchParams.set(key, value);
    }
  }
  return target.toString();
}

async function parseMercadoPagoError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
      cause?: Array<{ description?: string }>;
    };

    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
    if (payload.cause?.[0]?.description) return payload.cause[0].description;
  } catch {
    // ignore
  }

  return `Mercado Pago respondio con estado ${response.status}`;
}

async function fetchMercadoPagoJson<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${env.mercadoPagoApiBaseUrl.replace(/\/$/, "")}${path}`,
    {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
      },
    },
  );

  if (!response.ok) {
    throw new AppError(
      502,
      "MP_API_ERROR",
      await parseMercadoPagoError(response),
    );
  }

  return (await response.json()) as T;
}

async function getOrganizerConnection(
  userId: string,
): Promise<OrganizerMercadoPagoRow | null> {
  const result = await query<OrganizerMercadoPagoRow>(
    `SELECT
      user_id,
      mp_user_id,
      mp_email,
      access_token,
      refresh_token,
      public_key,
      token_type,
      scope,
      expires_in,
      status,
      connected_at,
      last_checked_at
    FROM organizador_mercado_pago
    WHERE user_id = $1
    LIMIT 1`,
    [userId],
  );

  return result.rows[0] || null;
}

function getPlatformModeStatus(): MercadoPagoConnectionStatus {
  const platformConfigured =
    env.mercadoPagoDevUsePlatformAccount &&
    env.mercadoPagoPlatformAccessToken &&
    env.mercadoPagoPlatformPublicKey;

  if (!platformConfigured) {
    return {
      status: "NO_CONECTADA",
      mpEmail: null,
      mpUserId: null,
      connectedAt: null,
      publicKey: null,
      mode: "not_configured",
    };
  }

  return {
    status: "CONECTADA",
    mpEmail: null,
    mpUserId: null,
    connectedAt: null,
    publicKey: env.mercadoPagoPlatformPublicKey,
    mode: "platform_test",
  };
}

export async function getMercadoPagoConnectionStatus(
  userId: string,
): Promise<MercadoPagoConnectionStatus> {
  const connection = await getOrganizerConnection(userId);

  if (connection) {
    return {
      status: connection.status,
      mpEmail: connection.mp_email,
      mpUserId: connection.mp_user_id,
      connectedAt: connection.connected_at.toISOString(),
      publicKey: connection.public_key,
      mode: "oauth",
    };
  }

  if (env.mercadoPagoDevMode) {
    return getPlatformModeStatus();
  }

  return {
    status: "NO_CONECTADA",
    mpEmail: null,
    mpUserId: null,
    connectedAt: null,
    publicKey: null,
    mode: "not_configured",
  };
}

export async function assertOrganizerMercadoPagoReadyForEvents(
  userId: string,
): Promise<void> {
  const status = await getMercadoPagoConnectionStatus(userId);

  if (status.status === "CONECTADA" || status.mode === "platform_test") {
    return;
  }

  if (status.status === "REQUIERE_RECONEXION") {
    throw new AppError(
      409,
      "MP_REQUIERE_RECONEXION",
      "Reconecta tu cuenta de Mercado Pago antes de publicar o editar eventos que cobren por Checkout Pro",
    );
  }

  throw new AppError(
    409,
    "MP_CUENTA_NO_CONECTADA",
    "Antes de publicar o editar un evento con Mercado Pago, activa cobros desde tu panel de organizador",
  );
}

export async function createMercadoPagoConnectUrl(
  userId: string,
): Promise<string> {
  if (!env.mercadoPagoClientId || !env.mercadoPagoClientSecret) {
    throw new AppError(
      503,
      "MP_OAUTH_NO_CONFIGURADO",
      "Mercado Pago OAuth no esta configurado en este entorno",
    );
  }

  const url = new URL(env.mercadoPagoOAuthAuthorizeUrl);
  url.searchParams.set("client_id", env.mercadoPagoClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", buildSignedState(userId));
  url.searchParams.set("redirect_uri", buildOAuthRedirectUri());

  return url.toString();
}

export async function handleMercadoPagoOAuthCallback(input: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<string> {
  if (input.error) {
    return getOrganizerDashboardUrl({ mp: "error", reason: input.error });
  }

  if (!input.code || !input.state) {
    throw new AppError(
      400,
      "MP_CALLBACK_INVALIDO",
      "Callback de Mercado Pago invalido",
    );
  }

  const parsedState = parseSignedState(input.state);
  const form = new URLSearchParams();
  form.set("client_id", env.mercadoPagoClientId);
  form.set("client_secret", env.mercadoPagoClientSecret);
  form.set("grant_type", "authorization_code");
  form.set("code", input.code);
  form.set("redirect_uri", buildOAuthRedirectUri());

  const response = await fetch(
    `${env.mercadoPagoApiBaseUrl.replace(/\/$/, "")}/oauth/token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  if (!response.ok) {
    throw new AppError(
      502,
      "MP_OAUTH_TOKEN_ERROR",
      await parseMercadoPagoError(response),
    );
  }

  const tokenData = (await response.json()) as MercadoPagoOAuthTokenResponse;

  if (!tokenData.access_token || tokenData.user_id === undefined) {
    throw new AppError(
      502,
      "MP_OAUTH_TOKEN_ERROR",
      "Mercado Pago no devolvio credenciales validas",
    );
  }

  await query(
    `INSERT INTO organizador_mercado_pago (
      user_id,
      mp_user_id,
      mp_email,
      access_token,
      refresh_token,
      public_key,
      token_type,
      scope,
      expires_in,
      status,
      connected_at,
      last_checked_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'CONECTADA',NOW(),NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      mp_user_id = EXCLUDED.mp_user_id,
      mp_email = EXCLUDED.mp_email,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      public_key = EXCLUDED.public_key,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_in = EXCLUDED.expires_in,
      status = 'CONECTADA',
      connected_at = NOW(),
      last_checked_at = NOW()`,
    [
      parsedState.userId,
      String(tokenData.user_id),
      null,
      tokenData.access_token,
      tokenData.refresh_token || null,
      tokenData.public_key || null,
      tokenData.token_type || null,
      tokenData.scope || null,
      tokenData.expires_in || null,
    ],
  );

  return getOrganizerDashboardUrl({ mp: "connected" });
}

async function getCheckoutAccessContext(organizerUserId: string): Promise<{
  accessToken: string;
  publicKey: string;
  mpUserId: string | null;
}> {
  const organizerConnection = await getOrganizerConnection(organizerUserId);

  if (organizerConnection?.status === "CONECTADA") {
    if (!organizerConnection.public_key) {
      throw new AppError(
        503,
        "MP_PUBLIC_KEY_FALTANTE",
        "La cuenta conectada no devolvio public key de Mercado Pago",
      );
    }

    return {
      accessToken: organizerConnection.access_token,
      publicKey: organizerConnection.public_key,
      mpUserId: organizerConnection.mp_user_id,
    };
  }

  if (
    env.mercadoPagoDevMode &&
    env.mercadoPagoDevUsePlatformAccount &&
    env.mercadoPagoPlatformAccessToken &&
    env.mercadoPagoPlatformPublicKey
  ) {
    return {
      accessToken: env.mercadoPagoPlatformAccessToken,
      publicKey: env.mercadoPagoPlatformPublicKey,
      mpUserId: null,
    };
  }

  throw new AppError(
    409,
    "MP_CUENTA_NO_CONECTADA",
    "El organizador aun no tiene Mercado Pago conectado",
  );
}

function validateBuyer(input: MercadoPagoPreferenceInput): void {
  if (!input.eventoId?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Falta eventoId");
  }

  if (
    !Number.isInteger(input.cantidad) ||
    input.cantidad < 1 ||
    input.cantidad > 10
  ) {
    throw new AppError(400, "VALIDATION_ERROR", "Cantidad invalida");
  }

  const buyer = input.buyer;
  if (
    !buyer.nombre.trim() ||
    !buyer.apellido.trim() ||
    !buyer.documento.trim()
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Datos del comprador incompletos",
    );
  }

  if (!buyer.email.includes("@")) {
    throw new AppError(400, "VALIDATION_ERROR", "Email del comprador invalido");
  }
}

export async function createCheckoutPreference(
  userId: string | null,
  input: MercadoPagoPreferenceInput,
): Promise<MercadoPagoPreferenceResult> {
  validateBuyer(input);

  const eventResult = await query<EventoCheckoutRow>(
    `SELECT id, titulo, precio, cantidad_entradas, entradas_vendidas, estado, medios_pago, creador_id
    FROM eventos
    WHERE id = $1
    LIMIT 1`,
    [input.eventoId],
  );

  const evento = eventResult.rows[0];
  if (!evento || evento.estado === "CANCELADO") {
    throw new AppError(
      404,
      "EVENTO_NO_ENCONTRADO",
      "El evento solicitado no existe",
    );
  }

  if (!evento.medios_pago.includes("MERCADO_PAGO")) {
    throw new AppError(
      409,
      "MP_NO_HABILITADO",
      "El evento no acepta Mercado Pago",
    );
  }

  if (evento.entradas_vendidas + input.cantidad > evento.cantidad_entradas) {
    throw new AppError(
      409,
      "SIN_STOCK",
      "No hay stock suficiente para esa cantidad",
    );
  }

  const precioUnitario = roundCurrency(Number.parseFloat(evento.precio));
  if (!(precioUnitario > 0)) {
    throw new AppError(
      409,
      "PRECIO_INVALIDO",
      "Este evento no puede cobrarse por Mercado Pago",
    );
  }

  const precioBase = roundCurrency(precioUnitario * input.cantidad);
  const costoServicio = roundCurrency(
    (precioBase * env.mercadoPagoFeePercentage) / 100,
  );
  const total = roundCurrency(precioBase + costoServicio);
  const itemTitle =
    input.cantidad > 1
      ? `${evento.titulo} (${input.cantidad} entradas)`
      : evento.titulo;
  const accessContext = await getCheckoutAccessContext(evento.creador_id);

  const compraResult = await query<{ id: string }>(
    `INSERT INTO compras (
      user_id,
      evento_id,
      cantidad,
      precio_unitario,
      precio_total,
      metodo_pago,
      estado,
      precio_base,
      costo_servicio,
      fee_porcentaje,
      organizador_mp_user_id,
      mp_status,
      comprador_nombre,
      comprador_apellido,
      comprador_email,
      comprador_documento,
      comprador_tipo_documento
    ) VALUES ($1,$2,$3,$4,$5,'MERCADO_PAGO','PENDIENTE',$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14)
    RETURNING id`,
    [
      userId,
      evento.id,
      input.cantidad,
      precioUnitario,
      total,
      precioBase,
      costoServicio,
      env.mercadoPagoFeePercentage,
      accessContext.mpUserId,
      input.buyer.nombre.trim(),
      input.buyer.apellido.trim(),
      input.buyer.email.trim(),
      input.buyer.documento.trim(),
      input.buyer.tipoDocumento?.trim() || "DNI",
    ],
  );

  const compraId = compraResult.rows[0].id;
  const frontendBaseUrl = env.frontendUrl.replace(/\/$/, "");
  const backendBaseUrl = getBackendPublicUrl();
  const canUseBackUrls = isPublicHttpUrl(frontendBaseUrl);
  const canUseWebhookUrl = isPublicHttpUrl(backendBaseUrl);
  const redirectUrl = userId
    ? `${frontendBaseUrl}/usuario/compras/${compraId}`
    : `${frontendBaseUrl}/checkout/estado?compra=${encodeURIComponent(compraId)}`;
  const preferencePayload: Record<string, unknown> = {
    items: [
      {
        id: evento.id,
        title: itemTitle,
        quantity: 1,
        currency_id: "ARS",
        unit_price: total,
      },
    ],
    payer: {
      email: input.buyer.email.trim(),
      name: input.buyer.nombre.trim(),
      surname: input.buyer.apellido.trim(),
      identification: {
        type: input.buyer.tipoDocumento?.trim() || "DNI",
        number: input.buyer.documento.trim(),
      },
    },
    external_reference: compraId,
    marketplace_fee: costoServicio,
    metadata: {
      compra_id: compraId,
      buyer_user_id: userId,
      buyer_email: input.buyer.email.trim(),
      evento_id: evento.id,
    },
  };

  if (canUseWebhookUrl) {
    const notificationUrl = new URL(
      `${backendBaseUrl}${env.apiBasePath}/pagos/mercado-pago/webhook`,
    );
    notificationUrl.searchParams.set("compra_id", compraId);
    preferencePayload.notification_url = notificationUrl.toString();
  } else {
    logger.warn(
      "Mercado Pago sin notification_url por backend local/no publico",
      {
        compraId,
        backendBaseUrl,
      },
    );
  }

  if (canUseBackUrls) {
    preferencePayload.back_urls = {
      success: redirectUrl,
      pending: redirectUrl,
      failure: redirectUrl,
    };
    preferencePayload.auto_return = "approved";
  } else {
    logger.warn(
      "Mercado Pago sin back_urls ni auto_return por frontend local/no publico",
      {
        compraId,
        frontendBaseUrl,
      },
    );
  }

  const preference = await fetchMercadoPagoJson<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    accessContext.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(preferencePayload),
    },
  );

  if (
    !preference.id ||
    (!preference.init_point && !preference.sandbox_init_point)
  ) {
    throw new AppError(
      502,
      "MP_PREFERENCE_ERROR",
      "Mercado Pago no devolvio una preferencia valida",
    );
  }

  await query(`UPDATE compras SET mp_preference_id = $1 WHERE id = $2`, [
    preference.id,
    compraId,
  ]);

  // En produccion usar init_point (checkout real).
  // Solo en dev mode usar sandbox_init_point como fallback.
  const checkoutUrl = env.mercadoPagoDevMode
    ? preference.sandbox_init_point || preference.init_point || ""
    : preference.init_point || preference.sandbox_init_point || "";

  return {
    compraId,
    preferenceId: preference.id,
    publicKey: accessContext.publicKey,
    checkoutUrl,
    precioBase,
    costoServicio,
    total,
  };
}

export async function getPublicCheckoutStatus(
  compraId: string,
): Promise<PublicCheckoutStatus> {
  const result = await query<PublicCheckoutStatusRow>(
    `SELECT
      c.id,
      c.estado,
      c.mp_status,
      c.cantidad,
      c.precio_total,
      c.comprador_email,
      c.created_at,
      e.titulo AS evento_titulo
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

  return {
    compraId: compra.id,
    estado: compra.estado,
    mpStatus: compra.mp_status,
    eventoTitulo: compra.evento_titulo,
    cantidad: compra.cantidad,
    total: Number.parseFloat(compra.precio_total),
    compradorEmail: maskEmail(compra.comprador_email || ""),
    createdAt: compra.created_at.toISOString(),
  };
}

async function resolveAccessTokenForCompra(compraId: string): Promise<string> {
  const compraResult = await query<CompraWebhookRow>(
    `SELECT id, user_id, evento_id, cantidad, estado, organizador_mp_user_id
    FROM compras
    WHERE id = $1
    LIMIT 1`,
    [compraId],
  );

  const compra = compraResult.rows[0];
  if (!compra) {
    throw new AppError(404, "COMPRA_NO_ENCONTRADA", "Compra no encontrada");
  }

  if (compra.organizador_mp_user_id) {
    const organizerResult = await query<{ access_token: string }>(
      `SELECT access_token
      FROM organizador_mercado_pago
      WHERE mp_user_id = $1
      LIMIT 1`,
      [compra.organizador_mp_user_id],
    );

    if (organizerResult.rows[0]?.access_token) {
      return organizerResult.rows[0].access_token;
    }
  }

  if (!env.mercadoPagoPlatformAccessToken) {
    throw new AppError(
      503,
      "MP_TOKEN_NO_CONFIGURADO",
      "No hay token disponible para consultar el pago",
    );
  }

  return env.mercadoPagoPlatformAccessToken;
}

async function markCompraPaymentState(input: {
  compraId: string;
  paymentId: string;
  merchantOrderId: string | null;
  status: string;
}): Promise<void> {
  const nextEstado =
    input.status === "approved"
      ? "PAGADO"
      : input.status === "rejected" || input.status === "cancelled"
        ? "CANCELADO"
        : "PENDIENTE";

  await query(
    `UPDATE compras
    SET
      estado = $2,
      mp_payment_id = $3,
      mp_merchant_order_id = $4,
      mp_status = $5
    WHERE id = $1`,
    [
      input.compraId,
      nextEstado,
      input.paymentId,
      input.merchantOrderId,
      input.status,
    ],
  );
}

async function approveCompra(
  compraId: string,
  payment: MercadoPagoPaymentResponse,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const compraResult = await client.query<CompraApproveRow>(
      `SELECT
        c.id,
        c.user_id,
        c.evento_id,
        c.cantidad,
        c.estado,
        c.organizador_mp_user_id,
        e.entradas_vendidas,
        e.cantidad_entradas
      FROM compras c
      INNER JOIN eventos e ON e.id = c.evento_id
      WHERE c.id = $1
      FOR UPDATE`,
      [compraId],
    );

    const compra = compraResult.rows[0];
    if (!compra) {
      throw new AppError(404, "COMPRA_NO_ENCONTRADA", "Compra no encontrada");
    }

    if (compra.estado === "PAGADO") {
      await client.query("COMMIT");
      return;
    }

    if (compra.entradas_vendidas + compra.cantidad > compra.cantidad_entradas) {
      await client.query(
        `UPDATE compras
        SET estado = 'CANCELADO', mp_status = $2, mp_payment_id = $3, mp_merchant_order_id = $4
        WHERE id = $1`,
        [
          compraId,
          payment.status || "approved_without_stock",
          payment.id ? String(payment.id) : null,
          payment.order?.id ? String(payment.order.id) : null,
        ],
      );
      await client.query("COMMIT");
      return;
    }

    await client.query(
      `UPDATE compras
      SET estado = 'PAGADO', mp_status = $2, mp_payment_id = $3, mp_merchant_order_id = $4
      WHERE id = $1`,
      [
        compraId,
        payment.status || "approved",
        payment.id ? String(payment.id) : null,
        payment.order?.id ? String(payment.order.id) : null,
      ],
    );

    const existingEntradas = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entradas WHERE compra_id = $1`,
      [compraId],
    );

    if (Number.parseInt(existingEntradas.rows[0]?.count || "0", 10) === 0) {
      for (let index = 1; index <= compra.cantidad; index += 1) {
        await client.query(
          `INSERT INTO entradas (compra_id, evento_id, numero_entrada, estado)
          VALUES ($1,$2,$3,'DISPONIBLE')`,
          [compraId, compra.evento_id, index],
        );
      }
    }

    await client.query(
      `UPDATE eventos
      SET
        entradas_vendidas = entradas_vendidas + $2,
        estado = CASE
          WHEN entradas_vendidas + $2 >= cantidad_entradas THEN 'AGOTADO'
          ELSE estado
        END
      WHERE id = $1`,
      [compra.evento_id, compra.cantidad],
    );

    await client.query("COMMIT");

    try {
      await sendPurchaseConfirmationEmail(compraId);
    } catch (error) {
      logger.error("No se pudo enviar el email de confirmacion de compra", {
        compraId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processMercadoPagoPaymentNotification(input: {
  compraId?: string;
  paymentId?: string;
}): Promise<void> {
  if (!input.compraId || !input.paymentId) {
    logger.warn("Webhook Mercado Pago sin datos minimos", {
      compraId: input.compraId,
      paymentId: input.paymentId,
    });
    return;
  }

  const accessToken = await resolveAccessTokenForCompra(input.compraId);
  const payment = await fetchMercadoPagoJson<MercadoPagoPaymentResponse>(
    `/v1/payments/${input.paymentId}`,
    accessToken,
    { method: "GET" },
  );

  if (
    payment.external_reference &&
    payment.external_reference !== input.compraId
  ) {
    logger.warn("Webhook Mercado Pago con referencia cruzada", {
      compraId: input.compraId,
      paymentId: input.paymentId,
      externalReference: payment.external_reference,
    });
    return;
  }

  if (payment.status === "approved") {
    await approveCompra(input.compraId, payment);
    return;
  }

  await markCompraPaymentState({
    compraId: input.compraId,
    paymentId: String(payment.id || input.paymentId),
    merchantOrderId: payment.order?.id ? String(payment.order.id) : null,
    status: payment.status || "pending",
  });
}
