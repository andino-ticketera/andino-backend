import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn("Request finalizada con error controlado", {
      error: err.error,
      status: err.status,
      mensaje: err.mensaje,
      path: _req.path,
      method: _req.method,
    });

    const body: Record<string, unknown> = {
      error: err.error,
      mensaje: err.mensaje,
    };
    if (err.detalles) {
      body.detalles = err.detalles;
    }
    res.status(err.status).json(body);
    return;
  }

  logger.error("Error interno no controlado", {
    path: _req.path,
    method: _req.method,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: "INTERNAL_ERROR",
    mensaje: "Error interno del servidor",
  });
}
