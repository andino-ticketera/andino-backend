import pool from "./pool.js";

type MedioPago = "TRANSFERENCIA_CBU" | "MERCADO_PAGO";

interface SeedEvento {
  key: string;
  titulo: string;
  descripcion: string;
  fechaEvento: string;
  locacion: string;
  direccion: string;
  provincia: string;
  localidad: string;
  precio: number;
  cantidadEntradas: number;
  categoria: string;
  imagenUrl: string;
  flyerUrl: string | null;
  mediosPago: MedioPago[];
  instagram: string | null;
  tiktok: string | null;
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
    key: "folk-you-mondays",
    titulo: "Folk You Mondays",
    descripcion:
      "Noche de folk y acústico con artistas independientes en un bar con historia.",
    fechaEvento: isoDaysFromNow(3, 20),
    locacion: "La Dama de Bollini",
    direccion: "Pasaje Bollini 2281",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 0,
    cantidadEntradas: 40,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=700&h=1200&fit=crop",
    mediosPago: ["TRANSFERENCIA_CBU"],
    instagram: "@ladamaproducciones",
    tiktok: null,
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    key: "carpe-diem-decompression",
    titulo: "Carpe Diem Decompression",
    descripcion:
      "Festival al aire libre con musica electronica, arte y experiencias inmersivas.",
    fechaEvento: isoDaysFromNow(5, 16),
    locacion: "El Vivero de Carlos Keen",
    direccion: "Ruta Provincial 7 km 95",
    provincia: "Buenos Aires",
    localidad: "Lujan",
    precio: 65000,
    cantidadEntradas: 80,
    categoria: "Fiestas",
    imagenUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO", "TRANSFERENCIA_CBU"],
    instagram: "https://www.instagram.com/carpediemeventos",
    tiktok: "@carpediem",
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    key: "after-mar-vinocio",
    titulo: "After Mar Vinocio",
    descripcion:
      "Noche de vinos, tapas y musica en vivo frente al mar en un espacio unico.",
    fechaEvento: isoDaysFromNow(8, 21),
    locacion: "Bai Bai",
    direccion: "Calle Alvear 321",
    provincia: "Buenos Aires",
    localidad: "Mar del Plata",
    precio: 35000,
    cantidadEntradas: 50,
    categoria: "Recreacion",
    imagenUrl:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: "@baibai",
    tiktok: null,
    creadorId: "11111111-1111-4111-8111-111111111111",
    creadorRol: "ORGANIZADOR",
  },
  {
    key: "mochi-acustico",
    titulo: "Mochi Acustico",
    descripcion:
      "Show acústico íntimo de Mochi en el Centro Cultural Keuken Aonikenk.",
    fechaEvento: isoDaysFromNow(10, 22),
    locacion: "Centro Cultural Keuken Aonikenk",
    direccion: "Av. Belgrano 1440",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 30000,
    cantidadEntradas: 60,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: "@mochimusic",
    tiktok: "@mochi",
    creadorId: "22222222-2222-4222-8222-222222222222",
    creadorRol: "ORGANIZADOR",
  },
  {
    key: "valdez-fattoruso",
    titulo: "Ezequiel Valdez Cuarteto + Hugo Fattoruso",
    descripcion:
      "Jazz fusion en vivo con Ezequiel Valdez Cuarteto y el legendario Hugo Fattoruso.",
    fechaEvento: isoDaysFromNow(13, 23),
    locacion: "Nene Bar",
    direccion: "Moreno 120",
    provincia: "Rio Negro",
    localidad: "Bariloche",
    precio: 45000,
    cantidadEntradas: 12,
    categoria: "Musica en Vivo",
    imagenUrl:
      "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO"],
    instagram: null,
    tiktok: null,
    creadorId: "33333333-3333-4333-8333-333333333333",
    creadorRol: "ADMIN",
  },
  {
    key: "milonga-del-angel",
    titulo: "Milonga del Angel",
    descripcion:
      "Milonga tradicional con orquesta típica en vivo y clase de tango para principiantes.",
    fechaEvento: isoDaysFromNow(15, 22),
    locacion: "Salon Canning",
    direccion: "Av. Scalabrini Ortiz 1331",
    provincia: "Buenos Aires",
    localidad: "CABA",
    precio: 15000,
    cantidadEntradas: 70,
    categoria: "Danza",
    imagenUrl:
      "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=1200&h=700&fit=crop",
    flyerUrl:
      "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=700&h=1200&fit=crop",
    mediosPago: ["MERCADO_PAGO", "TRANSFERENCIA_CBU"],
    instagram: "@milongadelangel",
    tiktok: null,
    creadorId: "33333333-3333-4333-8333-333333333333",
    creadorRol: "ADMIN",
  },
];

async function main(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const categoriasSeed = Array.from(
      new Set(eventosSeed.map((evento) => evento.categoria.trim())),
    );

    await client.query("DELETE FROM carrusel_eventos");
    await client.query("DELETE FROM entradas");
    await client.query("DELETE FROM compras");
    await client.query("DELETE FROM eventos");

    for (const categoria of categoriasSeed) {
      await client.query(
        `INSERT INTO categorias (nombre)
         VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [categoria],
      );
    }

    const eventoIdsByKey = new Map<string, string>();

    for (const evento of eventosSeed) {
      const result = await client.query<{ id: string }>(
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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15,'ACTIVO',$16,$17,NULL
        )
        RETURNING id`,
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
          evento.categoria,
          evento.imagenUrl,
          evento.flyerUrl,
          evento.mediosPago,
          evento.instagram,
          evento.tiktok,
          evento.creadorId,
          evento.creadorRol,
        ],
      );

      eventoIdsByKey.set(evento.key, result.rows[0].id);
    }

    const carruselKeys = [
      "folk-you-mondays",
      "carpe-diem-decompression",
      "mochi-acustico",
      "milonga-del-angel",
    ];

    for (const carruselKey of carruselKeys) {
      const eventoId = eventoIdsByKey.get(carruselKey);
      if (!eventoId) {
        throw new Error(`Evento no encontrado para carrusel: ${carruselKey}`);
      }

      await client.query(
        `INSERT INTO carrusel_eventos (evento_id) VALUES ($1)`,
        [eventoId],
      );
    }

    await client.query(
      `UPDATE eventos e
       SET entradas_vendidas = COALESCE(vendidas.total, 0),
           estado = CASE
             WHEN COALESCE(vendidas.total, 0) >= e.cantidad_entradas THEN 'AGOTADO'
             ELSE 'ACTIVO'
           END
       FROM (
         SELECT evento_id, SUM(cantidad)::int AS total
         FROM compras
         WHERE estado = 'PAGADO'
         GROUP BY evento_id
       ) vendidas
       WHERE e.id = vendidas.evento_id`,
    );

    await client.query(
      `UPDATE eventos
       SET entradas_vendidas = 0,
           estado = 'ACTIVO'
       WHERE id NOT IN (
         SELECT DISTINCT evento_id
         FROM compras
         WHERE estado = 'PAGADO'
       )`,
    );

    await client.query("COMMIT");
    console.log(
      `[seed] Seed completado con ${eventosSeed.length} eventos y ${carruselKeys.length} eventos en carrusel`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed] Error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
