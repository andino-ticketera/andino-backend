import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import type { AuthUser, RolUsuario } from "../types/index.js";
import { getAuthUserFromToken } from "../services/auth.service.js";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new AppError(401, "NO_AUTENTICADO", "Debe iniciar sesion"));
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const authUser = await getAuthUserFromToken(token);
    req.user = authUser;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }

    logger.error("Fallo inesperado validando token", {
      error: err instanceof Error ? err.message : String(err),
    });
    next(
      new AppError(
        503,
        "AUTH_SERVICE_ERROR",
        "Servicio de autenticacion temporalmente no disponible",
      ),
    );
  }
}

export function requireRole(allowedRoles: RolUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "NO_AUTENTICADO", "Debe iniciar sesion"));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(403, "SIN_PERMISOS", "No tiene permisos para esta accion"),
      );
      return;
    }

    next();
  };
}
