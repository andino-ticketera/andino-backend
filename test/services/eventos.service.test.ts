import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/utils/errors.js";
import type {
  AuthUser,
  CreateEventoDTO,
  UsuarioPublico,
} from "../../src/types/index.js";

// Mocks hoisted para poder inyectarlos en los modulos antes del import real
const mocks = vi.hoisted(() => {
  return {
    queryMock: vi.fn(),
    getPublicUserByIdMock: vi.fn(),
    getPublicUsersByIdsMock: vi.fn().mockResolvedValue(new Map()),
  };
});

vi.mock("../../src/db/pool.js", () => ({
  query: mocks.queryMock,
}));

vi.mock("../../src/services/auth.service.js", () => ({
  getPublicUserById: mocks.getPublicUserByIdMock,
  getPublicUsersByIds: mocks.getPublicUsersByIdsMock,
}));

import {
  createEvento,
  hideFinishedEvents,
  listEventosForAdmin,
  parseFinalizadosFilter,
  updateEvento,
} from "../../src/services/eventos.service.js";

// ── Helpers ────────────────────────────────────────────────────────────

function buildCreateDto(overrides: Partial<CreateEventoDTO> = {}): CreateEventoDTO {
  return {
    titulo: "Evento asignado",
    descripcion: "Descripcion del evento asignado por admin",
    fecha_evento: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    locacion: "Teatro Central",
    direccion: "Calle Falsa 123",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 15000,
    cantidad_entradas: 200,
    categoria: "Musica",
    medios_pago: ["MERCADO_PAGO"],
    nombre_organizador: "Polka Produce",
    ...overrides,
  };
}

function buildInsertedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-1",
    titulo: "Evento asignado",
    descripcion: "Descripcion del evento asignado por admin",
    fecha_evento: new Date("2026-06-01T22:00:00.000Z"),
    locacion: "Teatro Central",
    direccion: "Calle Falsa 123",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: "15000.00",
    cantidad_entradas: 200,
    entradas_vendidas: 0,
    categoria: "Musica",
    imagen_url: "/uploads/events/x.jpg",
    flyer_url: null,
    medios_pago: ["MERCADO_PAGO"],
    instagram: null,
    tiktok: null,
    estado: "ACTIVO",
    creador_id: "org-existente",
    creador_rol: "ORGANIZADOR",
    creado_por_admin_id: null,
    nombre_organizador: "Polka Produce",
    idempotency_key: null,
    created_at: new Date("2026-04-10T10:00:00.000Z"),
    updated_at: new Date("2026-04-10T10:00:00.000Z"),
    ...overrides,
  };
}

function buildUser(rol: UsuarioPublico["rol"]): UsuarioPublico {
  return {
    id: "org-existente",
    nombreCompleto: "Organizador Existente",
    email: "org@andino.dev",
    rol,
  };
}

const ADMIN_CALLER: AuthUser = { id: "admin-1", role: "ADMIN" };
const ORGANIZADOR_CALLER: AuthUser = { id: "org-caller", role: "ORGANIZADOR" };

// ── Tests ──────────────────────────────────────────────────────────────

