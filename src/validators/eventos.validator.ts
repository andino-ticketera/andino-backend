import type { ValidationDetail, MedioPago } from "../types/index.js";

const MEDIOS_PAGO_VALIDOS: MedioPago[] = ["TRANSFERENCIA_CBU", "MERCADO_PAGO"];
const IMAGEN_MIMETYPES = ["image/jpeg", "image/png", "image/webp"];

// UUID v1-v5 estandar (caso-insensitive)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidISODate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isValidSocialValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith("@")) {
    return /^@[A-Za-z0-9._]{2,30}$/.test(v);
  }

  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseMediosPago(raw: unknown): MedioPago[] {
  if (Array.isArray(raw)) return raw as MedioPago[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as MedioPago[];
    } catch {
      return [raw as MedioPago];
    }
  }
  return [];
}

export function validateCreateEvento(
  body: Record<string, unknown>,
  files: { imagen?: Express.Multer.File[]; flyer?: Express.Multer.File[] },
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  // titulo
  const titulo = String(body.titulo || "").trim();
  if (!titulo) {
    errors.push({ campo: "titulo", mensaje: "El titulo es obligatorio" });
  } else if (titulo.length < 3 || titulo.length > 120) {
    errors.push({
      campo: "titulo",
      mensaje: "El titulo debe tener entre 3 y 120 caracteres",
    });
  }

  // descripcion
  const descripcion = String(body.descripcion || "").trim();
  if (!descripcion) {
    errors.push({
      campo: "descripcion",
      mensaje: "La descripcion es obligatoria",
    });
  } else if (descripcion.length > 2000) {
    errors.push({
      campo: "descripcion",
      mensaje: "La descripcion no puede superar los 2000 caracteres",
    });
  }

  // fecha_evento
  const fechaEvento = String(body.fecha_evento || "").trim();
  if (!fechaEvento) {
    errors.push({
      campo: "fecha_evento",
      mensaje: "La fecha del evento es obligatoria",
    });
  } else if (!isValidISODate(fechaEvento)) {
    errors.push({
      campo: "fecha_evento",
      mensaje: "La fecha debe ser valida en formato ISO 8601",
    });
  } else {
    const eventDate = new Date(fechaEvento);
    const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (eventDate < minDate) {
      errors.push({
        campo: "fecha_evento",
        mensaje:
          "El evento debe programarse con al menos 24 horas de anticipacion",
      });
    }
  }

  // locacion
  const locacion = String(body.locacion || "").trim();
  if (!locacion) {
    errors.push({ campo: "locacion", mensaje: "La locacion es obligatoria" });
  } else if (locacion.length < 3 || locacion.length > 200) {
    errors.push({
      campo: "locacion",
      mensaje: "La locacion debe tener entre 3 y 200 caracteres",
    });
  }

  // direccion
  const direccion = String(body.direccion || "").trim();
  if (!direccion) {
    errors.push({ campo: "direccion", mensaje: "La direccion es obligatoria" });
  } else if (direccion.length < 5 || direccion.length > 300) {
    errors.push({
      campo: "direccion",
      mensaje: "La direccion debe tener entre 5 y 300 caracteres",
    });
  }

  // provincia
  const provincia = String(body.provincia || "").trim();
  if (!provincia) {
    errors.push({ campo: "provincia", mensaje: "La provincia es obligatoria" });
  } else if (provincia.length < 2 || provincia.length > 100) {
    errors.push({
      campo: "provincia",
      mensaje: "La provincia debe tener entre 2 y 100 caracteres",
    });
  }

  // localidad
  const localidad = String(body.localidad || "").trim();
  if (!localidad) {
    errors.push({ campo: "localidad", mensaje: "La localidad es obligatoria" });
  } else if (localidad.length < 2 || localidad.length > 100) {
    errors.push({
      campo: "localidad",
      mensaje: "La localidad debe tener entre 2 y 100 caracteres",
    });
  }

  // precio
  const precio = Number(body.precio);
  if (body.precio === undefined || body.precio === null || body.precio === "") {
    errors.push({ campo: "precio", mensaje: "El precio es obligatorio" });
  } else if (isNaN(precio) || precio < 0) {
    errors.push({
      campo: "precio",
      mensaje: "El precio debe ser mayor o igual a 0",
    });
  } else {
    const decimals = String(body.precio).split(".")[1];
    if (decimals && decimals.length > 2) {
      errors.push({
        campo: "precio",
        mensaje: "El precio debe tener como maximo 2 decimales",
      });
    }
  }

  // cantidad_entradas
  const cantidadEntradas = parseInt(String(body.cantidad_entradas), 10);
  if (!body.cantidad_entradas) {
    errors.push({
      campo: "cantidad_entradas",
      mensaje: "La cantidad de entradas es obligatoria",
    });
  } else if (
    isNaN(cantidadEntradas) ||
    cantidadEntradas < 1 ||
    cantidadEntradas > 100000
  ) {
    errors.push({
      campo: "cantidad_entradas",
      mensaje: "La cantidad debe estar entre 1 y 100.000",
    });
  }

  // categoria
  const categoria = String(body.categoria || "").trim();
  if (!categoria) {
    errors.push({ campo: "categoria", mensaje: "La categoria es obligatoria" });
  } else if (categoria.length < 2 || categoria.length > 50) {
    errors.push({
      campo: "categoria",
      mensaje: "La categoria debe tener entre 2 y 50 caracteres",
    });
  }

  // imagen (archivo)
  const imagen = files.imagen?.[0];
  if (!imagen) {
    errors.push({
      campo: "imagen",
      mensaje: "La imagen del evento es obligatoria",
    });
  } else if (!IMAGEN_MIMETYPES.includes(imagen.mimetype)) {
    errors.push({
      campo: "imagen",
      mensaje: "Formato de imagen no soportado. Use JPG, PNG o WEBP",
    });
  }

  // flyer (archivo, opcional)
  const flyer = files.flyer?.[0];
  if (flyer && !IMAGEN_MIMETYPES.includes(flyer.mimetype)) {
    errors.push({
      campo: "flyer",
      mensaje: "Formato de flyer no soportado. Use JPG, PNG o WEBP",
    });
  }

  // medios_pago
  const mediosPago = parseMediosPago(body.medios_pago);
  if (mediosPago.length === 0) {
    errors.push({
      campo: "medios_pago",
      mensaje: "Debe seleccionar al menos un medio de pago",
    });
  } else {
    for (const mp of mediosPago) {
      if (!MEDIOS_PAGO_VALIDOS.includes(mp)) {
        errors.push({
          campo: "medios_pago",
          mensaje: `Medio de pago invalido: ${mp}`,
        });
      }
    }
  }

  // Regla cruzada: evento gratuito + mercado pago
  if (!isNaN(precio) && precio === 0 && mediosPago.includes("MERCADO_PAGO")) {
    errors.push({
      campo: "medios_pago",
      mensaje:
        "Un evento gratuito no puede tener Mercado Pago como medio de pago",
    });
  }

  // instagram (opcional)
  if (body.instagram !== undefined && body.instagram !== null) {
    const instagram = String(body.instagram).trim();
    if (instagram && !isValidSocialValue(instagram)) {
      errors.push({
        campo: "instagram",
        mensaje: "Instagram debe ser una URL valida o @usuario",
      });
    }
  }

  // tiktok (opcional)
  if (body.tiktok !== undefined && body.tiktok !== null) {
    const tiktok = String(body.tiktok).trim();
    if (tiktok && !isValidSocialValue(tiktok)) {
      errors.push({
        campo: "tiktok",
        mensaje: "TikTok debe ser una URL valida o @usuario",
      });
    }
  }

  // organizador_id (opcional, solo para ADMIN). Acá validamos únicamente
  // el formato; la existencia y el rol del usuario destino se chequean en
  // el service consultando Supabase.
  if (
    body.organizador_id !== undefined &&
    body.organizador_id !== null &&
    String(body.organizador_id).trim() !== ""
  ) {
    const organizadorId = String(body.organizador_id).trim();
    if (!isValidUuid(organizadorId)) {
      errors.push({
        campo: "organizador_id",
        mensaje: "organizador_id debe ser un UUID valido",
      });
    }
  }

  return errors;
}

