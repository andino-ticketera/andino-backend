import pool from "./pool.js";

type MedioPago = "TRANSFERENCIA_CBU" | "MERCADO_PAGO";
type EstadoCompra = "PENDIENTE" | "PAGADO" | "CANCELADO";
type EstadoEntrada = "DISPONIBLE" | "USADA";

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

interface SeedCompra {
  id: string;
  userId: string | null;
  eventoKey: string;
  cantidad: number;
  metodoPago: MedioPago;
  estado: EstadoCompra;
  compradorNombre: string;
  compradorApellido: string;
  compradorEmail: string;
  compradorDocumento: string;
  compradorTipoDocumento: string;
  mpPreferenceId: string | null;
  mpPaymentId: string | null;
  mpMerchantOrderId: string | null;
  mpStatus: string | null;
}

interface SeedEntrada {
  id: string;
  compraId: string;
  eventoKey: string;
  numeroEntrada: number;
  qrToken: string;
  estado: EstadoEntrada;
  usadaAt: string | null;
}

function isoDaysFromNow(days: number, hour = 21): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildMpAmounts(
  precioUnitario: number,
  cantidad: number,
): {
  precioBase: number;
  costoServicio: number;
  precioTotal: number;
} {
  const precioBase = roundCurrency(precioUnitario * cantidad);
  const costoServicio = roundCurrency(precioBase * 0.05);
  return {
    precioBase,
    costoServicio,
    precioTotal: roundCurrency(precioBase + costoServicio),
  };
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

const comprasSeed: SeedCompra[] = [
  {
    id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    userId: "44444444-4444-4444-8444-444444444444",
    eventoKey: "folk-you-mondays",
    cantidad: 2,
    metodoPago: "TRANSFERENCIA_CBU",
    estado: "PAGADO",
    compradorNombre: "Lucia",
    compradorApellido: "Fernandez",
    compradorEmail: "lucia@example.com",
    compradorDocumento: "30111222",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: null,
    mpPaymentId: null,
    mpMerchantOrderId: null,
    mpStatus: null,
  },
  {
    id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    userId: "55555555-5555-4555-8555-555555555555",
    eventoKey: "carpe-diem-decompression",
    cantidad: 4,
    metodoPago: "MERCADO_PAGO",
    estado: "PAGADO",
    compradorNombre: "Martin",
    compradorApellido: "Suarez",
    compradorEmail: "martin@example.com",
    compradorDocumento: "28444777",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: "pref-seed-001",
    mpPaymentId: "pay-seed-001",
    mpMerchantOrderId: "order-seed-001",
    mpStatus: "approved",
  },
  {
    id: "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    userId: null,
    eventoKey: "carpe-diem-decompression",
    cantidad: 3,
    metodoPago: "MERCADO_PAGO",
    estado: "PENDIENTE",
    compradorNombre: "Agustin",
    compradorApellido: "Rios",
    compradorEmail: "agustin@example.com",
    compradorDocumento: "32999888",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: "pref-seed-002",
    mpPaymentId: null,
    mpMerchantOrderId: null,
    mpStatus: "pending",
  },
  {
    id: "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    userId: null,
    eventoKey: "after-mar-vinocio",
    cantidad: 2,
    metodoPago: "MERCADO_PAGO",
    estado: "CANCELADO",
    compradorNombre: "Sofia",
    compradorApellido: "Diaz",
    compradorEmail: "sofia@example.com",
    compradorDocumento: "30111999",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: "pref-seed-003",
    mpPaymentId: "pay-seed-003",
    mpMerchantOrderId: "order-seed-003",
    mpStatus: "rejected",
  },
  {
    id: "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    userId: "66666666-6666-4666-8666-666666666666",
    eventoKey: "mochi-acustico",
    cantidad: 2,
    metodoPago: "MERCADO_PAGO",
    estado: "PAGADO",
    compradorNombre: "Bruno",
    compradorApellido: "Gomez",
    compradorEmail: "bruno@example.com",
    compradorDocumento: "31555444",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: "pref-seed-004",
    mpPaymentId: "pay-seed-004",
    mpMerchantOrderId: "order-seed-004",
    mpStatus: "approved",
  },
  {
    id: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    userId: "77777777-7777-4777-8777-777777777777",
    eventoKey: "valdez-fattoruso",
    cantidad: 12,
    metodoPago: "MERCADO_PAGO",
    estado: "PAGADO",
    compradorNombre: "Valentina",
    compradorApellido: "Lopez",
    compradorEmail: "valentina@example.com",
    compradorDocumento: "29888777",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: "pref-seed-005",
    mpPaymentId: "pay-seed-005",
    mpMerchantOrderId: "order-seed-005",
    mpStatus: "approved",
  },
  {
    id: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    userId: "88888888-8888-4888-8888-888888888888",
    eventoKey: "milonga-del-angel",
    cantidad: 5,
    metodoPago: "TRANSFERENCIA_CBU",
    estado: "PAGADO",
    compradorNombre: "Camila",
    compradorApellido: "Martinez",
    compradorEmail: "camila@example.com",
    compradorDocumento: "27666555",
    compradorTipoDocumento: "DNI",
    mpPreferenceId: null,
    mpPaymentId: null,
    mpMerchantOrderId: null,
    mpStatus: null,
  },
];

const entradasSeed: SeedEntrada[] = [
  {
    id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    compraId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    eventoKey: "folk-you-mondays",
    numeroEntrada: 1,
    qrToken: "ccccccc1-cccc-4ccc-8ccc-ccccccccccc1",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    compraId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    eventoKey: "folk-you-mondays",
    numeroEntrada: 2,
    qrToken: "ccccccc2-cccc-4ccc-8ccc-ccccccccccc2",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    compraId: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    eventoKey: "carpe-diem-decompression",
    numeroEntrada: 1,
    qrToken: "ccccccc3-cccc-4ccc-8ccc-ccccccccccc3",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
    compraId: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    eventoKey: "carpe-diem-decompression",
    numeroEntrada: 2,
    qrToken: "ccccccc4-cccc-4ccc-8ccc-ccccccccccc4",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb5-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
    compraId: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    eventoKey: "carpe-diem-decompression",
    numeroEntrada: 3,
    qrToken: "ccccccc5-cccc-4ccc-8ccc-ccccccccccc5",
    estado: "USADA",
    usadaAt: isoDaysFromNow(5, 23),
  },
  {
    id: "bbbbbbb6-bbbb-4bbb-8bbb-bbbbbbbbbbb6",
    compraId: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    eventoKey: "carpe-diem-decompression",
    numeroEntrada: 4,
    qrToken: "ccccccc6-cccc-4ccc-8ccc-ccccccccccc6",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb7-bbbb-4bbb-8bbb-bbbbbbbbbbb7",
    compraId: "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    eventoKey: "mochi-acustico",
    numeroEntrada: 1,
    qrToken: "ccccccc7-cccc-4ccc-8ccc-ccccccccccc7",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb8-bbbb-4bbb-8bbb-bbbbbbbbbbb8",
    compraId: "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    eventoKey: "mochi-acustico",
    numeroEntrada: 2,
    qrToken: "ccccccc8-cccc-4ccc-8ccc-ccccccccccc8",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbb9-bbbb-4bbb-8bbb-bbbbbbbbbbb9",
    compraId: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    eventoKey: "milonga-del-angel",
    numeroEntrada: 1,
    qrToken: "ccccccc9-cccc-4ccc-8ccc-ccccccccccc9",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbba-bbbb-4bbb-8bbb-bbbbbbbbbbba",
    compraId: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    eventoKey: "milonga-del-angel",
    numeroEntrada: 2,
    qrToken: "ccccccca-cccc-4ccc-8ccc-ccccccccccca",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
    compraId: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    eventoKey: "milonga-del-angel",
    numeroEntrada: 3,
    qrToken: "cccccccb-cccc-4ccc-8ccc-cccccccccccb",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbbd-bbbb-4bbb-8bbb-bbbbbbbbbbbd",
    compraId: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    eventoKey: "milonga-del-angel",
    numeroEntrada: 4,
    qrToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbbe-bbbb-4bbb-8bbb-bbbbbbbbbbbe",
    compraId: "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    eventoKey: "milonga-del-angel",
    numeroEntrada: 5,
    qrToken: "cccccccd-cccc-4ccc-8ccc-cccccccccccd",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbbf-bbbb-4bbb-8bbb-bbbbbbbbbbbf",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 1,
    qrToken: "ccccccce-cccc-4ccc-8ccc-ccccccccccce",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc0-bbbb-4bbb-8bbb-bbbbbbbbbbc0",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 2,
    qrToken: "cccccccf-cccc-4ccc-8ccc-cccccccccccf",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc1-bbbb-4bbb-8bbb-bbbbbbbbbbc1",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 3,
    qrToken: "ccccccd0-cccc-4ccc-8ccc-ccccccccccd0",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc2-bbbb-4bbb-8bbb-bbbbbbbbbbc2",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 4,
    qrToken: "ccccccd1-cccc-4ccc-8ccc-ccccccccccd1",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc3-bbbb-4bbb-8bbb-bbbbbbbbbbc3",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 5,
    qrToken: "ccccccd2-cccc-4ccc-8ccc-ccccccccccd2",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc4-bbbb-4bbb-8bbb-bbbbbbbbbbc4",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 6,
    qrToken: "ccccccd3-cccc-4ccc-8ccc-ccccccccccd3",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc5-bbbb-4bbb-8bbb-bbbbbbbbbbc5",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 7,
    qrToken: "ccccccd4-cccc-4ccc-8ccc-ccccccccccd4",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc6-bbbb-4bbb-8bbb-bbbbbbbbbbc6",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 8,
    qrToken: "ccccccd5-cccc-4ccc-8ccc-ccccccccccd5",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc7-bbbb-4bbb-8bbb-bbbbbbbbbbc7",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 9,
    qrToken: "ccccccd6-cccc-4ccc-8ccc-ccccccccccd6",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc8-bbbb-4bbb-8bbb-bbbbbbbbbbc8",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 10,
    qrToken: "ccccccd7-cccc-4ccc-8ccc-ccccccccccd7",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbc9-bbbb-4bbb-8bbb-bbbbbbbbbbc9",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 11,
    qrToken: "ccccccd8-cccc-4ccc-8ccc-ccccccccccd8",
    estado: "DISPONIBLE",
    usadaAt: null,
  },
  {
    id: "bbbbbbca-bbbb-4bbb-8bbb-bbbbbbbbbbca",
    compraId: "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    eventoKey: "valdez-fattoruso",
    numeroEntrada: 12,
    qrToken: "ccccccd9-cccc-4ccc-8ccc-ccccccccccd9",
    estado: "DISPONIBLE",
    usadaAt: null,
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

    for (const compra of comprasSeed) {
      const evento = eventosSeed.find((item) => item.key === compra.eventoKey);
      const eventoId = eventoIdsByKey.get(compra.eventoKey);

      if (!evento || !eventoId) {
        throw new Error(
          `Evento no encontrado para compra: ${compra.eventoKey}`,
        );
      }

      const mpAmounts = buildMpAmounts(evento.precio, compra.cantidad);
      const precioTotal =
        compra.metodoPago === "MERCADO_PAGO"
          ? mpAmounts.precioTotal
          : roundCurrency(evento.precio * compra.cantidad);

      await client.query(
        `INSERT INTO compras (
          id,
          user_id,
          evento_id,
          cantidad,
          precio_unitario,
          precio_total,
          metodo_pago,
          estado,
          comprador_nombre,
          comprador_apellido,
          comprador_email,
          comprador_documento,
          comprador_tipo_documento,
          mp_preference_id,
          mp_payment_id,
          mp_merchant_order_id,
          mp_status,
          precio_base,
          costo_servicio,
          fee_porcentaje,
          organizador_mp_user_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
        )`,
        [
          compra.id,
          compra.userId,
          eventoId,
          compra.cantidad,
          evento.precio,
          precioTotal,
          compra.metodoPago,
          compra.estado,
          compra.compradorNombre,
          compra.compradorApellido,
          compra.compradorEmail,
          compra.compradorDocumento,
          compra.compradorTipoDocumento,
          compra.mpPreferenceId,
          compra.mpPaymentId,
          compra.mpMerchantOrderId,
          compra.mpStatus,
          compra.metodoPago === "MERCADO_PAGO" ? mpAmounts.precioBase : null,
          compra.metodoPago === "MERCADO_PAGO" ? mpAmounts.costoServicio : null,
          compra.metodoPago === "MERCADO_PAGO" ? 5 : null,
          null,
        ],
      );
    }

    for (const entrada of entradasSeed) {
      const eventoId = eventoIdsByKey.get(entrada.eventoKey);
      if (!eventoId) {
        throw new Error(
          `Evento no encontrado para entrada: ${entrada.eventoKey}`,
        );
      }

      await client.query(
        `INSERT INTO entradas (
          id,
          compra_id,
          evento_id,
          numero_entrada,
          qr_token,
          estado,
          usada_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          entrada.id,
          entrada.compraId,
          eventoId,
          entrada.numeroEntrada,
          entrada.qrToken,
          entrada.estado,
          entrada.usadaAt,
        ],
      );
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
      `[seed] Seed completado con ${eventosSeed.length} eventos, ${comprasSeed.length} compras, ${entradasSeed.length} entradas y ${carruselKeys.length} eventos en carrusel`,
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
