import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  uploadBufferToCloudinary,
  isCloudinaryEnabled,
} from "./cloudinary-assets.service.js";

export interface TicketAssets {
  qrImageDataUrl: string;
  qrImageUrl?: string;
  qrPdfUrl?: string;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const [, base64Payload] = dataUrl.split(",", 2);
  return Buffer.from(base64Payload || "", "base64");
}

async function buildTicketPdf(input: {
  entradaId: string;
  eventoTitulo: string;
  fechaEvento: string;
  locacion: string;
  direccion: string;
  organizador: string;
  compradorNombre: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 36,
    y: 36,
    width: 523,
    height: 770,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
  });

  page.drawText("Entrada Andino", {
    x: 56,
    y: 770,
    size: 24,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  page.drawText(input.eventoTitulo, {
    x: 56,
    y: 730,
    size: 18,
    font: fontBold,
    color: rgb(0.14, 0.14, 0.14),
    maxWidth: 310,
  });

  const lines = [
    `Entrada: ${input.entradaId}`,
    `Fecha: ${input.fechaEvento}`,
    `Lugar: ${input.locacion}`,
    `Direccion: ${input.direccion}`,
    `Organizador: ${input.organizador}`,
    `Comprador: ${input.compradorNombre}`,
  ];

  let currentY = 680;
  for (const line of lines) {
    page.drawText(line, {
      x: 56,
      y: currentY,
      size: 12,
      font: fontRegular,
      color: rgb(0.24, 0.24, 0.24),
      maxWidth: 300,
    });
    currentY -= 28;
  }

  page.drawRectangle({
    x: 345,
    y: 505,
    width: 180,
    height: 170,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: rgb(0.82, 0.82, 0.82),
    borderWidth: 1,
  });

  page.drawText("Entrada valida", {
    x: 390,
    y: 635,
    size: 18,
    font: fontBold,
    color: rgb(0.12, 0.12, 0.12),
  });

  page.drawText("Presenta esta entrada al ingresar.", {
    x: 366,
    y: 595,
    size: 11,
    font: fontRegular,
    color: rgb(0.22, 0.22, 0.22),
    maxWidth: 138,
    lineHeight: 16,
  });

  page.drawText("Conservala disponible hasta finalizar el evento.", {
    x: 366,
    y: 548,
    size: 11,
    font: fontRegular,
    color: rgb(0.22, 0.22, 0.22),
    maxWidth: 138,
    lineHeight: 16,
  });

  page.drawText(
    "Documento generado automaticamente. No compartas esta entrada en canales publicos.",
    {
      x: 56,
      y: 80,
      size: 10,
      font: fontRegular,
      color: rgb(0.38, 0.38, 0.38),
      maxWidth: 450,
    },
  );

  return Buffer.from(await pdf.save());
}

export async function buildTicketAssets(input: {
  entradaId: string;
  eventoTitulo: string;
  fechaEvento: string;
  locacion: string;
  direccion: string;
  organizador: string;
  compradorNombre: string;
  qrData: string;
}): Promise<TicketAssets> {
  const qrImageDataUrl = await QRCode.toDataURL(input.qrData, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });

  if (!isCloudinaryEnabled()) {
    return { qrImageDataUrl };
  }

  const qrImageBuffer = dataUrlToBuffer(qrImageDataUrl);
  const qrPdfBuffer = await buildTicketPdf({
    entradaId: input.entradaId,
    eventoTitulo: input.eventoTitulo,
    fechaEvento: input.fechaEvento,
    locacion: input.locacion,
    direccion: input.direccion,
    organizador: input.organizador,
    compradorNombre: input.compradorNombre,
  });

  const [qrImageUpload, qrPdfUpload] = await Promise.all([
    uploadBufferToCloudinary({
      buffer: qrImageBuffer,
      folder: "entradas/qr",
      publicId: `${input.entradaId}-qr`,
      resourceType: "image",
      format: "png",
      overwrite: true,
    }),
    uploadBufferToCloudinary({
      buffer: qrPdfBuffer,
      folder: "entradas/pdf",
      publicId: `${input.entradaId}-ticket`,
      resourceType: "raw",
      format: "pdf",
      overwrite: true,
    }),
  ]);

  return {
    qrImageDataUrl,
    qrImageUrl: qrImageUpload.secureUrl,
    qrPdfUrl: qrPdfUpload.secureUrl,
  };
}
