import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/utils/errors.js";

const mocks = vi.hoisted(() => {
  const queryMock = vi.fn();
  const clientQueryMock = vi.fn();
  const releaseMock = vi.fn();
  const connectMock = vi.fn(async () => ({
    query: clientQueryMock,
    release: releaseMock,
  }));

  return {
    queryMock,
    clientQueryMock,
    releaseMock,
    connectMock,
  };
});

vi.mock("../../src/db/pool.js", () => ({
  query: mocks.queryMock,
  default: {
    connect: mocks.connectMock,
  },
}));

import {
  listCarruselEventos,
  updateCarruselEventos,
} from "../../src/services/carrusel.service.js";

const UUID_1 = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("carrusel.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista eventos de carrusel ordenados", async () => {
    mocks.queryMock.mockResolvedValueOnce({
      rows: [{ evento_id: UUID_1 }, { evento_id: UUID_2 }],
    });

    const result = await listCarruselEventos();

    expect(mocks.queryMock).toHaveBeenCalledTimes(1);
    expect(mocks.queryMock.mock.calls[0]?.[0]).toContain(
      "ORDER BY c.created_at ASC",
    );
    expect(result).toEqual([{ evento_id: UUID_1 }, { evento_id: UUID_2 }]);
  });

  it("actualiza carrusel en transaccion y devuelve configuracion persistida", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({ rows: [{ id: UUID_1 }, { id: UUID_2 }] })
      .mockResolvedValueOnce({
        rows: [{ evento_id: UUID_1 }, { evento_id: UUID_2 }],
      });

    mocks.clientQueryMock.mockResolvedValue({ rows: [] });

    const result = await updateCarruselEventos([UUID_1, UUID_2]);

    expect(mocks.connectMock).toHaveBeenCalledTimes(1);
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM carrusel_eventos",
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO carrusel_eventos"),
      [UUID_1],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("INSERT INTO carrusel_eventos"),
      [UUID_2],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(5, "COMMIT");
    expect(mocks.releaseMock).toHaveBeenCalledTimes(1);

    expect(result).toEqual([{ evento_id: UUID_1 }, { evento_id: UUID_2 }]);
  });

  it("falla con AppError si se intentan guardar eventos inexistentes", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: UUID_1 }] });

    const promise = updateCarruselEventos([UUID_1, UUID_2]);

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      status: 400,
      error: "VALIDATION_ERROR",
    });

    expect(mocks.connectMock).not.toHaveBeenCalled();
  });

  it("hace rollback si falla la insercion dentro de la transaccion", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: UUID_1 }] });

    mocks.clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockResolvedValueOnce({ rows: [] });

    await expect(updateCarruselEventos([UUID_1])).rejects.toThrow(
      "insert failed",
    );

    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM carrusel_eventos",
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO carrusel_eventos"),
      [UUID_1],
    );
    expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(4, "ROLLBACK");
    expect(mocks.releaseMock).toHaveBeenCalledTimes(1);
  });
});
