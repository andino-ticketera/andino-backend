import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import * as mercadoPagoService from "../services/mercadopago.service.js";
import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

router.get(
  "/status",
  requireAuth,
  requireRole(["ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await mercadoPagoService.getMercadoPagoConnectionStatus(
        req.user!.id,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/connect-url",
  requireAuth,
  requireRole(["ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = await mercadoPagoService.createMercadoPagoConnectUrl(
        req.user!.id,
      );
      res.json({ data: { url } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redirectUrl =
        await mercadoPagoService.handleMercadoPagoOAuthCallback({
          code: typeof req.query.code === "string" ? req.query.code : undefined,
          state:
            typeof req.query.state === "string" ? req.query.state : undefined,
          error:
            typeof req.query.error === "string" ? req.query.error : undefined,
        });

      res.redirect(302, redirectUrl);
    } catch (error) {
      if (error instanceof AppError) {
        res.redirect(
          302,
          `${env.frontendUrl.replace(/\/$/, "")}/organizador/dashboard?mp=error`,
        );
        return;
      }
      next(error);
    }
  },
);

export default router;
