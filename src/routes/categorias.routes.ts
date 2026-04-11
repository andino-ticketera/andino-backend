import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { buildValidationError, AppError } from "../utils/errors.js";
import {
  normalizeCategoriaNombre,
  validateCreateCategoria,
  validateUpdateCategoria,
} from "../validators/categorias.validator.js";
import * as categoriasService from "../services/categorias.service.js";
import type { NextFunction, Request, Response } from "express";

const router = Router();

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getRouteId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

// GET /api/categorias
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoriasService.listCategorias();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/categorias/admin/todas
router.get(
  "/admin/todas",
  requireAuth,
  requireRole(["ADMIN"]),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await categoriasService.listCategorias({ includeHidden: true });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/categorias/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoriaId = getRouteId(req.params.id);
    if (!isValidUUID(categoriaId)) {
      next(new AppError(400, "ID_INVALIDO", "ID de categoria invalido"));
      return;
    }

    const categoria = await categoriasService.getCategoriaById(categoriaId);
    res.json(categoria);
  } catch (err) {
    next(err);
  }
});

// POST /api/categorias
router.post(
  "/",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateCreateCategoria(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const categoria = await categoriasService.createCategoria({
        nombre: normalizeCategoriaNombre(req.body.nombre),
      });

      res.status(201).json(categoria);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/categorias/:id
router.put(
  "/:id",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoriaId = getRouteId(req.params.id);
      if (!isValidUUID(categoriaId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de categoria invalido"));
        return;
      }

      const errors = validateUpdateCategoria(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const categoria = await categoriasService.updateCategoria(categoriaId, {
        nombre:
          req.body.nombre !== undefined
            ? normalizeCategoriaNombre(req.body.nombre)
            : undefined,
        visible_en_app: req.body.visible_en_app,
      });

      res.json(categoria);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/categorias/nombre/:nombre
router.delete(
  "/nombre/:nombre",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const nombre = decodeURIComponent(String(req.params.nombre || "")).trim();
      if (!nombre) {
        next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Hay errores de validacion en el request",
            [
              {
                campo: "nombre",
                mensaje: "El nombre de la categoria es obligatorio",
              },
            ],
          ),
        );
        return;
      }

      await categoriasService.deleteCategoriaByNombre(nombre);
      res.json({ mensaje: "Categoria eliminada correctamente" });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/categorias/:id
router.delete(
  "/:id",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoriaId = getRouteId(req.params.id);
      if (!isValidUUID(categoriaId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de categoria invalido"));
        return;
      }

      await categoriasService.deleteCategoria(categoriaId);
      res.json({ mensaje: "Categoria eliminada correctamente" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
