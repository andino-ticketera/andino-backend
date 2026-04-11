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
  };
});

vi.mock("../../src/db/pool.js", () => ({
  query: mocks.queryMock,
}));

vi.mock("../../src/services/auth.service.js", () => ({
  getPublicUserById: mocks.getPublicUserByIdMock,
}));

import { createEvento } from "../../src/services/eventos.service.js";

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

    // Verificamos que los parametros del INSERT reflejan la delegacion.
    const insertCall = mocks.queryMock.mock.calls.at(-1);
    expect(insertCall?.[0]).toContain("INSERT INTO eventos");
    const params = insertCall?.[1] as unknown[];
    // [16] = creador_id, [17] = creador_rol, [18] = creado_por_admin_id
    expect(params[15]).toBe("org-existente");
    expect(params[16]).toBe("ORGANIZADOR");
    expect(params[17]).toBe("admin-1");
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
    expect(params[15]).toBe("org-caller");
    expect(params[16]).toBe("ORGANIZADOR");
    expect(params[17]).toBeNull();
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
});
