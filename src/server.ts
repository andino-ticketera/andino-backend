import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { env } from "./config/env.js";
import pool from "./db/pool.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import eventosRoutes from "./routes/eventos.routes.js";
import categoriasRoutes from "./routes/categorias.routes.js";
import authRoutes from "./routes/auth.routes.js";
import carruselRoutes from "./routes/carrusel.routes.js";
import comprasRoutes from "./routes/compras.routes.js";
import contactoRoutes from "./routes/contacto.routes.js";
import organizadorContactoRoutes from "./routes/organizador-contacto.routes.js";
import entradasRoutes from "./routes/entradas.routes.js";
import organizadorMercadoPagoRoutes from "./routes/organizador-mercadopago.routes.js";
import pagosRoutes from "./routes/pagos.routes.js";
import { logger } from "./lib/logger.js";
import { isPublicAssetFilename } from "./services/eventos.service.js";

const app = express();
const UPLOADS_EVENTS_DIR = path.resolve("uploads/events");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    mensaje: "Demasiadas requests. Intente nuevamente en unos minutos",
  },
});

function isValidPublicAssetFilename(filename: string): boolean {
  return /^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename);
}

// Middlewares globales
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  cors({
    origin: env.frontendUrl,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
    maxAge: 86_400,
  }),
);
app.use(express.json());
app.use(env.apiBasePath, apiLimiter);

app.get("/uploads/events/:filename", async (req, res, next) => {
  try {
    const filename = String(req.params.filename || "").trim();
    if (!isValidPublicAssetFilename(filename)) {
      res.status(404).end();
      return;
    }

    const isPublicAsset = await isPublicAssetFilename(filename);
    if (!isPublicAsset) {
      res.status(404).end();
      return;
    }

    res.sendFile(path.join(UPLOADS_EVENTS_DIR, filename));
  } catch (err) {
    next(err);
  }
});

// Routes
app.use(`${env.apiBasePath}/eventos`, eventosRoutes);
app.use(`${env.apiBasePath}/categorias`, categoriasRoutes);
app.use(`${env.apiBasePath}/auth`, authRoutes);
app.use(`${env.apiBasePath}/carrusel`, carruselRoutes);
app.use(`${env.apiBasePath}/compras`, comprasRoutes);
app.use(`${env.apiBasePath}/contacto`, contactoRoutes);
app.use(`${env.apiBasePath}/organizador/contacto`, organizadorContactoRoutes);
app.use(`${env.apiBasePath}/entradas`, entradasRoutes);
app.use(
  `${env.apiBasePath}/organizador/mercado-pago`,
  organizadorMercadoPagoRoutes,
);
app.use(`${env.apiBasePath}/pagos`, pagosRoutes);

// Health check
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    logger.error("Healthcheck fallo al consultar base de datos", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

// Error handler global (debe ir despues de las rutas)
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info("Andino Tickets API iniciada", {
    port: env.port,
    apiBasePath: env.apiBasePath,
    frontendUrl: env.frontendUrl,
  });

  if (!env.resendApiKey) {
    logger.warn("Resend no configurado", {
      missingEnv: "RESEND_API_KEY",
      note: "Los emails de contacto y compra no se enviaran hasta definir esta variable.",
    });
  }

  if (!env.resendFromEmail) {
    logger.warn("Remitente de Resend no configurado", {
      missingEnv: "RESEND_FROM_EMAIL",
      note: "Define un email remitente valido y con dominio verificado en Resend.",
    });
  }
});

export default app;
