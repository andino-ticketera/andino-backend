import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

let cloudinaryConfigured = false;

export interface UploadedAsset {
  secureUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
}

function hasCloudinaryCredentials(): boolean {
  return Boolean(
    env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret,
  );
}

function ensureCloudinaryConfigured(): void {
  if (!hasCloudinaryCredentials()) {
    throw new AppError(
      500,
      "CLOUDINARY_CONFIG_INVALID",
      "Faltan variables de entorno de Cloudinary",
    );
  }

  if (cloudinaryConfigured) {
    return;
  }

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });

  cloudinaryConfigured = true;
}

export function isCloudinaryEnabled(): boolean {
  return hasCloudinaryCredentials();
}

export async function uploadBufferToCloudinary(input: {
  buffer: Buffer;
  folder: string;
  publicId: string;
  resourceType: "image" | "raw";
  format?: string;
  overwrite?: boolean;
}): Promise<UploadedAsset> {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.cloudinaryFolder}/${input.folder}`,
        public_id: input.publicId,
        resource_type: input.resourceType,
        format: input.format,
        overwrite: input.overwrite ?? true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(
            new AppError(
              502,
              "CLOUDINARY_UPLOAD_ERROR",
              "No se pudo subir el asset a Cloudinary",
            ),
          );
          return;
        }

        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          resourceType: input.resourceType,
        });
      },
    );

    stream.end(input.buffer);
  });
}

function tryParseCloudinaryAsset(inputUrl: string): {
  publicId: string;
  resourceType: "image" | "raw";
} | null {
  try {
    const parsedUrl = new URL(inputUrl);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const uploadIndex = pathParts.findIndex((part) => part === "upload");

    if (
      uploadIndex < 1 ||
      pathParts[0] !== env.cloudinaryCloudName ||
      pathParts.length <= uploadIndex + 1
    ) {
      return null;
    }

    const resourceType = pathParts[uploadIndex - 1];
    if (resourceType !== "image" && resourceType !== "raw") {
      return null;
    }

    const assetParts = pathParts.slice(uploadIndex + 1);
    const versionIndex = assetParts.findIndex((part) => /^v\d+$/.test(part));
    const normalizedParts =
      versionIndex >= 0 ? assetParts.slice(versionIndex + 1) : assetParts;

    if (normalizedParts.length === 0) {
      return null;
    }

    const lastPart = normalizedParts[normalizedParts.length - 1];
    const extensionIndex = lastPart.lastIndexOf(".");
    const lastWithoutExtension =
      extensionIndex >= 0 ? lastPart.slice(0, extensionIndex) : lastPart;

    normalizedParts[normalizedParts.length - 1] = lastWithoutExtension;

    return {
      publicId: normalizedParts.join("/"),
      resourceType,
    };
  } catch {
    return null;
  }
}

export async function deleteCloudinaryAssetByUrl(
  assetUrl: string,
): Promise<void> {
  if (!isCloudinaryEnabled()) {
    return;
  }

  const parsedAsset = tryParseCloudinaryAsset(assetUrl);
  if (!parsedAsset) {
    return;
  }

  ensureCloudinaryConfigured();

  await cloudinary.uploader.destroy(parsedAsset.publicId, {
    resource_type: parsedAsset.resourceType,
    invalidate: true,
  });
}
