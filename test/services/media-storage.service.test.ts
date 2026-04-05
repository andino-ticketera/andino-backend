import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCloudinaryEnabledMock: vi.fn(),
  uploadBufferToCloudinaryMock: vi.fn(),
  deleteCloudinaryAssetByUrlMock: vi.fn(),
}));

vi.mock("../../src/services/cloudinary-assets.service.js", () => ({
  isCloudinaryEnabled: mocks.isCloudinaryEnabledMock,
  uploadBufferToCloudinary: mocks.uploadBufferToCloudinaryMock,
  deleteCloudinaryAssetByUrl: mocks.deleteCloudinaryAssetByUrlMock,
}));

import {
  deleteManagedAsset,
  storeEventAsset,
} from "../../src/services/media-storage.service.js";

const uploadsDir = path.resolve("uploads/events");

function buildFile(name: string, content: string): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.from(content, "utf8"),
  } as Express.Multer.File;
}

describe("media-storage.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const entries = await fs.readdir(uploadsDir);
    await Promise.all(
      entries
        .filter((entry) => entry !== ".gitkeep")
        .map((entry) => fs.rm(path.join(uploadsDir, entry), { force: true })),
    );
  });

  it("guarda assets de eventos en filesystem cuando Cloudinary no esta configurado", async () => {
    mocks.isCloudinaryEnabledMock.mockReturnValue(false);

    const assetUrl = await storeEventAsset(buildFile("flyer.png", "demo"), "flyer");

    expect(assetUrl).toMatch(
      /^http:\/\/localhost:4000\/uploads\/events\/[a-f0-9-]+\.png$/,
    );

    const savedFilename = assetUrl.split("/").pop();
    const savedContent = await fs.readFile(path.join(uploadsDir, savedFilename || ""), "utf8");
    expect(savedContent).toBe("demo");
  });

  it("sube assets de eventos a Cloudinary cuando esta configurado", async () => {
    mocks.isCloudinaryEnabledMock.mockReturnValue(true);
    mocks.uploadBufferToCloudinaryMock.mockResolvedValue({
      secureUrl: "https://res.cloudinary.com/demo/image/upload/evento-demo.png",
    });

    const assetUrl = await storeEventAsset(buildFile("imagen.png", "demo"), "imagen");

    expect(assetUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/evento-demo.png",
    );
    expect(mocks.uploadBufferToCloudinaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "eventos/imagen",
        resourceType: "image",
        format: "png",
      }),
    );
  });

  it("borra assets locales cuando recibe una URL del backend", async () => {
    mocks.isCloudinaryEnabledMock.mockReturnValue(false);

    const assetUrl = await storeEventAsset(buildFile("imagen.webp", "demo"), "imagen");
    const savedFilename = assetUrl.split("/").pop();

    await deleteManagedAsset(assetUrl);

    await expect(
      fs.access(path.join(uploadsDir, savedFilename || "")),
    ).rejects.toBeDefined();
  });
});
