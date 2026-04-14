import { Resend } from "resend";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../utils/errors.js";
import { isMissingColumnError } from "../utils/db-compat.js";
import {
  normalizeEmail,
  normalizeFullName,
} from "../validators/auth.validator.js";

interface ContactMessageInput {
  nombre: string;
  email: string;
  asunto: string;
  mensaje: string;
}

interface OrganizerLeadInput {
  pais: string;
  nombre: string;
  apellido: string;
  empresa: string;
  email: string;
  telefono: string;
}

interface PurchaseEmailRow {
  id: string;
  user_id: string | null;
  comprador_nombre: string | null;
  comprador_apellido: string | null;
  comprador_email: string | null;
  precio_total: string;
  created_at: Date;
  evento_titulo: string;
  fecha_evento: Date;
  locacion: string;
  direccion: string;
}

interface PurchaseEntryRow {
  id: string;
  numero_entrada: number;
}

interface ValidatedContactMessage {
  nombre: string;
  email: string;
  asunto: string;
  mensaje: string;
}

interface ValidatedOrganizerLead {
  pais: string;
  nombre: string;
  apellido: string;
  empresa: string;
  email: string;
  telefono: string;
}

const resendClient = env.resendApiKey ? new Resend(env.resendApiKey) : null;

function isOrganizerNameColumnMissing(error: unknown): boolean {
  return isMissingColumnError(error, "nombre_organizador");
}

function serializeProviderError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { raw: String(error) };
  }

  const candidate = error as Record<string, unknown>;
  return {
    name: candidate.name,
    message: candidate.message,
    code: candidate.code,
    statusCode: candidate.statusCode,
    raw: candidate,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function getFromAddress(): string {
  return `${env.resendFromName} <${env.resendFromEmail}>`;
}

function getResendClient(): Resend {
  if (!resendClient) {
    throw new AppError(
      503,
      "EMAIL_NO_CONFIGURADO",
      "El servicio de email no esta configurado",
    );
  }

  return resendClient;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(value);
}

function validateContactMessage(
  input: ContactMessageInput,
): ValidatedContactMessage {
  const nombre = normalizeFullName(input.nombre);
  const email = normalizeEmail(input.email);
  const asunto = String(input.asunto || "")
    .trim()
    .replace(/\s+/g, " ");
  const mensaje = String(input.mensaje || "").trim();

  if (!nombre || nombre.length < 3) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un nombre valido");
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un email valido");
  }

  if (!asunto || asunto.length < 3) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un asunto valido");
  }

  if (!mensaje || mensaje.length < 10) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "El mensaje debe tener al menos 10 caracteres",
    );
  }

  return { nombre, email, asunto, mensaje };
}

function validateOrganizerLead(
  input: OrganizerLeadInput,
): ValidatedOrganizerLead {
  const pais = String(input.pais || "")
    .trim()
    .replace(/\s+/g, " ");
  const nombre = normalizeFullName(input.nombre);
  const apellido = normalizeFullName(input.apellido);
  const empresa = String(input.empresa || "")
    .trim()
    .replace(/\s+/g, " ");
  const email = normalizeEmail(input.email);
  const telefono = String(input.telefono || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!pais || pais.length < 2) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un pais valido");
  }

  if (!nombre || nombre.length < 2) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un nombre valido");
  }

  if (!apellido || apellido.length < 2) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un apellido valido");
  }

  if (!empresa || empresa.length < 2) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Ingresa una empresa o productora valida",
    );
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un email valido");
  }

  if (!telefono || telefono.length < 6) {
    throw new AppError(400, "VALIDATION_ERROR", "Ingresa un telefono valido");
  }

  return { pais, nombre, apellido, empresa, email, telefono };
}

