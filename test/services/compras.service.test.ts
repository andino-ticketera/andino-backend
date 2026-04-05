import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/utils/errors.js";

const mocks = vi.hoisted(() => {
  return {
    queryMock: vi.fn(),
    getPublicUserByIdMock: vi.fn(),
    getPublicUsersByIdsMock: vi.fn(),
    toDataUrlMock: vi.fn(),
  };
});

vi.mock("../../src/db/pool.js", () => ({
  query: mocks.queryMock,
}));

vi.mock("../../src/services/auth.service.js", () => ({
  getPublicUserById: mocks.getPublicUserByIdMock,
  getPublicUsersByIds: mocks.getPublicUsersByIdsMock,
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: mocks.toDataUrlMock,
  },
}));

import {
  getCompraDetalleByUser,
  getEntradaDetalleByUser,
  listComprasByUser,
} from "../../src/services/compras.service.js";

describe("compras.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista compras del usuario con nombre de organizador resuelto", async () => {
    const fechaCompra = new Date("2026-04-03T12:00:00.000Z");
    const fechaEvento = new Date("2026-05-01T21:00:00.000Z");

    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "compra-1",
          user_id: "user-1",
          evento_id: "evento-1",
          evento_titulo: "Festival Andino",
          fecha_evento: fechaEvento,
          ubicacion_evento: "Teatro, Mendoza, Mendoza",
          creador_id: "org-1",
          cantidad: 2,
          precio_unitario: "15000.00",
          precio_total: "30000.00",
          metodo_pago: "MERCADO_PAGO",
          estado: "PAGADO",
          fecha_compra: fechaCompra,
        },
      ],
    });

    mocks.getPublicUsersByIdsMock.mockResolvedValueOnce(
      new Map([
        [
          "org-1",
          {
            id: "org-1",
            nombreCompleto: "Organizador Demo",
            email: "org@example.com",
            rol: "ORGANIZADOR",
          },
        ],
      ]),
    );

    const result = await listComprasByUser("user-1");

    expect(result).toEqual([
      expect.objectContaining({
        id: "compra-1",
        nombre_organizador: "Organizador Demo",
        precio_total: 30000,
        fecha_evento: fechaEvento.toISOString(),
      }),
    ]);
  });

  it("devuelve detalle de compra propia con entradas", async () => {
    const fechaCompra = new Date("2026-04-03T12:00:00.000Z");
    const fechaEvento = new Date("2026-05-01T21:00:00.000Z");

    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "compra-1",
            user_id: "user-1",
            evento_id: "evento-1",
            evento_titulo: "Festival Andino",
            fecha_evento: fechaEvento,
            ubicacion_evento: "Teatro, Mendoza, Mendoza",
            creador_id: "org-1",
            cantidad: 2,
            precio_unitario: "15000.00",
            precio_total: "30000.00",
            metodo_pago: "MERCADO_PAGO",
            estado: "PAGADO",
            fecha_compra: fechaCompra,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "entrada-1",
            compra_id: "compra-1",
            evento_id: "evento-1",
            numero_entrada: 1,
            qr_token: "qr-1",
            estado: "DISPONIBLE",
            usada_at: null,
          },
          {
            id: "entrada-2",
            compra_id: "compra-1",
            evento_id: "evento-1",
            numero_entrada: 2,
            qr_token: "qr-2",
            estado: "USADA",
            usada_at: new Date("2026-05-01T22:00:00.000Z"),
          },
        ],
      });

    mocks.getPublicUsersByIdsMock.mockResolvedValueOnce(
      new Map([
        [
          "org-1",
          {
            id: "org-1",
            nombreCompleto: "Organizador Demo",
            email: "org@example.com",
            rol: "ORGANIZADOR",
          },
        ],
      ]),
    );

    const result = await getCompraDetalleByUser("user-1", "compra-1");

    expect(result.entradas).toHaveLength(2);
    expect(result.entradas[1]).toMatchObject({
      id: "entrada-2",
      estado: "USADA",
      qr_token: "qr-2",
    });
  });

  it("bloquea QR cuando la compra esta pendiente", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "entrada-1",
          compra_id: "compra-1",
          evento_id: "evento-1",
          numero_entrada: 1,
          qr_token: "qr-1",
          estado: "DISPONIBLE",
          usada_at: null,
          compra_user_id: "user-1",
          compra_estado: "PENDIENTE",
          evento_titulo: "Festival Andino",
          fecha_evento: new Date("2026-05-01T21:00:00.000Z"),
          locacion: "Teatro",
          direccion: "Calle 123",
          creador_id: "org-1",
        },
      ],
    });

    const promise = getEntradaDetalleByUser("user-1", "entrada-1");

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      status: 400,
      mensaje: "Entrada no disponible, pago pendiente",
    });
  });

  it("devuelve QR e informacion completa para entrada pagada", async () => {
    const fechaEvento = new Date("2026-05-01T21:00:00.000Z");
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "entrada-1",
          compra_id: "compra-1",
          evento_id: "evento-1",
          numero_entrada: 1,
          qr_token: "qr-1",
          estado: "DISPONIBLE",
          usada_at: null,
          compra_user_id: "user-1",
          compra_estado: "PAGADO",
          evento_titulo: "Festival Andino",
          fecha_evento: fechaEvento,
          locacion: "Teatro",
          direccion: "Calle 123",
          creador_id: "org-1",
        },
      ],
    });

    mocks.getPublicUserByIdMock
      .mockResolvedValueOnce({
        id: "user-1",
        nombreCompleto: "Comprador Demo",
        email: "buyer@example.com",
        rol: "USUARIO",
      })
      .mockResolvedValueOnce({
        id: "org-1",
        nombreCompleto: "Organizador Demo",
        email: "org@example.com",
        rol: "ORGANIZADOR",
      });

    mocks.toDataUrlMock.mockResolvedValueOnce("data:image/png;base64,qr-demo");

    const result = await getEntradaDetalleByUser("user-1", "entrada-1");

    expect(result).toMatchObject({
      entrada_id: "entrada-1",
      qr_data: "entrada-1",
      qr_image_data_url: "data:image/png;base64,qr-demo",
      comprador: {
        nombre_completo: "Comprador Demo",
      },
      evento: {
        organizador: "Organizador Demo",
        fecha_evento: fechaEvento.toISOString(),
      },
    });
  });
});
