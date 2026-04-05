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
  "/mias/:id",
  requireAuth,
  requireRole(["USUARIO", "ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entradaId = String(req.params.id || "").trim();
      if (!isValidUUID(entradaId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de entrada invalido"));
        return;
      }

      const data = await comprasService.getEntradaDetalleByUser(
        req.user!.id,
        entradaId,
      );

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
