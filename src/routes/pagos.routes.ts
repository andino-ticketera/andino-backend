import { Router } from "express";
import { AppError } from "../utils/errors.js";
import * as mercadoPagoService from "../services/mercadopago.service.js";
import type { Request, Response, NextFunction } from "express";
import type { MercadoPagoPreferenceInput } from "../types/index.js";

const router = Router();

router.post(
  "/checkout-pro/preference",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<MercadoPagoPreferenceInput>;

      if (!body || typeof body !== "object") {
        next(new AppError(400, "VALIDATION_ERROR", "Body invalido"));
        return;
      }

      const data = await mercadoPagoService.createCheckoutPreference(
        req.user?.id || null,
        {
          eventoId: String(body.eventoId || ""),
          cantidad: Number(body.cantidad || 0),
          buyer: {
            nombre: String(body.buyer?.nombre || ""),
            apellido: String(body.buyer?.apellido || ""),
            email: String(body.buyer?.email || ""),
            documento: String(body.buyer?.documento || ""),
            tipoDocumento: body.buyer?.tipoDocumento
              ? String(body.buyer.tipoDocumento)
              : undefined,
          },
        },
      );

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/public/:compraId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const compraId = String(req.params.compraId || "").trim();
      if (!compraId) {
        next(new AppError(400, "ID_INVALIDO", "ID de compra invalido"));
        return;
      }

      const data = await mercadoPagoService.getPublicCheckoutStatus(compraId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/mercado-pago/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const compraId =
        typeof req.query.compra_id === "string"
          ? req.query.compra_id
          : undefined;
      const body = req.body as {
        data?: { id?: string | number };
        id?: string | number;
        type?: string;
        topic?: string;
      };

      const type = body.type || body.topic;
      const paymentId = body.data?.id || body.id;

      if (type && type !== "payment") {
        res.status(200).json({ ok: true });
        return;
      }

      await mercadoPagoService.processMercadoPagoPaymentNotification({
        compraId,
        paymentId: paymentId ? String(paymentId) : undefined,
      });

      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
