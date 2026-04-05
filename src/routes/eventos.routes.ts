import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  parseMediosPago,
  validateCreateEvento,
  validateUpdateEvento,
} from "../validators/eventos.validator.js";
import { buildValidationError, AppError } from "../utils/errors.js";
import * as eventosService from "../services/eventos.service.js";
import * as categoriasService from "../services/categorias.service.js";
import * as mercadoPagoService from "../services/mercadopago.service.js";
import { env } from "../config/env.js";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

const router = Router();
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    mensaje:
      "Demasiadas operaciones sobre eventos. Intente nuevamente en unos minutos",
  },
});

// Multer config
const UPLOADS_DIR = path.resolve("uploads/events");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const extension = path.extname(file.originalname).toLowerCase();
    if (
      allowed.includes(file.mimetype) &&
      ALLOWED_UPLOAD_EXTENSIONS.has(extension)
    ) {
      cb(null, true);
    } else {
      const campo = file.fieldname === "flyer" ? "flyer" : "imagen";
      const etiqueta = campo === "flyer" ? "flyer" : "imagen";
      cb(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Hay errores de validacion en el request",
          [
            {
              campo,
              mensaje: `Formato de ${etiqueta} no soportado. Use JPG, PNG o WEBP`,
            },
          ],
        ),
      );
    }
  },
});

const uploadFields = upload.fields([
  { name: "imagen", maxCount: 1 },
  { name: "flyer", maxCount: 1 },
]);

type UploadedFiles = {
  imagen?: Express.Multer.File[];
  flyer?: Express.Multer.File[];
};