describe("eventos.service.createEvento — asignacion admin → organizador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin con organizador_id valido asigna el evento al organizador destino", async () => {
    mocks.getPublicUserByIdMock.mockResolvedValueOnce(buildUser("ORGANIZADOR"));
    // INSERT retorna la fila final tal cual la dejo el service.
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        buildInsertedRow({
          creador_id: "org-existente",
          creador_rol: "ORGANIZADOR",
          creado_por_admin_id: "admin-1",
        }),
      ],
    });

    const dto = buildCreateDto({ organizador_id: "org-existente" });

    const result = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ADMIN_CALLER,
    );

    expect(result.idempotentReplay).toBe(false);
    expect(result.evento.creador_id).toBe("org-existente");
    expect(result.evento.creador_rol).toBe("ORGANIZADOR");
    expect(result.evento.creado_por_admin_id).toBe("admin-1");
    expect(result.evento.nombre_organizador).toBe("Polka Produce");

    // Verificamos que los parametros del INSERT reflejan la delegacion.
    const insertCall = mocks.queryMock.mock.calls.at(-1);
    expect(insertCall?.[0]).toContain("INSERT INTO eventos");
    const params = insertCall?.[1] as unknown[];
    // [16] = nombre_organizador, [17] = creador_id, [18] = creador_rol, [19] = creado_por_admin_id
    expect(params[15]).toBe("Polka Produce");
    expect(params[16]).toBe("org-existente");
    expect(params[17]).toBe("ORGANIZADOR");
    expect(params[18]).toBe("admin-1");
  });

  it("rechaza organizador_id que apunta a un USUARIO comun (rol insuficiente)", async () => {
    mocks.getPublicUserByIdMock.mockResolvedValueOnce(buildUser("USUARIO"));

    const dto = buildCreateDto({ organizador_id: "user-no-org" });

    await expect(
      createEvento(dto, "/uploads/events/x.jpg", null, ADMIN_CALLER),
    ).rejects.toMatchObject({
      status: 400,
      error: "ORGANIZADOR_INVALIDO",
    });

    // Nunca debe llegar al INSERT cuando el destino es invalido.
    expect(mocks.queryMock).not.toHaveBeenCalled();
  });

  it("rechaza organizador_id inexistente", async () => {
    mocks.getPublicUserByIdMock.mockResolvedValueOnce(null);

    const dto = buildCreateDto({ organizador_id: "no-existe" });

    const err = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ADMIN_CALLER,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    expect((err as AppError).error).toBe("ORGANIZADOR_INVALIDO");
    expect(mocks.queryMock).not.toHaveBeenCalled();
  });

  it("ignora organizador_id cuando el caller no es ADMIN (organizador comun)", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        buildInsertedRow({
          creador_id: "org-caller",
          creador_rol: "ORGANIZADOR",
          creado_por_admin_id: null,
        }),
      ],
    });

    const dto = buildCreateDto({
      organizador_id: "otro-organizador-que-no-deberia-poder-asignar",
      medios_pago: ["TRANSFERENCIA_CBU"],
    });

    const result = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ORGANIZADOR_CALLER,
    );

    // No se consulta al destino: el campo se ignora silenciosamente.
    expect(mocks.getPublicUserByIdMock).not.toHaveBeenCalled();
    expect(result.evento.creador_id).toBe("org-caller");
    expect(result.evento.creado_por_admin_id).toBeNull();

    const insertCall = mocks.queryMock.mock.calls.at(-1);
    const params = insertCall?.[1] as unknown[];
    expect(params[15]).toBe("Polka Produce");
    expect(params[16]).toBe("org-caller");
    expect(params[17]).toBe("ORGANIZADOR");
    expect(params[18]).toBeNull();
  });

  it("admin que no envia organizador_id crea el evento en su propio nombre (legacy)", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        buildInsertedRow({
          creador_id: "admin-1",
          creador_rol: "ADMIN",
          creado_por_admin_id: null,
        }),
      ],
    });

    const dto = buildCreateDto({ medios_pago: ["TRANSFERENCIA_CBU"] });

    const result = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ADMIN_CALLER,
    );

    expect(mocks.getPublicUserByIdMock).not.toHaveBeenCalled();
    expect(result.evento.creador_id).toBe("admin-1");
    expect(result.evento.creador_rol).toBe("ADMIN");
    expect(result.evento.creado_por_admin_id).toBeNull();
  });

  it("admin asignando a organizador sin MP conectado igual persiste el evento (el checkout falla despues)", async () => {
    // Esta prueba documenta la regla: el service NO consulta el estado de MP
    // del destino; eso es responsabilidad del route, y cuando el admin asigna
    // explicitamente el route saltea esa validacion a proposito.
    mocks.getPublicUserByIdMock.mockResolvedValueOnce(buildUser("ORGANIZADOR"));
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        buildInsertedRow({
          creador_id: "org-existente",
          creador_rol: "ORGANIZADOR",
          creado_por_admin_id: "admin-1",
          medios_pago: ["MERCADO_PAGO"],
        }),
      ],
    });

    const dto = buildCreateDto({
      organizador_id: "org-existente",
      medios_pago: ["MERCADO_PAGO"],
    });

    const result = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ADMIN_CALLER,
    );

    expect(result.evento.creador_id).toBe("org-existente");
    expect(result.evento.creado_por_admin_id).toBe("admin-1");
    // El service no debe consultar `organizador_mercado_pago` en este flujo.
  });

  it("reintenta el alta sin nombre_organizador cuando la DB legacy no tiene esa columna", async () => {
    mocks.queryMock
      .mockRejectedValueOnce(
        Object.assign(new Error("missing column"), {
          code: "42703",
          message: 'column "nombre_organizador" of relation "eventos" does not exist',
        }),
      )
      .mockResolvedValueOnce({
        rows: [
          buildInsertedRow({
            creador_id: "org-caller",
            creador_rol: "ORGANIZADOR",
            nombre_organizador: null,
          }),
        ],
      });

    mocks.getPublicUsersByIdsMock.mockResolvedValueOnce(
      new Map([
        [
          "org-caller",
          {
            id: "org-caller",
            nombreCompleto: "Organizador Existente",
            email: "org@andino.dev",
            rol: "ORGANIZADOR",
          },
        ],
      ]),
    );

    const dto = buildCreateDto({
      medios_pago: ["TRANSFERENCIA_CBU"],
      nombre_organizador: "Nombre legacy",
    });

    const result = await createEvento(
      dto,
      "/uploads/events/x.jpg",
      null,
      ORGANIZADOR_CALLER,
    );

    expect(result.idempotentReplay).toBe(false);
    expect(result.evento.creador_id).toBe("org-caller");
    expect(result.evento.nombre_organizador).toBe("Organizador Existente");
    expect(mocks.queryMock).toHaveBeenCalledTimes(2);
    expect(mocks.queryMock.mock.calls[1]?.[0]).not.toContain(
      "nombre_organizador",
    );
  });
});

