import { Resend } from "resend";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../utils/errors.js";
import {
  normalizeEmail,
  normalizeFullName,
} from "../validators/auth.validator.js";
import { getPublicUserById } from "./auth.service.js";
import { buildTicketAssets } from "./ticket-assets.service.js";

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
  creador_id: string;
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
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#12091d;font-family:Arial,Helvetica,sans-serif;color:#f6f4fb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#12091d;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#231135;border:1px solid #4a2d6b;border-radius:20px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 28px 18px;background:radial-gradient(circle at top left,#244d3a 0%,#231135 45%);">
                    <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:#8ce7ba;">${escapeHtml(input.pretitle)}</div>
                    <h1 style="margin:12px 0 8px;font-size:30px;line-height:1.1;color:#ffffff;">${escapeHtml(input.title)}</h1>
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#d2c5e6;">${escapeHtml(input.intro)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">${input.bodyHtml}</td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;font-size:13px;line-height:1.7;color:#a794c6;">
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
  organizador: string;
}> {
  const compraResult = await query<PurchaseEmailRow>(
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
      e.direccion,
      e.creador_id
    FROM compras c
    INNER JOIN eventos e ON e.id = c.evento_id
    WHERE c.id = $1 AND c.estado = 'PAGADO'
    LIMIT 1`,
    [compraId],
  );

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

  const organizador = await getPublicUserById(compra.creador_id);

  return {
    compra,
    entradas: entradasResult.rows,
    organizador: organizador?.nombreCompleto || "Andino Tickets",
  };
}

export async function sendPurchaseConfirmationEmail(
  compraId: string,
): Promise<void> {
  if (!resendClient) {
    logger.warn(
      "Email de compra omitido por falta de configuracion de Resend",
      {
        compraId,
      },
    );
    return;
  }

  const resend = resendClient;

  const { compra, entradas, organizador } =
    await loadPurchaseEmailPayload(compraId);
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
  const compraUrl = compra.user_id
    ? `${baseFrontendUrl}/usuario/compras/${compra.id}`
    : `${baseFrontendUrl}/checkout/estado?compra=${encodeURIComponent(compra.id)}`;

  const ticketAssets = await Promise.all(
    entradas.map(async (entrada) => ({
      entrada,
      assets: await buildTicketAssets({
        entradaId: entrada.id,
        eventoTitulo: compra.evento_titulo,
        fechaEvento: compra.fecha_evento.toISOString(),
        locacion: compra.locacion,
        direccion: compra.direccion,
        organizador,
        compradorNombre,
        qrData: entrada.id,
      }),
    })),
  );

  const entradasHtml = ticketAssets
    .map(({ entrada, assets }) => {
      const qrPreview = assets.qrImageUrl
        ? `<div style="margin-top:14px;"><img src="${escapeHtml(assets.qrImageUrl)}" alt="QR entrada ${entrada.numero_entrada}" width="160" height="160" style="display:block;border:1px solid #4a2d6b;border-radius:14px;background:#fff;padding:8px;" /></div>`
        : "";
      const links = [
        assets.qrPdfUrl
          ? `<a href="${escapeHtml(assets.qrPdfUrl)}" style="display:inline-block;margin-right:10px;margin-top:12px;padding:10px 14px;border-radius:999px;background:#5de8a0;color:#04110d;text-decoration:none;font-weight:700;">Descargar PDF</a>`
          : "",
        assets.qrImageUrl
          ? `<a href="${escapeHtml(assets.qrImageUrl)}" style="display:inline-block;margin-top:12px;padding:10px 14px;border-radius:999px;border:1px solid #5de8a0;color:#5de8a0;text-decoration:none;font-weight:700;">Abrir QR</a>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      return `
        <tr>
          <td style="padding:16px;border-radius:14px;background:#2b1840;border:1px solid #4a2d6b;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8ce7ba;font-weight:700;">Entrada ${entrada.numero_entrada}</div>
            <div style="margin-top:10px;font-size:14px;line-height:1.8;color:#f6f4fb;">
              ID: ${escapeHtml(entrada.id)}<br />
              Evento: ${escapeHtml(compra.evento_titulo)}
            </div>
            ${qrPreview}
            ${links}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = buildEmailLayout({
    pretitle: "Compra confirmada",
    title: `Tus entradas para ${compra.evento_titulo}`,
    intro: `Hola ${escapeHtml(compradorNombre)}, tu pago fue acreditado y ya emitimos ${entradas.length === 1 ? "tu entrada" : "tus entradas"}.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 12px;">
        <tr>
          <td style="padding:16px;border-radius:14px;background:#2b1840;border:1px solid #4a2d6b;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8ce7ba;font-weight:700;">Resumen de compra</div>
            <div style="margin-top:10px;font-size:15px;line-height:1.8;color:#f6f4fb;">
              <strong>Compra:</strong> ${escapeHtml(compra.id)}<br />
              <strong>Evento:</strong> ${escapeHtml(compra.evento_titulo)}<br />
              <strong>Fecha:</strong> ${escapeHtml(formatDate(compra.fecha_evento))}<br />
              <strong>Lugar:</strong> ${escapeHtml(compra.locacion)}<br />
              <strong>Direccion:</strong> ${escapeHtml(compra.direccion)}<br />
              <strong>Total:</strong> ${escapeHtml(formatMoney(Number.parseFloat(compra.precio_total)))}
            </div>
            <a href="${escapeHtml(compraUrl)}" style="display:inline-block;margin-top:16px;padding:12px 18px;border-radius:999px;background:#5de8a0;color:#04110d;text-decoration:none;font-weight:800;">Ver detalle de compra</a>
          </td>
        </tr>
        ${entradasHtml}
      </table>
    `,
    footerHtml:
      "Si no ves el QR embebido en tu correo, podes abrirlo o descargar el PDF desde los botones de cada entrada.",
  });

  const text = [
    `Compra confirmada - ${compra.evento_titulo}`,
    `Compra: ${compra.id}`,
    `Evento: ${compra.evento_titulo}`,
    `Fecha: ${formatDate(compra.fecha_evento)}`,
    `Lugar: ${compra.locacion}`,
    `Direccion: ${compra.direccion}`,
    `Total: ${formatMoney(Number.parseFloat(compra.precio_total))}`,
    `Detalle: ${compraUrl}`,
    "",
    ...ticketAssets.flatMap(({ entrada, assets }) => [
      `Entrada ${entrada.numero_entrada}: ${entrada.id}`,
      assets.qrPdfUrl ? `PDF: ${assets.qrPdfUrl}` : "",
      assets.qrImageUrl ? `QR: ${assets.qrImageUrl}` : "",
      "",
    ]),
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
