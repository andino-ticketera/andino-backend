import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { buildValidationError } from "../utils/errors.js";
import * as carruselService from "../services/carrusel.service.js";
import {
  normalizeCarruselEventIds,
  validateUpdateCarrusel,
} from "../validators/carrusel.validator.js";
import type { NextFunction, Request, Response } from "express";

const router = Router();

// GET /api/carrusel
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await carruselService.listCarruselEventos();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/carrusel
router.put(
  "/",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateUpdateCarrusel(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const eventIds = normalizeCarruselEventIds(req.body.eventIds);
      const data = await carruselService.updateCarruselEventos(eventIds);

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
