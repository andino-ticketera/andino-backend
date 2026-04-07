import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import {
  deleteCloudinaryAssetByUrl,
  isCloudinaryEnabled,
  uploadBufferToCloudinary,
} from "./cloudinary-assets.service.js";

const UPLOADS_EVENTS_DIR = path.resolve("uploads/events");
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function getExtension(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.has(extension) ? extension : ".bin";
}

function buildLocalAssetUrl(filename: string): string {
  return `${env.publicAssetBaseUrl}/uploads/events/${filename}`;
}

function extractLocalFilename(assetUrl: string): string | null {
  try {
    const parsedUrl = new URL(assetUrl);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const uploadsIndex = pathParts.findIndex((part) => part === "events");

    if (uploadsIndex < 0 || uploadsIndex === pathParts.length - 1) {
      return null;
    }

    return pathParts[pathParts.length - 1] || null;
  } catch {
    return null;
  }
}

export async function storeEventAsset(
  file: Express.Multer.File,
  assetType: "imagen" | "flyer",
): Promise<string> {
  if (isCloudinaryEnabled()) {
    const extension = getExtension(file.originalname).replace(/^\./, "");
    const uploaded = await uploadBufferToCloudinary({
      buffer: file.buffer,
      folder: `eventos/${assetType}`,
      publicId: crypto.randomUUID(),
      resourceType: "image",
      format: extension,
    });

    return uploaded.secureUrl;
  }

  await fs.mkdir(UPLOADS_EVENTS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${getExtension(file.originalname)}`;
  await fs.writeFile(path.join(UPLOADS_EVENTS_DIR, filename), file.buffer);
  return buildLocalAssetUrl(filename);
}

export async function deleteManagedAsset(
  assetUrl: string | null | undefined,
): Promise<void> {
  if (!assetUrl) {
    return;
  }

  if (isCloudinaryEnabled()) {
    await deleteCloudinaryAssetByUrl(assetUrl);
  }

  const filename = extractLocalFilename(assetUrl);
  if (!filename) {
    return;
  }

  await fs.rm(path.join(UPLOADS_EVENTS_DIR, filename), { force: true });
}