// ── hideFinishedEvents ─────────────────────────────────────────────────

describe("eventos.service.hideFinishedEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("oculta eventos finalizados y limpia su entrada del carrusel", async () => {
    // UPDATE ... RETURNING id
    mocks.queryMock.mockResolvedValueOnce({
      rows: [{ id: "evt-finalizado-1" }, { id: "evt-finalizado-2" }],
    });
    // DELETE FROM carrusel_eventos
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    await hideFinishedEvents();

    expect(mocks.queryMock).toHaveBeenCalledTimes(2);

    const updateCall = mocks.queryMock.mock.calls[0];
    expect(updateCall[0]).toContain("UPDATE eventos");
    expect(updateCall[0]).toContain("SET visible_en_app = FALSE");
    expect(updateCall[0]).toContain("fecha_evento < NOW() - INTERVAL '1 day'");
    expect(updateCall[0]).toContain("visible_en_app = TRUE");
    expect(updateCall[0]).toContain("estado <> 'CANCELADO'");

    const deleteCall = mocks.queryMock.mock.calls[1];
    expect(deleteCall[0]).toContain("DELETE FROM carrusel_eventos");
    expect(deleteCall[1]).toEqual([["evt-finalizado-1", "evt-finalizado-2"]]);
  });

  it("es no-op cuando no hay eventos finalizados pendientes", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    await hideFinishedEvents();

    expect(mocks.queryMock).toHaveBeenCalledTimes(1);
    // No debe intentar borrar del carrusel si no hay ids.
  });

  it("tolera DB legacy sin columna visible_en_app", async () => {
    const missingColumnError = Object.assign(new Error("missing"), {
      code: "42703",
      message: 'column "visible_en_app" does not exist',
    });
    mocks.queryMock.mockRejectedValueOnce(missingColumnError);

    await expect(hideFinishedEvents()).resolves.toBeUndefined();
  });

  it("propaga errores de DB que no sean por columna faltante", async () => {
    mocks.queryMock.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "XX000" }),
    );

    await expect(hideFinishedEvents()).rejects.toThrow("boom");
  });
});