export function validateUpdateEvento(
  body: Record<string, unknown>,
  files: { imagen?: Express.Multer.File[]; flyer?: Express.Multer.File[] },
  current: { entradas_vendidas: number; precio: number; medios_pago: string[] },
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  const editableFields = [
    "titulo",
    "descripcion",
    "fecha_evento",
    "locacion",
    "direccion",
    "provincia",
    "localidad",
    "precio",
    "cantidad_entradas",
    "categoria",
    "medios_pago",
    "instagram",
    "tiktok",
    "remove_flyer",
  ];

  const hasFields = editableFields.some((f) => body[f] !== undefined);
  const hasFiles = !!(files.imagen?.[0] || files.flyer?.[0]);

  if (!hasFields && !hasFiles) {
    errors.push({
      campo: "_body",
      mensaje: "Debe enviar al menos un campo para actualizar",
    });
    return errors;
  }

  // titulo
  if (body.titulo !== undefined) {
    const titulo = String(body.titulo).trim();
    if (titulo.length < 3 || titulo.length > 120) {
      errors.push({
        campo: "titulo",
        mensaje: "El titulo debe tener entre 3 y 120 caracteres",
      });
    }
  }

  // descripcion
  if (body.descripcion !== undefined) {
    const descripcion = String(body.descripcion).trim();
    if (descripcion.length > 2000) {
      errors.push({
        campo: "descripcion",
        mensaje: "La descripcion no puede superar los 2000 caracteres",
      });
    }
  }

  // fecha_evento
  if (body.fecha_evento !== undefined) {
    const fechaEvento = String(body.fecha_evento).trim();
    if (!isValidISODate(fechaEvento)) {
      errors.push({
        campo: "fecha_evento",
        mensaje: "La fecha debe ser valida en formato ISO 8601",
      });
    } else {
      const eventDate = new Date(fechaEvento);
      if (eventDate <= new Date()) {
        errors.push({
          campo: "fecha_evento",
          mensaje: "La fecha del evento debe ser futura",
        });
      }
    }
  }

  // locacion
  if (body.locacion !== undefined) {
    const locacion = String(body.locacion).trim();
    if (locacion.length < 3 || locacion.length > 200) {
      errors.push({
        campo: "locacion",
        mensaje: "La locacion debe tener entre 3 y 200 caracteres",
      });
    }
  }

  // direccion
  if (body.direccion !== undefined) {
    const direccion = String(body.direccion).trim();
    if (direccion.length < 5 || direccion.length > 300) {
      errors.push({
        campo: "direccion",
        mensaje: "La direccion debe tener entre 5 y 300 caracteres",
      });
    }
  }

  // provincia
  if (body.provincia !== undefined) {
    const provincia = String(body.provincia).trim();
    if (provincia.length < 2 || provincia.length > 100) {
      errors.push({
        campo: "provincia",
        mensaje: "La provincia debe tener entre 2 y 100 caracteres",
      });
    }
  }

  // localidad
  if (body.localidad !== undefined) {
    const localidad = String(body.localidad).trim();
    if (localidad.length < 2 || localidad.length > 100) {
      errors.push({
        campo: "localidad",
        mensaje: "La localidad debe tener entre 2 y 100 caracteres",
      });
    }
  }

  // precio
  if (body.precio !== undefined) {
    if (current.entradas_vendidas > 0) {
      const newPrecio = Number(body.precio);
      if (newPrecio !== current.precio) {
        errors.push({
          campo: "precio",
          mensaje:
            "No se puede modificar el precio de un evento con entradas vendidas",
        });
      }
    } else {
      const precio = Number(body.precio);
      if (isNaN(precio) || precio < 0) {
        errors.push({
          campo: "precio",
          mensaje: "El precio debe ser mayor o igual a 0",
        });
      } else {
        const decimals = String(body.precio).split(".")[1];
        if (decimals && decimals.length > 2) {
          errors.push({
            campo: "precio",
            mensaje: "El precio debe tener como maximo 2 decimales",
          });
        }
      }
    }
  }

  // cantidad_entradas
  if (body.cantidad_entradas !== undefined) {
    const cantidad = parseInt(String(body.cantidad_entradas), 10);
    if (isNaN(cantidad) || cantidad < 1 || cantidad > 100000) {
      errors.push({
        campo: "cantidad_entradas",
        mensaje: "La cantidad debe estar entre 1 y 100.000",
      });
    } else if (cantidad < current.entradas_vendidas) {
      errors.push({
        campo: "cantidad_entradas",
        mensaje: `La cantidad de entradas no puede ser menor a las entradas ya vendidas (${current.entradas_vendidas} vendidas)`,
      });
    }
  }

  // categoria
  if (body.categoria !== undefined) {
    const categoria = String(body.categoria).trim();
    if (categoria.length < 2 || categoria.length > 50) {
      errors.push({
        campo: "categoria",
        mensaje: "La categoria debe tener entre 2 y 50 caracteres",
      });
    }
  }

  // imagen
  const imagen = files.imagen?.[0];
  if (imagen && !IMAGEN_MIMETYPES.includes(imagen.mimetype)) {
    errors.push({
      campo: "imagen",
      mensaje: "Formato de imagen no soportado. Use JPG, PNG o WEBP",
    });
  }

  // flyer
  const flyer = files.flyer?.[0];
  if (flyer && !IMAGEN_MIMETYPES.includes(flyer.mimetype)) {
    errors.push({
      campo: "flyer",
      mensaje: "Formato de flyer no soportado. Use JPG, PNG o WEBP",
    });
  }

  if (body.remove_flyer !== undefined) {
    const removeFlyer = String(body.remove_flyer).trim().toLowerCase();
    if (removeFlyer !== "true" && removeFlyer !== "false") {
      errors.push({
        campo: "remove_flyer",
        mensaje: "remove_flyer debe ser true o false",
      });
    }
  }

  // medios_pago
  if (body.medios_pago !== undefined) {
    const mediosPago = parseMediosPago(body.medios_pago);
    if (mediosPago.length === 0) {
      errors.push({
        campo: "medios_pago",
        mensaje: "Debe seleccionar al menos un medio de pago",
      });
    } else {
      for (const mp of mediosPago) {
        if (!MEDIOS_PAGO_VALIDOS.includes(mp)) {
          errors.push({
            campo: "medios_pago",
            mensaje: `Medio de pago invalido: ${mp}`,
          });
        }
      }
    }
  }

  // instagram (opcional)
  if (body.instagram !== undefined && body.instagram !== null) {
    const instagram = String(body.instagram).trim();
    if (instagram && !isValidSocialValue(instagram)) {
      errors.push({
        campo: "instagram",
        mensaje: "Instagram debe ser una URL valida o @usuario",
      });
    }
  }

  // tiktok (opcional)
  if (body.tiktok !== undefined && body.tiktok !== null) {
    const tiktok = String(body.tiktok).trim();
    if (tiktok && !isValidSocialValue(tiktok)) {
      errors.push({
        campo: "tiktok",
        mensaje: "TikTok debe ser una URL valida o @usuario",
      });
    }
  }

  // Regla cruzada final: evento gratuito + mercado pago (con estado resultante)
  const precioFinal =
    body.precio !== undefined ? Number(body.precio) : current.precio;
  const mediosPagoFinal =
    body.medios_pago !== undefined
      ? parseMediosPago(body.medios_pago)
      : (current.medios_pago as MedioPago[]);
  if (
    !isNaN(precioFinal) &&
    precioFinal === 0 &&
    mediosPagoFinal.includes("MERCADO_PAGO")
  ) {
    errors.push({
      campo: "medios_pago",
      mensaje:
        "Un evento gratuito no puede tener Mercado Pago como medio de pago",
    });
  }

  return errors;
}

export { parseMediosPago };