// Wrapper para manejar error de multer (413)
function handleUpload(req: Request, res: Response, next: NextFunction): void {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(
        new AppError(
          413,
          "IMAGEN_MUY_GRANDE",
          "La imagen no debe superar los 5MB",
        ),
      );
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

function buildFileUrl(filename: string): string {
  return `${env.publicAssetBaseUrl}/uploads/events/${filename}`;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getRouteId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function deleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn("No se pudo eliminar archivo del filesystem", {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function assertMercadoPagoEventEnabled(
  userId: string,
  role: "USUARIO" | "ORGANIZADOR" | "ADMIN",
  mediosPago: string[],
): Promise<void> {
  if (role !== "ORGANIZADOR") {
    return;
  }

  if (!mediosPago.includes("MERCADO_PAGO")) {
    return;
  }

  await mercadoPagoService.assertOrganizerMercadoPagoReadyForEvents(userId);
}

// ── POST /api/eventos ─────────────────────────────────────────────
router.post(
  "/",
  mutationLimiter,
  requireAuth,
  requireRole(["ORGANIZADOR", "ADMIN"]),
  handleUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    let uploadedFiles: UploadedFiles | undefined;
    try {
      uploadedFiles = req.files as UploadedFiles | undefined;
      const files = uploadedFiles;
      const errors = validateCreateEvento(req.body, files || {});

      if (errors.length > 0) {
        // Limpiar archivos subidos si hay errores
        if (files?.imagen?.[0]) deleteFile(files.imagen[0].path);
        if (files?.flyer?.[0]) deleteFile(files.flyer[0].path);
        next(buildValidationError(errors));
        return;
      }

      const categoriaValida = await categoriasService.existsCategoriaByNombre(
        String(req.body.categoria || "").trim(),
      );
      if (!categoriaValida) {
        if (files?.imagen?.[0]) deleteFile(files.imagen[0].path);
        if (files?.flyer?.[0]) deleteFile(files.flyer[0].path);
        next(
          buildValidationError([
            {
              campo: "categoria",
              mensaje: "La categoria seleccionada no existe",
            },
          ]),
        );
        return;
      }

      const imagenUrl = buildFileUrl(files!.imagen![0].filename);
      const flyerUrl = files?.flyer?.[0]
        ? buildFileUrl(files.flyer[0].filename)
        : null;

      await assertMercadoPagoEventEnabled(
        req.user!.id,
        req.user!.role,
        parseMediosPago(req.body.medios_pago),
      );

      const result = await eventosService.createEvento(
        req.body,
        imagenUrl,
        flyerUrl,
        req.user!,
      );

      if (result.idempotentReplay) {
        // En replay de idempotencia, los archivos subidos en esta request no se usan.
        if (files?.imagen?.[0]) deleteFile(files.imagen[0].path);
        if (files?.flyer?.[0]) deleteFile(files.flyer[0].path);
      }

      res.status(result.idempotentReplay ? 409 : 201).json(result.evento);
    } catch (err) {
      if (uploadedFiles?.imagen?.[0]) deleteFile(uploadedFiles.imagen[0].path);
      if (uploadedFiles?.flyer?.[0]) deleteFile(uploadedFiles.flyer[0].path);
      next(err);
    }
  },
);

// ── GET /api/eventos ──────────────────────────────────────────────
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await eventosService.listEventos({
      estado: req.query.estado as string | undefined,
      categoria: req.query.categoria as string | undefined,
      provincia: req.query.provincia as string | undefined,
      localidad: req.query.localidad as string | undefined,
      q: req.query.q as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/eventos/mis ──────────────────────────────────────────
router.get(
  "/mis",
  requireAuth,
  requireRole(["ORGANIZADOR", "ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventos = await eventosService.listEventosByCreator(req.user!.id);
      res.json({ data: eventos });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/eventos/:id ──────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventoId = getRouteId(req.params.id);

    if (!isValidUUID(eventoId)) {
      next(new AppError(400, "ID_INVALIDO", "ID de evento invalido"));
      return;
    }

    const evento = await eventosService.getEventoById(eventoId);
    res.json(evento);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/eventos/:id ──────────────────────────────────────────
router.put(
  "/:id",
  mutationLimiter,
  requireAuth,
  requireRole(["ORGANIZADOR", "ADMIN"]),
  handleUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    let uploadedFiles: UploadedFiles | undefined;
    try {
      const eventoId = getRouteId(req.params.id);

      if (!isValidUUID(eventoId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de evento invalido"));
        return;
      }

      // Buscar evento actual para validaciones
      const currentEvento = await eventosService.getEventoRaw(eventoId);
      if (!currentEvento || currentEvento.estado === "CANCELADO") {
        next(
          new AppError(
            404,
            "EVENTO_NO_ENCONTRADO",
            "El evento solicitado no existe",
          ),
        );
        return;
      }

      if (
        req.user!.role === "ORGANIZADOR" &&
        currentEvento.creador_id !== req.user!.id
      ) {
        next(
          new AppError(
            403,
            "SIN_PERMISOS",
            "No tiene permisos para editar este evento",
          ),
        );
        return;
      }

      uploadedFiles = req.files as UploadedFiles | undefined;
      const files = uploadedFiles;
      const errors = validateUpdateEvento(req.body, files || {}, {
        entradas_vendidas: currentEvento.entradas_vendidas,
        precio: parseFloat(currentEvento.precio),
        medios_pago: currentEvento.medios_pago,
      });

      if (errors.length > 0) {
        if (files?.imagen?.[0]) deleteFile(files.imagen[0].path);
        if (files?.flyer?.[0]) deleteFile(files.flyer[0].path);
        next(buildValidationError(errors));
        return;
      }

      if (req.body.categoria !== undefined) {
        const categoriaValida = await categoriasService.existsCategoriaByNombre(
          String(req.body.categoria || "").trim(),
        );
        if (!categoriaValida) {
          if (files?.imagen?.[0]) deleteFile(files.imagen[0].path);
          if (files?.flyer?.[0]) deleteFile(files.flyer[0].path);
          next(
            buildValidationError([
              {
                campo: "categoria",
                mensaje: "La categoria seleccionada no existe",
              },
            ]),
          );
          return;
        }
      }

      const imagenUrl = files?.imagen?.[0]
        ? buildFileUrl(files.imagen[0].filename)
        : undefined;
      const flyerUrl = files?.flyer?.[0]
        ? buildFileUrl(files.flyer[0].filename)
        : undefined;

      const effectiveMediosPago =
        req.body.medios_pago !== undefined
          ? parseMediosPago(req.body.medios_pago)
          : currentEvento.medios_pago;

      await assertMercadoPagoEventEnabled(
        req.user!.id,
        req.user!.role,
        effectiveMediosPago,
      );

      const evento = await eventosService.updateEvento(
        eventoId,
        req.body,
        imagenUrl,
        flyerUrl,
      );

      // Si se subieron nuevos archivos, eliminar los anteriores para evitar huellas huerfanas.
      if (files?.imagen?.[0] && currentEvento.imagen_url) {
        const oldImagen = currentEvento.imagen_url.split("/").pop();
        if (oldImagen) {
          deleteFile(path.join(UPLOADS_DIR, oldImagen));
        }
      }
      if (files?.flyer?.[0] && currentEvento.flyer_url) {
        const oldFlyer = currentEvento.flyer_url.split("/").pop();
        if (oldFlyer) {
          deleteFile(path.join(UPLOADS_DIR, oldFlyer));
        }
      }

      res.json(evento);
    } catch (err) {
      if (uploadedFiles?.imagen?.[0]) deleteFile(uploadedFiles.imagen[0].path);
      if (uploadedFiles?.flyer?.[0]) deleteFile(uploadedFiles.flyer[0].path);
      next(err);
    }
  },
);

// ── DELETE /api/eventos/:id ───────────────────────────────────────
router.delete(
  "/:id",
  mutationLimiter,
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventoId = getRouteId(req.params.id);

      if (!isValidUUID(eventoId)) {
        next(new AppError(400, "ID_INVALIDO", "ID de evento invalido"));
        return;
      }

      const result = await eventosService.deleteEvento(eventoId);

      // Si fue eliminacion fisica, borrar la imagen del filesystem
      if (result.imagenUrl) {
        const filename = result.imagenUrl.split("/").pop();
        if (filename) {
          deleteFile(path.join(UPLOADS_DIR, filename));
        }
      }
      if (result.flyerUrl) {
        const filename = result.flyerUrl.split("/").pop();
        if (filename) {
          deleteFile(path.join(UPLOADS_DIR, filename));
        }
      }

      res.json({ mensaje: result.mensaje });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
