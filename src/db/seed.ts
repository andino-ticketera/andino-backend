import pool, { query } from "./pool.js";

interface SeedEvento {
  titulo: string;
  descripcion: string;
  fechaEvento: string;
  locacion: string;
  direccion: string;
  provincia: string;
  localidad: string;
  precio: number;
  cantidadEntradas: number;
  entradasVendidas: number;
  categoria: string;
  imagenUrl: string;
  flyerUrl: string | null;
  mediosPago: Array<"TRANSFERENCIA_CBU" | "MERCADO_PAGO">;
  instagram: string | null;
  tiktok: string | null;
  estado: "ACTIVO" | "AGOTADO";
  creadorId: string;
  creadorRol: "ORGANIZADOR" | "ADMIN";
}

function isoDaysFromNow(days: number, hour = 21): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const eventosSeed: SeedEvento[] = [
  {
    titulo: "Folk You Mondays",
    descripcion:
      "Noche de folk y acustico con artistas independientes en un bar con historia.",
    fechaEvento: isoDaysFromNow(3, 20),
    locacion: "La Dama de Bollini",
    direccion: "Pasaje Bollini 2281",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 0,
    cantidadEntradas: 220,
    entradasVendidas: 0,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=700&h=1200&fit=crop",
    mediosPago: ["TRANSFERENCIA_CBU"],
    instagram: "@ladamaproducciones",
    tiktok: null,
    estado: "ACTIVO",
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    titulo: "Carpe Diem Decompression",
    descripcion:
      "Festival al aire libre con musica electronica, arte y experiencias inmersivas.",
    fechaEvento: isoDaysFromNow(5, 16),
    locacion: "El Vivero de Carlos Keen",
    direccion: "Ruta Provincial 7 km 95",
    provincia: "Buenos Aires",
    localidad: "Lujan",
    precio: 65000,
    cantidadEntradas: 500,
    entradasVendidas: 138,
    categoria: "Fiestas",
    imagenUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO", "TRANSFERENCIA_CBU"],
    instagram: "https://www.instagram.com/carpediemeventos",
    tiktok: "@carpediem",
    estado: "ACTIVO",
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    titulo: "After Mar Vinocio",
    descripcion:
      "Noche de vinos, tapas y musica en vivo frente al mar en un espacio unico.",
    fechaEvento: isoDaysFromNow(8, 21),
    locacion: "Bai Bai",
    direccion: "Calle Alvear 321",
    provincia: "Buenos Aires",
    localidad: "Mar del Plata",
    precio: 35000,
    cantidadEntradas: 180,
    entradasVendidas: 49,
    categoria: "Recreacion",
    imagenUrl:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: "@baibai",
    tiktok: null,
    estado: "ACTIVO",
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    titulo: "Mochi Acustico",
    descripcion:
      "Show acustico intimo de Mochi en el Centro Cultural Keuken Aonikenk.",
    fechaEvento: isoDaysFromNow(10, 22),
    locacion: "Centro Cultural Keuken Aonikenk",
    direccion: "Av. Belgrano 1440",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 30000,
    cantidadEntradas: 240,
    entradasVendidas: 74,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: "@mochimusic",
    tiktok: "@mochi",
    estado: "ACTIVO",
    creadorId: "22222222-2222-4222-8222-222222222222",
    creadorRol: "ORGANIZADOR",
  },
  {
    titulo: "Ezequiel Valdez Cuarteto + Hugo Fattoruso",
    descripcion:
      "Jazz fusion en vivo con Ezequiel Valdez Cuarteto y el legendario Hugo Fattoruso.",
    fechaEvento: isoDaysFromNow(13, 23),
    locacion: "Nene Bar",
    direccion: "Moreno 120",
    provincia: "Rio Negro",
    localidad: "Bariloche",
    precio: 45000,
    cantidadEntradas: 250,
    entradasVendidas: 250,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: null,
    tiktok: null,
    estado: "AGOTADO",
    creadorId: "33333333-3333-4333-8333-333333333333",
    creadorRol: "ADMIN",
  },
  {
    titulo: "Milonga del Angel",
    descripcion:
      "Milonga tradicional con orquesta tipica en vivo y clase de tango para principiantes.",
    fechaEvento: isoDaysFromNow(15, 22),
    locacion: "Salon Canning",
    direccion: "Av. Scalabrini Ortiz 1331",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 15000,
    cantidadEntradas: 180,
    entradasVendidas: 27,
    categoria: "Danza",
    imagenUrl:
      "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO", "TRANSFERENCIA_CBU"],
    instagram: "@milongadelangel",
    tiktok: null,
    estado: "ACTIVO",
    creadorId: "33333333-3333-4333-8333-333333333333",
    creadorRol: "ADMIN",
  },
];

async function main(): Promise<void> {
  try {
    await query("BEGIN");

    const categoriasSeed = Array.from(
      new Set(eventosSeed.map((evento) => evento.categoria.trim())),
    );

    for (const categoria of categoriasSeed) {
      await query(
        `INSERT INTO categorias (nombre)
         VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [categoria],
      );
    }

    await query("DELETE FROM eventos");

    for (const evento of eventosSeed) {
      await query(
        `INSERT INTO eventos (
          titulo,
          descripcion,
          fecha_evento,
          locacion,
          direccion,
          provincia,
          localidad,
          precio,
          cantidad_entradas,
          entradas_vendidas,
          categoria,
          imagen_url,
          flyer_url,
          medios_pago,
          instagram,
          tiktok,
          estado,
          creador_id,
          creador_rol,
          idempotency_key
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        )`,
        [
          evento.titulo,
          evento.descripcion,
          evento.fechaEvento,
          evento.locacion,
          evento.direccion,
          evento.provincia,
          evento.localidad,
          evento.precio,
          evento.cantidadEntradas,
          evento.entradasVendidas,
          evento.categoria,
          evento.imagenUrl,
          evento.flyerUrl,
          evento.mediosPago,
          evento.instagram,
          evento.tiktok,
          evento.estado,
          evento.creadorId,
          evento.creadorRol,
          null,
        ],
      );
    }

    await query("COMMIT");
    console.log(`[seed] Seed completado con ${eventosSeed.length} eventos`);
  } catch (err) {
    await query("ROLLBACK");
    console.error("[seed] Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
