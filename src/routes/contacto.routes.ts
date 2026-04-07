import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { sendContactMessageEmail } from "../services/mail.service.js";
import { AppError } from "../utils/errors.js";

const router = Router();

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      next(new AppError(400, "VALIDATION_ERROR", "Body invalido"));
      return;
    }

    await sendContactMessageEmail({
      nombre: String(body.nombre || ""),
      email: String(body.email || ""),
      asunto: String(body.asunto || ""),
      mensaje: String(body.mensaje || ""),
    });

    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
