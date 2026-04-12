import { describe, expect, it } from "vitest";
import {
  parseMediosPago,
  validateCreateEvento,
  validateUpdateEvento,
} from "../../src/validators/eventos.validator.js";

function mockImageFile(mimetype = "image/jpeg"): Express.Multer.File {
  return { mimetype } as Express.Multer.File;
}

function buildValidCreateBody(): Record<string, unknown> {
  const date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  return {
    titulo: "Evento Test",
    descripcion: "Descripcion valida del evento para testing",
    fecha_evento: date,
    locacion: "Teatro Central",
    direccion: "Calle Falsa 123",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 15000,
    cantidad_entradas: 200,
    categoria: "Musica",
    medios_pago: ["TRANSFERENCIA_CBU"],
    nombre_organizador: "Polka Produce",
    instagram: "@organizador_ok",
    tiktok: "https://www.tiktok.com/@organizador_ok",
  };
}

describe("eventos.validator - create", () => {
  it("acepta payload valido", () => {
    const body = buildValidCreateBody();
    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/jpeg")],
    });

    expect(errors).toEqual([]);
  });

  it("falla cuando falta la imagen", () => {
    const errors = validateCreateEvento(buildValidCreateBody(), {});

    expect(errors.some((error) => error.campo === "imagen")).toBe(true);
  });

  it("falla regla cruzada: gratis + mercado pago", () => {
    const body = buildValidCreateBody();
    body.precio = 0;
    body.medios_pago = ["MERCADO_PAGO"];

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/png")],
    });

    expect(
      errors.some((error) =>
        error.mensaje.includes(
          "Un evento gratuito no puede tener Mercado Pago como medio de pago",
        ),
      ),
    ).toBe(true);
  });

  it("falla con redes sociales invalidas", () => {
    const body = buildValidCreateBody();
    body.instagram = "@x";
    body.tiktok = "notaurl";

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/webp")],
    });

    expect(errors.some((error) => error.campo === "instagram")).toBe(true);
    expect(errors.some((error) => error.campo === "tiktok")).toBe(true);
  });

  it("acepta organizador_id con formato UUID valido (admin asigna a otro)", () => {
    const body = buildValidCreateBody();
    body.organizador_id = "5f4d3c2b-1a9b-4c8d-8e7f-0a1b2c3d4e5f";

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/jpeg")],
    });

    expect(errors).toEqual([]);
  });

  it("falla cuando organizador_id no es un UUID valido", () => {
    const body = buildValidCreateBody();
    body.organizador_id = "no-es-un-uuid";

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/jpeg")],
    });

    expect(errors.some((error) => error.campo === "organizador_id")).toBe(true);
  });

  it("ignora organizador_id vacio sin marcarlo como error", () => {
    const body = buildValidCreateBody();
    body.organizador_id = "";

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/jpeg")],
    });

    expect(errors.some((error) => error.campo === "organizador_id")).toBe(
      false,
    );
  });

  it("falla cuando nombre_organizador es demasiado corto", () => {
    const body = buildValidCreateBody();
    body.nombre_organizador = "A";

    const errors = validateCreateEvento(body, {
      imagen: [mockImageFile("image/jpeg")],
    });

    expect(
      errors.some((error) => error.campo === "nombre_organizador"),
    ).toBe(true);
  });
});

describe("eventos.validator - update", () => {
  const current = {
    entradas_vendidas: 10,
    precio: 15000,
    medios_pago: ["TRANSFERENCIA_CBU"],
  };

  it("falla si no se envian campos ni archivos", () => {
    const errors = validateUpdateEvento({}, {}, current);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.campo).toBe("_body");
  });

  it("no permite cambiar precio cuando hay entradas vendidas", () => {
    const errors = validateUpdateEvento({ precio: 14000 }, {}, current);

    expect(errors.some((error) => error.campo === "precio")).toBe(true);
  });

  it("no permite bajar stock por debajo de vendidas", () => {
    const errors = validateUpdateEvento({ cantidad_entradas: 5 }, {}, current);

    expect(errors.some((error) => error.campo === "cantidad_entradas")).toBe(
      true,
    );
  });

  it("valida regla cruzada final: precio final gratis + mercado pago", () => {
    const errors = validateUpdateEvento(
      { precio: 0, medios_pago: ["MERCADO_PAGO"] },
      {},
      { ...current, entradas_vendidas: 0, precio: 12000 },
    );

    expect(
      errors.some((error) =>
        error.mensaje.includes(
          "Un evento gratuito no puede tener Mercado Pago como medio de pago",
        ),
      ),
    ).toBe(true);
  });

  it("acepta update parcial valido", () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const errors = validateUpdateEvento(
      {
        titulo: "Evento editado",
        fecha_evento: futureDate,
        categoria: "Fiestas",
      },
      {},
      current,
    );

    expect(errors).toEqual([]);
  });

  it("valida nombre_organizador en updates", () => {
    const errors = validateUpdateEvento(
      { nombre_organizador: "A" },
      {},
      current,
    );

    expect(
      errors.some((error) => error.campo === "nombre_organizador"),
    ).toBe(true);
  });
});

describe("eventos.validator - parseMediosPago", () => {
  it("parsea arrays y JSON string", () => {
    expect(parseMediosPago(["TRANSFERENCIA_CBU"])).toEqual([
      "TRANSFERENCIA_CBU",
    ]);

    expect(parseMediosPago('["MERCADO_PAGO"]')).toEqual(["MERCADO_PAGO"]);
  });

  it("cuando recibe string no JSON lo transforma en un item", () => {
    expect(parseMediosPago("MERCADO_PAGO")).toEqual(["MERCADO_PAGO"]);
  });
});
