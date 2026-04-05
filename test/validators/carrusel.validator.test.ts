import { describe, expect, it } from "vitest";
import {
  normalizeCarruselEventIds,
  validateUpdateCarrusel,
} from "../../src/validators/carrusel.validator.js";

const UUID_1 = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";
const UUID_3 = "33333333-3333-4333-8333-333333333333";
const UUID_4 = "44444444-4444-4444-8444-444444444444";
const UUID_5 = "55555555-5555-4555-8555-555555555555";
const UUID_6 = "66666666-6666-4666-8666-666666666666";
const UUID_7 = "77777777-7777-4777-8777-777777777777";

describe("normalizeCarruselEventIds", () => {
  it("retorna array vacio cuando no recibe un array", () => {
    expect(normalizeCarruselEventIds(null)).toEqual([]);
    expect(normalizeCarruselEventIds("texto")).toEqual([]);
  });

  it("trimmea IDs y descarta valores vacios", () => {
    expect(
      normalizeCarruselEventIds([` ${UUID_1} `, "", "   ", UUID_2]),
    ).toEqual([UUID_1, UUID_2]);
  });
});

describe("validateUpdateCarrusel", () => {
  it("falla cuando eventIds no es array", () => {
    const errors = validateUpdateCarrusel({ eventIds: "no-array" });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      campo: "eventIds",
      mensaje: "eventIds debe ser un array de IDs de eventos",
    });
  });

  it("acepta hasta 6 UUIDs validos y unicos", () => {
    const errors = validateUpdateCarrusel({
      eventIds: [UUID_1, UUID_2, UUID_3, UUID_4, UUID_5, UUID_6],
    });

    expect(errors).toEqual([]);
  });

  it("reporta error cuando hay mas de 6 eventos", () => {
    const errors = validateUpdateCarrusel({
      eventIds: [UUID_1, UUID_2, UUID_3, UUID_4, UUID_5, UUID_6, UUID_7],
    });

    expect(
      errors.some(
        (error) =>
          error.campo === "eventIds" &&
          error.mensaje === "El carrusel permite como maximo 6 eventos",
      ),
    ).toBe(true);
  });

  it("reporta IDs invalidos, duplicados y vacios", () => {
    const errors = validateUpdateCarrusel({
      eventIds: [UUID_1, "invalido", UUID_1, "   "],
    });

    expect(
      errors.some((error) =>
        error.mensaje.includes("Todos los IDs deben ser strings no vacios"),
      ),
    ).toBe(true);
    expect(
      errors.some((error) =>
        error.mensaje.includes("ID de evento invalido: invalido"),
      ),
    ).toBe(true);
    expect(
      errors.some((error) =>
        error.mensaje.includes(`ID de evento duplicado: ${UUID_1}`),
      ),
    ).toBe(true);
  });
});
