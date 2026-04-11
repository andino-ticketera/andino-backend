import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/utils/errors.js";

const mocks = vi.hoisted(() => {
  const queryMock = vi.fn();
  const clientQueryMock = vi.fn();
  const releaseMock = vi.fn();
  const connectMock = vi.fn(async () => ({
    query: clientQueryMock,
    release: releaseMock,
  }));
  const warnMock = vi.fn();
  const errorMock = vi.fn();
  const infoMock = vi.fn();
  const fetchMock = vi.fn();

  return {
    queryMock,
    clientQueryMock,
    releaseMock,
    connectMock,
    warnMock,
    errorMock,
    infoMock,
    fetchMock,
  };
});

vi.mock("../../src/db/pool.js", () => ({
  query: mocks.queryMock,
  default: {
    connect: mocks.connectMock,
  },
}));

// Neutralizamos el sweep de eventos finalizados: los tests de mercadopago
// encadenan mocks de query() por orden y el sweep agregaria un UPDATE
// extra que romperia ese orden. El sweep esta cubierto en
// test/services/eventos.service.test.ts.
vi.mock("../../src/services/eventos.service.js", () => ({
  hideFinishedEvents: vi.fn(async () => undefined),
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    warn: mocks.warnMock,
    error: mocks.errorMock,
    info: mocks.infoMock,
  },
}));

vi.mock("../../src/config/env.js", () => ({
  env: {
    port: 4000,
    apiBasePath: "/api",
    databaseUrl: "postgres://localhost:5432/andino_tickets",
    frontendUrl: "http://localhost:3000",
    backendPublicUrl: "http://localhost:4000",
    publicAssetBaseUrl: "http://localhost:4000",
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseServiceRoleKey: "",
    supabasePasswordResetRedirectTo: "http://localhost:3000/restablecer-clave",
    mercadoPagoPlatformAccessToken: "test-platform-token",
    mercadoPagoPlatformPublicKey: "test-public-key",
    mercadoPagoClientId: "test-client-id",
    mercadoPagoClientSecret: "test-client-secret",
    mercadoPagoOAuthAuthorizeUrl:
      "https://auth.mercadopago.com.ar/authorization",
    mercadoPagoApiBaseUrl: "https://api.mercadopago.com",
    mercadoPagoOAuthRedirectPath: "/api/organizador/mercado-pago/callback",
    mercadoPagoOAuthStateSecret: "test-state-secret",
    mercadoPagoWebhookSecret: "",
    mercadoPagoFeePercentage: 5,
    mercadoPagoDevMode: true,
    mercadoPagoDevUsePlatformAccount: true,
  },
}));

import {
  assertOrganizerMercadoPagoReadyForEvents,
  createCheckoutPreference,
  getPublicCheckoutStatus,
  processMercadoPagoPaymentNotification,
} from "../../src/services/mercadopago.service.js";

function createJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("mercadopago.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  it("crea preferencia Checkout Pro para checkout invitado y persiste datos del comprador", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "evento-1",
            titulo: "Festival Andino",
            precio: "10000.00",
            cantidad_entradas: 50,
            entradas_vendidas: 4,
            estado: "ACTIVO",
            medios_pago: ["MERCADO_PAGO"],
            creador_id: "organizador-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "compra-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    mocks.fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        id: "pref-1",
        sandbox_init_point:
          "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=pref-1",
      }),
    );

    const result = await createCheckoutPreference(null, {
      eventoId: "evento-1",
      cantidad: 2,
      buyer: {
        nombre: "Ana",
        apellido: "Perez",
        email: "ana@example.com",
        documento: "30111222",
      },
    });

    expect(result).toMatchObject({
      compraId: "compra-1",
      preferenceId: "pref-1",
      publicKey: "test-public-key",
      precioBase: 20000,
      costoServicio: 1000,
      total: 21000,
    });

    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO compras"),
      [
        null,
        "evento-1",
        2,
        10000,
        21000,
        20000,
        1000,
        5,
        null,
        "Ana",
        "Perez",
        "ana@example.com",
        "30111222",
        "DNI",
      ],
    );

    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/checkout/preferences",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-platform-token",
          "Content-Type": "application/json",
        }),
      }),
    );

    const fetchBody = JSON.parse(
      String(mocks.fetchMock.mock.calls[0]?.[1]?.body || "{}"),
    ) as {
      items: Array<{
        id: string;
        title: string;
        quantity: number;
        unit_price: number;
      }>;
      external_reference: string;
      notification_url?: string;
      back_urls?: { success: string };
      auto_return?: string;
      metadata: { buyer_user_id: string | null };
    };

    expect(fetchBody.external_reference).toBe("compra-1");
    expect(fetchBody.items).toEqual([
      {
        currency_id: "ARS",
        id: "evento-1",
        title: "Festival Andino (2 entradas)",
        quantity: 1,
        unit_price: 21000,
      },
    ]);
    expect(fetchBody.notification_url).toBeUndefined();
    expect(fetchBody.back_urls).toBeUndefined();
    expect(fetchBody.auto_return).toBeUndefined();
    expect(fetchBody.metadata.buyer_user_id).toBeNull();
    expect(mocks.warnMock).toHaveBeenCalledWith(
      "Mercado Pago sin notification_url por backend local/no publico",
      {
        compraId: "compra-1",
        backendBaseUrl: "http://localhost:4000",
      },
    );
    expect(mocks.warnMock).toHaveBeenCalledWith(
      "Mercado Pago sin back_urls ni auto_return por frontend local/no publico",
      {
        compraId: "compra-1",
        frontendBaseUrl: "http://localhost:3000",
      },
    );
  });

  it("rechaza buyer invalido antes de consultar base de datos", async () => {
    await expect(
      createCheckoutPreference(null, {
        eventoId: "evento-1",
        cantidad: 1,
        buyer: {
          nombre: "Ana",
          apellido: "Perez",
          email: "correo-invalido",
          documento: "30111222",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      error: "VALIDATION_ERROR",
      mensaje: "Email del comprador invalido",
    });

    expect(mocks.queryMock).not.toHaveBeenCalled();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("expone estado publico de checkout para compras invitadas", async () => {
    const createdAt = new Date("2026-04-05T18:00:00.000Z");
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "compra-1",
          estado: "PENDIENTE",
          mp_status: "pending",
          cantidad: 2,
          precio_total: "21000.00",
          comprador_email: "ana@example.com",
          created_at: createdAt,
          evento_titulo: "Festival Andino",
        },
      ],
    });

    const result = await getPublicCheckoutStatus("compra-1");

    expect(result).toEqual({
      compraId: "compra-1",
      estado: "PENDIENTE",
      mpStatus: "pending",
      eventoTitulo: "Festival Andino",
      cantidad: 2,
      total: 21000,
      compradorEmail: "ana***@example.com",
      createdAt: createdAt.toISOString(),
    });
  });

  it("permite eventos con Mercado Pago cuando aplica el modo plataforma de prueba", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      assertOrganizerMercadoPagoReadyForEvents("organizador-1"),
    ).resolves.toBeUndefined();
  });

  it("bloquea eventos con Mercado Pago si la cuenta requiere reconexion", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: "organizador-1",
          mp_user_id: "mp-user-1",
          mp_email: "organizador@test.com",
          access_token: "oauth-token",
          refresh_token: "refresh-token",
          public_key: "public-key",
          token_type: "bearer",
          scope: "offline_access",
          expires_in: 3600,
          status: "REQUIERE_RECONEXION",
          connected_at: new Date("2026-01-01T00:00:00.000Z"),
          last_checked_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      assertOrganizerMercadoPagoReadyForEvents("organizador-1"),
    ).rejects.toMatchObject({
      status: 409,
      error: "MP_REQUIERE_RECONEXION",
    });
  });

  it("procesa webhook aprobado, crea entradas y actualiza stock", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "compra-1",
          user_id: null,
          evento_id: "evento-1",
          cantidad: 2,
          estado: "PENDIENTE",
          organizador_mp_user_id: null,
        },
      ],
    });

    mocks.fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        id: "pay-1",
        status: "approved",
        external_reference: "compra-1",
        order: { id: "ord-1" },
      }),
    );

    mocks.clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "compra-1",
            user_id: null,
            evento_id: "evento-1",
            cantidad: 2,
            estado: "PENDIENTE",
            organizador_mp_user_id: null,
            entradas_vendidas: 3,
            cantidad_entradas: 10,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await processMercadoPagoPaymentNotification({
      compraId: "compra-1",
      paymentId: "pay-1",
    });

    expect(mocks.connectMock).toHaveBeenCalledTimes(1);
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FOR UPDATE"),
      ["compra-1"],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("SELECT COUNT(*)::text AS count FROM entradas"),
      ["compra-1"],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("INSERT INTO entradas"),
      ["compra-1", "evento-1", 1],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining("INSERT INTO entradas"),
      ["compra-1", "evento-1", 2],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("UPDATE eventos"),
      ["evento-1", 2],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(8, "COMMIT");
    expect(mocks.releaseMock).toHaveBeenCalledTimes(1);
  });

  it("marca la compra como cancelada cuando Mercado Pago rechaza el pago", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "compra-1",
            user_id: null,
            evento_id: "evento-1",
            cantidad: 1,
            estado: "PENDIENTE",
            organizador_mp_user_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    mocks.fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        id: "pay-1",
        status: "rejected",
        external_reference: "compra-1",
        order: { id: "ord-1" },
      }),
    );

    await processMercadoPagoPaymentNotification({
      compraId: "compra-1",
      paymentId: "pay-1",
    });

    expect(mocks.connectMock).not.toHaveBeenCalled();
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE compras"),
      ["compra-1", "CANCELADO", "pay-1", "ord-1", "rejected"],
    );
  });

  it("no procesa webhooks sin datos minimos y deja warning", async () => {
    await processMercadoPagoPaymentNotification({
      compraId: "",
      paymentId: undefined,
    });

    expect(mocks.warnMock).toHaveBeenCalledWith(
      "Webhook Mercado Pago sin datos minimos",
      {
        compraId: "",
        paymentId: undefined,
      },
    );
    expect(mocks.queryMock).not.toHaveBeenCalled();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("ignora notificaciones con external_reference cruzada", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "compra-1",
          user_id: null,
          evento_id: "evento-1",
          cantidad: 1,
          estado: "PENDIENTE",
          organizador_mp_user_id: null,
        },
      ],
    });

    mocks.fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        id: "pay-1",
        status: "approved",
        external_reference: "otra-compra",
      }),
    );

    await processMercadoPagoPaymentNotification({
      compraId: "compra-1",
      paymentId: "pay-1",
    });

    expect(mocks.warnMock).toHaveBeenCalledWith(
      "Webhook Mercado Pago con referencia cruzada",
      {
        compraId: "compra-1",
        paymentId: "pay-1",
        externalReference: "otra-compra",
      },
    );
    expect(mocks.connectMock).not.toHaveBeenCalled();
    expect(mocks.queryMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza evento sin Mercado Pago habilitado", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "evento-1",
          titulo: "Festival Andino",
          precio: "10000.00",
          cantidad_entradas: 50,
          entradas_vendidas: 4,
          estado: "ACTIVO",
          medios_pago: ["TRANSFERENCIA_CBU"],
          creador_id: "organizador-1",
        },
      ],
    });

    await expect(
      createCheckoutPreference("user-1", {
        eventoId: "evento-1",
        cantidad: 1,
        buyer: {
          nombre: "Ana",
          apellido: "Perez",
          email: "ana@example.com",
          documento: "30111222",
        },
      }),
    ).rejects.toMatchObject({
      status: 409,
      error: "MP_NO_HABILITADO",
    });
  });
});
