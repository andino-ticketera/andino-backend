import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { buildValidationError } from "../utils/errors.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  normalizeEmail,
  normalizeFullName,
  validateLoginAuth,
  validateRegisterAuth,
  validateRoleUpdateAuth,
  validatePasswordResetRequest,
} from "../validators/auth.validator.js";
import * as authService from "../services/auth.service.js";

const router = Router();

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "AUTH_RATE_LIMIT_EXCEEDED",
    mensaje:
      "Demasiados intentos de autenticacion. Intente nuevamente en unos minutos",
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "PASSWORD_RESET_RATE_LIMIT_EXCEEDED",
    mensaje:
      "Demasiados intentos de recuperacion. Intente nuevamente en unos minutos",
  },
});

router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getCurrentUser(String(req.user!.id));
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/users",
  requireAuth,
  requireRole(["ADMIN"]),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await authService.listRegisteredUsers();
      res.status(200).json({ data: users });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/register",
  authAttemptLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateRegisterAuth(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const response = await authService.registerUser({
        nombreCompleto: normalizeFullName(req.body.nombre_completo),
        email: normalizeEmail(req.body.email),
        password: String(req.body.password || ""),
      });

      res.status(response.requiresEmailVerification ? 202 : 201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/login",
  authAttemptLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateLoginAuth(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const response = await authService.loginUser({
        email: normalizeEmail(req.body.email),
        password: String(req.body.password || ""),
      });

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/sync-oauth",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token) {
        next(
          buildValidationError([
            { campo: "token", mensaje: "El token es obligatorio" },
          ]),
        );
        return;
      }

      const user = await authService.ensureOAuthUserRole(token);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/logout", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

router.post(
  "/forgot-password",
  passwordResetLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validatePasswordResetRequest(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      await authService.sendPasswordResetEmail(normalizeEmail(req.body.email));

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/users/:userId/role",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateRoleUpdateAuth(req.body);
      if (errors.length > 0) {
        next(buildValidationError(errors));
        return;
      }

      const userId = String(req.params.userId || "").trim();
      if (!userId) {
        next(
          buildValidationError([
            {
              campo: "userId",
              mensaje: "El userId es obligatorio",
            },
          ]),
        );
        return;
      }

      const updatedUser = await authService.updateUserRole(
        String(req.user!.id),
        userId,
        String(req.body.role || "")
          .trim()
          .toUpperCase() as "USUARIO" | "ORGANIZADOR" | "ADMIN",
      );

      res.status(200).json({ user: updatedUser });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
