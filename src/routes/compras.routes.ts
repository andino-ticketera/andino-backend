import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { AppError } from "../utils/errors.js";
import * as comprasService from "../services/compras.service.js";

const router = Router();

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

router.get(
  "/mias",
  requireAuth,
  requireRole(["USUARIO", "ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit
        ? Number.parseInt(String(req.query.limit), 10)
        : undefined;
      const offset = req.query.offset
        ? Number.parseInt(String(req.query.offset), 10)
        : undefined;

      const data = await comprasService.listComprasByUser(req.user!.id, {
        limit,
        offset,
      });

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/mias/perfil-comprador",
  requireAuth,
  requireRole(["USUARIO", "ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await comprasService.getPerfilCompradorByUser(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/mias/:id",
  requireAuth,
  requireRole(["USUARIO", "ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const compraId = String(req.params.id || "").trim();
      if (!isValidUUID(compraId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de compra invalido"));
        return;
      }

      const data = await comprasService.getCompraDetalleByUser(
        req.user!.id,
        compraId,
      );

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
