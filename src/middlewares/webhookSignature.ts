import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Middleware que verifica la firma x-signature de los webhooks de MercadoPago.
 *
 * MercadoPago envia un header `x-signature` con formato:
 *   ts=<timestamp>,v1=<hmac_sha256_hex>
 *
 * El HMAC se calcula sobre el template:
 *   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *
 * Si MP_WEBHOOK_SECRET no esta configurado, se loguea un warning
 * y se permite pasar (para no romper desarrollo local).
 */
export function verifyMercadoPagoWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = env.mercadoPagoWebhookSecret;

  if (!secret) {
    logger.warn(
      "Webhook de MercadoPago recibido sin MP_WEBHOOK_SECRET configurado — firma no verificada",
      { path: req.path },
    );
    next();
    return;
  }

  const xSignature = req.headers["x-signature"] as string | undefined;
  const xRequestId = req.headers["x-request-id"] as string | undefined;

  if (!xSignature) {
    logger.warn("Webhook de MercadoPago sin header x-signature", {
      ip: req.ip,
    });
    res.status(401).json({ error: "WEBHOOK_UNAUTHORIZED", mensaje: "Firma faltante" });
    return;
  }

  // Parsear ts y v1 del header
  const parts = new Map<string, string>();
  for (const part of xSignature.split(",")) {
    const [key, ...valueParts] = part.split("=");
    if (key && valueParts.length > 0) {
      parts.set(key.trim(), valueParts.join("=").trim());
    }
  }

  const ts = parts.get("ts");
  const v1 = parts.get("v1");

  if (!ts || !v1) {
    logger.warn("Webhook de MercadoPago con x-signature malformado", {
      xSignature,
      ip: req.ip,
    });
    res.status(401).json({ error: "WEBHOOK_UNAUTHORIZED", mensaje: "Firma invalida" });
    return;
  }

  // El data.id viene del query param o del body
  const dataId =
    (req.query["data.id"] as string) ||
    (req.body as { data?: { id?: string | number } })?.data?.id?.toString() ||
    (req.body as { id?: string | number })?.id?.toString() ||
    "";

  // Construir el template de firma segun documentacion de MercadoPago
  const manifest = `id:${dataId};request-id:${xRequestId || ""};ts:${ts};`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  // Comparacion en tiempo constante
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(v1, "utf8");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    logger.warn("Webhook de MercadoPago con firma invalida", {
      ip: req.ip,
      dataId,
    });
    res.status(401).json({ error: "WEBHOOK_UNAUTHORIZED", mensaje: "Firma invalida" });
    return;
  }

  next();
}