function buildEmailLayout(input: {
  pretitle: string;
  title: string;
  intro: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  // Nota: forzamos light mode con color-scheme/supported-color-schemes para que
  // Gmail/Apple Mail/Outlook no aplique auto-dark invert sobre el layout, que
  // antes rompia el header con gradiente oscuro y lo dejaba ilegible.
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(17,24,39,0.06);">
                <tr>
                  <td style="padding:28px 28px 22px;background:#ffffff;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;font-weight:800;color:#059669;">${escapeHtml(input.pretitle)}</div>
                    <h1 style="margin:10px 0 8px;font-size:26px;line-height:1.2;color:#111827;font-weight:800;">${escapeHtml(input.title)}</h1>
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">${escapeHtml(input.intro)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;background:#ffffff;">${input.bodyHtml}</td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px;background:#ffffff;font-size:12px;line-height:1.6;color:#6b7280;">
                    ${input.footerHtml || "Andino Tickets"}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildInternalNotificationHtml(lines: string[]): string {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <pre style="margin:0;white-space:pre-wrap;font:14px/1.6 Arial,Helvetica,sans-serif;">${escapeHtml(lines.join("\n"))}</pre>
      </body>
    </html>
  `;
}

export async function sendContactMessageEmail(
  input: ContactMessageInput,
): Promise<void> {
  const resend = getResendClient();

  const message = validateContactMessage(input);
  const textLines = [
    "Nuevo contacto web - Andino Tickets",
    `Nombre: ${message.nombre}`,
    `Email: ${message.email}`,
    `Asunto: ${message.asunto}`,
    "",
    message.mensaje,
  ];
  const text = textLines.join("\n");
  const html = buildInternalNotificationHtml(textLines);

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [env.contactRecipientEmail],
    replyTo: message.email,
    subject: `[Contacto Web] ${message.asunto}`,
    html,
    text,
  });

  if (error) {
    logger.error("Fallo envio de email de contacto", {
      from: getFromAddress(),
      to: [env.contactRecipientEmail],
      replyTo: message.email,
      resendError: serializeProviderError(error),
    });
    throw new AppError(
      502,
      "EMAIL_SEND_ERROR",
      "No se pudo enviar el mensaje de contacto. Revisa la configuracion de Resend.",
    );
  }
}

export async function sendOrganizerLeadEmail(
  input: OrganizerLeadInput,
): Promise<void> {
  const resend = getResendClient();
  const lead = validateOrganizerLead(input);
  const fullName = `${lead.nombre} ${lead.apellido}`.trim();

  const textLines = [
    "Nuevo lead de organizador - Andino Tickets",
    `Nombre: ${fullName}`,
    `Pais: ${lead.pais}`,
    `Empresa / Productora: ${lead.empresa}`,
    `Email: ${lead.email}`,
    `Telefono: ${lead.telefono}`,
  ];
  const text = textLines.join("\n");
  const html = buildInternalNotificationHtml(textLines);

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [env.contactRecipientEmail],
    replyTo: lead.email,
    subject: `[Organizador] ${fullName} quiere publicar eventos`,
    html,
    text,
  });

  if (error) {
    logger.error("Fallo envio de email de organizador", {
      from: getFromAddress(),
      to: [env.contactRecipientEmail],
      replyTo: lead.email,
      resendError: serializeProviderError(error),
    });
    throw new AppError(
      502,
      "EMAIL_SEND_ERROR",
      "No se pudo enviar la solicitud de organizador. Revisa la configuracion de Resend.",
    );
  }
}

async function loadPurchaseEmailPayload(compraId: string): Promise<{
  compra: PurchaseEmailRow;
  entradas: PurchaseEntryRow[];
}> {
  let compraResult;
  try {
    compraResult = await query<PurchaseEmailRow>(
      `SELECT
      c.id,
      c.user_id,
      c.comprador_nombre,
      c.comprador_apellido,
      c.comprador_email,
      c.precio_total,
      c.created_at,
      e.titulo AS evento_titulo,
      e.fecha_evento,
      e.locacion,
      e.direccion
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.id = $1 AND c.estado = 'PAGADO'
    LIMIT 1`,
      [compraId],
    );
  } catch (error) {
    if (!isOrganizerNameColumnMissing(error)) {
      throw error;
    }

    compraResult = await query<PurchaseEmailRow>(
      `SELECT
        c.id,
        c.user_id,
        c.comprador_nombre,
        c.comprador_apellido,
        c.comprador_email,
        c.precio_total,
        c.created_at,
        e.titulo AS evento_titulo,
        e.fecha_evento,
        e.locacion,
        e.direccion
      FROM compras c
      INNER JOIN eventos e ON e.id = c.evento_id
      WHERE c.id = $1 AND c.estado = 'PAGADO'
      LIMIT 1`,
      [compraId],
    );
  }

  const compra = compraResult.rows[0];
  if (!compra || !compra.comprador_email) {
    throw new AppError(404, "COMPRA_NO_ENCONTRADA", "Compra no encontrada");
  }

  const entradasResult = await query<PurchaseEntryRow>(
    `SELECT id, numero_entrada
    FROM entradas
    WHERE compra_id = $1
    ORDER BY numero_entrada ASC`,
    [compraId],
  );

  return {
    compra,
    entradas: entradasResult.rows,
  };
}

export async function sendPurchaseConfirmationEmail(
  compraId: string,
  options?: { failIfDisabled?: boolean },
): Promise<void> {
  if (!resendClient) {
    if (options?.failIfDisabled) {
      throw new AppError(
        503,
        "EMAIL_NO_CONFIGURADO",
        "El servicio de email no esta configurado",
      );
    }

    logger.warn(
      "Email de compra omitido por falta de configuracion de Resend",
      {
        compraId,
      },
    );
    return;
  }

  const resend = resendClient;

  const { compra, entradas } = await loadPurchaseEmailPayload(compraId);
  const buyerEmail = compra.comprador_email;

  if (!buyerEmail) {
    logger.warn("Email de compra omitido por comprador sin email", {
      compraId,
    });
    return;
  }

  const compradorNombre =
    [compra.comprador_nombre, compra.comprador_apellido]
      .filter(Boolean)
      .join(" ")
      .trim() || "Comprador";

  const baseFrontendUrl = env.frontendUrl.replace(/\/$/, "");
  // URL del boton "Ver detalle de compra": mandamos al usuario logueado a su
  // panel privado y a los guest al status publico.
  const compraUrl = compra.user_id
    ? `${baseFrontendUrl}/usuario/compras/${compra.id}`
    : `${baseFrontendUrl}/checkout/estado?compra=${encodeURIComponent(compra.id)}`;

  const entradasHtml = entradas
    .map(
      (entrada) => `
        <tr>
          <td style="padding:20px;border-radius:14px;background:#f9fafb;border:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#059669;font-weight:800;">Entrada ${entrada.numero_entrada}</div>
            <div style="margin-top:8px;font-size:15px;line-height:1.6;color:#111827;font-weight:600;">
              ${escapeHtml(compra.evento_titulo)}
            </div>
            <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#4b5563;">
              Tu compra ya está confirmada. Usá el botón principal de este mail para ver el detalle completo.
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  const html = buildEmailLayout({
    pretitle: "Compra confirmada",
    title: `Tus entradas para ${compra.evento_titulo}`,
    intro: `Hola ${escapeHtml(compradorNombre)}, tu pago fue acreditado y ya emitimos ${entradas.length === 1 ? "tu entrada" : "tus entradas"}.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 14px;">
        <tr>
          <td style="padding:20px;border-radius:14px;background:#f9fafb;border:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#059669;font-weight:800;">Resumen de compra</div>
            <div style="margin-top:12px;font-size:15px;line-height:1.85;color:#111827;">
              <strong style="color:#374151;">Evento:</strong> ${escapeHtml(compra.evento_titulo)}<br />
              <strong style="color:#374151;">Fecha:</strong> ${escapeHtml(formatDate(compra.fecha_evento))}<br />
              <strong style="color:#374151;">Lugar:</strong> ${escapeHtml(compra.locacion)}<br />
              <strong style="color:#374151;">Direccion:</strong> ${escapeHtml(compra.direccion)}<br />
              <strong style="color:#374151;">Total:</strong> ${escapeHtml(formatMoney(Number.parseFloat(compra.precio_total)))}
            </div>
            <a href="${escapeHtml(compraUrl)}" style="display:inline-block;margin-top:18px;padding:12px 20px;border-radius:999px;background:#10b981;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;">Ver confirmacion de compra</a>
          </td>
        </tr>
        ${entradasHtml}
      </table>
    `,
    footerHtml:
      "Este email confirma tu compra. Si necesitás revisarla de nuevo, usá el botón para abrir la confirmación en la web.<br />Andino Tickets",
  });

  const text = [
    `Compra confirmada - ${compra.evento_titulo}`,
    `Evento: ${compra.evento_titulo}`,
    `Fecha: ${formatDate(compra.fecha_evento)}`,
    `Lugar: ${compra.locacion}`,
    `Direccion: ${compra.direccion}`,
    `Total: ${formatMoney(Number.parseFloat(compra.precio_total))}`,
    `Confirmacion: ${compraUrl}`,
    "",
    ...entradas.map((entrada) => `Entrada ${entrada.numero_entrada}`),
  ]
    .filter(Boolean)
    .join("\n");

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [buyerEmail],
    subject: `Tu compra fue confirmada - ${compra.evento_titulo}`,
    html,
    text,
  });

  if (error) {
    logger.error("Fallo envio de email de compra", {
      compraId,
      from: getFromAddress(),
      to: [buyerEmail],
      resendError: serializeProviderError(error),
    });
    throw new AppError(
      502,
      "EMAIL_SEND_ERROR",
      "No se pudo enviar el email de la compra. Revisar configuracion de Resend.",
    );
  }
}
