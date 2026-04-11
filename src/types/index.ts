export type EstadoEvento = "ACTIVO" | "AGOTADO" | "CANCELADO";
export type MedioPago = "TRANSFERENCIA_CBU" | "MERCADO_PAGO";
export type RolUsuario = "USUARIO" | "ORGANIZADOR" | "ADMIN";
export type CreadorRol = "ORGANIZADOR" | "ADMIN";
export type EstadoCompra = "PENDIENTE" | "PAGADO" | "CANCELADO";
export type EstadoEntrada = "DISPONIBLE" | "USADA";
export type EstadoMercadoPagoConexion =
  | "NO_CONECTADA"
  | "CONECTADA"
  | "REQUIERE_RECONEXION"
  | "DESCONECTADA";

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string;
  fecha_evento: string;
  locacion: string;
  direccion: string;
  provincia: string;
  localidad: string;
  precio: number;
  cantidad_entradas: number;
  entradas_vendidas: number;
  categoria: string;
  imagen_url: string;
  flyer_url: string | null;
  medios_pago: MedioPago[];
  instagram: string | null;
  tiktok: string | null;
  estado: EstadoEvento;
  visible_en_app: boolean;
  creador_id: string;
  creador_rol: CreadorRol;
  creado_por_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEventoDTO {
  titulo: string;
  descripcion: string;
  fecha_evento: string;
  locacion: string;
  direccion: string;
  provincia: string;
  localidad: string;
  precio: number;
  cantidad_entradas: number;
  categoria: string;
  medios_pago: MedioPago[];
  instagram?: string;
  tiktok?: string;
  idempotency_key?: string;
  // Solo es respetado cuando el caller tiene rol ADMIN. Permite que el admin
  // de alta un evento a nombre de un organizador existente (caso de onboarding
  // asistido). Si el caller no es ADMIN, el backend lo ignora silenciosamente.
  organizador_id?: string;
}

export interface UpdateEventoDTO {
  titulo?: string;
  descripcion?: string;
  fecha_evento?: string;
  locacion?: string;
  direccion?: string;
  provincia?: string;
  localidad?: string;
  precio?: number;
  cantidad_entradas?: number;
  categoria?: string;
  medios_pago?: MedioPago[];
  instagram?: string;
  tiktok?: string;
  visible_en_app?: boolean;
  remove_flyer?: boolean;
}

export interface AuthUser {
  id: string;
  role: RolUsuario;
}

export interface UsuarioPublico {
  id: string;
  nombreCompleto: string;
  email: string;
  rol: RolUsuario;
}

export interface UsuarioAdmin extends UsuarioPublico {
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmado: boolean;
}

export interface AuthResponse {
  token: string | null;
  user: UsuarioPublico;
  requiresEmailVerification?: boolean;
}

export interface ValidationDetail {
  campo: string;
  mensaje: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListEventosQuery {
  estado?: string;
  categoria?: string;
  provincia?: string;
  localidad?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoriaDTO {
  nombre: string;
}

export interface UpdateCategoriaDTO {
  nombre: string;
}

export interface CarruselEvento {
  evento_id: string;
}

export interface UpdateCarruselDTO {
  eventIds: string[];
}

export interface CompraResumen {
  id: string;
  user_id: string;
  evento_id: string;
  evento_titulo: string;
  fecha_evento: string;
  ubicacion_evento: string;
  nombre_organizador: string;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
  metodo_pago: MedioPago;
  estado: EstadoCompra;
  fecha_compra: string;
}

export interface EntradaResumen {
  id: string;
  numero_entrada: number;
  qr_token?: string;
  estado: EstadoEntrada;
  fecha_uso?: string;
}

export interface CompraDetalle extends CompraResumen {
  entradas: EntradaResumen[];
}

export interface CompraGestionResumen extends CompraResumen {
  comprador_nombre: string;
  comprador_apellido: string;
  comprador_email: string;
  comprador_documento: string;
  comprador_tipo_documento: string;
  entradas_usadas: number;
}

export interface PerfilComprador {
  nombre: string;
  apellido: string;
  email: string;
  documento: string;
  tipoDocumento: string;
}

export interface EntradaDetalle {
  entrada_id: string;
  compra_id: string;
  numero_entrada: number;
  qr_token: string;
  qr_data: string;
  qr_image_data_url: string;
  qr_image_url?: string;
  qr_pdf_url?: string;
  estado: EstadoEntrada;
  fecha_uso?: string;
  evento: {
    id: string;
    titulo: string;
    fecha_evento: string;
    locacion: string;
    direccion: string;
    organizador: string;
  };
  comprador: {
    id: string;
    nombre_completo: string;
    email: string;
  };
}

export interface MercadoPagoConnectionStatus {
  status: EstadoMercadoPagoConexion;
  mpEmail: string | null;
  mpUserId: string | null;
  connectedAt: string | null;
  publicKey: string | null;
  mode: "oauth" | "platform_test" | "not_configured";
}

export interface MercadoPagoPreferenceBuyerInput {
  nombre: string;
  apellido: string;
  email: string;
  documento: string;
  tipoDocumento?: string;
}

export interface MercadoPagoPreferenceInput {
  eventoId: string;
  cantidad: number;
  buyer: MercadoPagoPreferenceBuyerInput;
}

export interface MercadoPagoPreferenceResult {
  compraId: string;
  preferenceId: string;
  publicKey: string;
  checkoutUrl: string;
  precioBase: number;
  costoServicio: number;
  total: number;
}

export interface PublicCheckoutStatus {
  compraId: string;
  estado: EstadoCompra;
  mpStatus: string | null;
  eventoTitulo: string;
  cantidad: number;
  total: number;
  compradorEmail: string;
  createdAt: string;
}