// ── listEventosForAdmin + filtro finalizados ──────────────────────────

describe("eventos.service.listEventosForAdmin — filtro finalizados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default excluye finalizados (fecha_evento >= NOW() - 1 day)", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [buildInsertedRow({ id: "evt-futuro" })],
    });

    await listEventosForAdmin();

    const sql = mocks.queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("estado != 'CANCELADO'");
    expect(sql).toContain("fecha_evento >= NOW() - INTERVAL '1 day'");
    expect(sql).not.toContain("fecha_evento < NOW()");
  });

  it("filter=incluir trae todos los eventos no cancelados sin filtro de fecha", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    await listEventosForAdmin("incluir");

    const sql = mocks.queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("estado != 'CANCELADO'");
    expect(sql).not.toContain("fecha_evento >=");
    expect(sql).not.toContain("fecha_evento <");
  });

  it("filter=solo trae unicamente eventos finalizados", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [buildInsertedRow({ id: "evt-viejo" })],
    });

    await listEventosForAdmin("solo");

    const sql = mocks.queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("estado != 'CANCELADO'");
    expect(sql).toContain("fecha_evento < NOW() - INTERVAL '1 day'");
  });
});

describe("eventos.service.parseFinalizadosFilter", () => {
  it("default excluir cuando el valor es invalido, vacio o desconocido", () => {
    expect(parseFinalizadosFilter(undefined)).toBe("excluir");
    expect(parseFinalizadosFilter(null)).toBe("excluir");
    expect(parseFinalizadosFilter("")).toBe("excluir");
    expect(parseFinalizadosFilter("foo")).toBe("excluir");
    expect(parseFinalizadosFilter("excluir")).toBe("excluir");
  });

  it("acepta incluir y solo en cualquier case", () => {
    expect(parseFinalizadosFilter("incluir")).toBe("incluir");
    expect(parseFinalizadosFilter("INCLUIR")).toBe("incluir");
    expect(parseFinalizadosFilter(" solo ")).toBe("solo");
    expect(parseFinalizadosFilter("Solo")).toBe("solo");
  });
});

describe("eventos.service.updateEvento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reintenta el update sin nombre_organizador cuando la DB legacy no tiene esa columna", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          buildInsertedRow({
            id: "evt-1",
            creador_id: "org-existente",
            nombre_organizador: null,
          }),
        ],
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing column"), {
          code: "42703",
          message: 'column "nombre_organizador" of relation "eventos" does not exist',
        }),
      )
      .mockResolvedValueOnce({
        rows: [
          buildInsertedRow({
            id: "evt-1",
            titulo: "Evento actualizado",
            creador_id: "org-existente",
            nombre_organizador: null,
          }),
        ],
      });

    mocks.getPublicUsersByIdsMock.mockResolvedValueOnce(
      new Map([
        [
          "org-existente",
          {
            id: "org-existente",
            nombreCompleto: "Organizador Existente",
            email: "org@andino.dev",
            rol: "ORGANIZADOR",
          },
        ],
      ]),
    );

    const result = await updateEvento("evt-1", {
      titulo: "Evento actualizado",
      nombre_organizador: "Nombre que no puede persistirse todavia",
    });

    expect(result.titulo).toBe("Evento actualizado");
    expect(result.nombre_organizador).toBe("Organizador Existente");
    expect(mocks.queryMock).toHaveBeenCalledTimes(3);
    expect(mocks.queryMock.mock.calls[1]?.[0]).toContain("nombre_organizador");
    expect(mocks.queryMock.mock.calls[2]?.[0]).not.toContain(
      "nombre_organizador",
    );
  });
});
