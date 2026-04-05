import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  apiBasePath: process.env.API_BASE_PATH || "/api",
  databaseUrl:
    process.env.DATABASE_URL || "postgres://localhost:5432/andino_tickets",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  backendPublicUrl:
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_ASSET_BASE_URL ||
    "http://localhost:4000",
  publicAssetBaseUrl:
    process.env.PUBLIC_ASSET_BASE_URL || "http://localhost:4000",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "andino-tickets",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabasePasswordResetRedirectTo:
    process.env.SUPABASE_PASSWORD_RESET_REDIRECT_TO ||
    "http://localhost:3000/restablecer-clave",
  mercadoPagoPlatformAccessToken: process.env.MP_PLATFORM_ACCESS_TOKEN || "",
  mercadoPagoPlatformPublicKey: process.env.MP_PLATFORM_PUBLIC_KEY || "",
  mercadoPagoClientId: process.env.MP_CLIENT_ID || "",
  mercadoPagoClientSecret: process.env.MP_CLIENT_SECRET || "",
  mercadoPagoOAuthAuthorizeUrl:
    process.env.MP_OAUTH_AUTHORIZE_URL ||
    "https://auth.mercadopago.com.ar/authorization",
  mercadoPagoApiBaseUrl:
    process.env.MP_API_BASE_URL || "https://api.mercadopago.com",
  mercadoPagoOAuthRedirectPath:
    process.env.MP_OAUTH_REDIRECT_PATH ||
    "/api/organizador/mercado-pago/callback",
  mercadoPagoOAuthStateSecret:
    process.env.MP_OAUTH_STATE_SECRET || "change-me-mercadopago-state",
  mercadoPagoWebhookSecret: process.env.MP_WEBHOOK_SECRET || "",
  mercadoPagoFeePercentage: Number(process.env.MP_FEE_PERCENTAGE || "5"),
  mercadoPagoDevMode:
    (process.env.MP_DEV_MODE || "true").toLowerCase() === "true",
  mercadoPagoDevUsePlatformAccount:
    (process.env.MP_DEV_USE_PLATFORM_ACCOUNT || "true").toLowerCase() ===
    "true",
} as const;
