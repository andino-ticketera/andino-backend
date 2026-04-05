import { query } from "./pool.js";

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usuarios'
  ) THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_usuarios ON usuarios;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS set_updated_at_usuarios();
DROP INDEX IF EXISTS ux_usuarios_email_lower;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(50) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_nombre_lower
  ON categorias ((LOWER(TRIM(nombre))));

CREATE OR REPLACE FUNCTION set_updated_at_categorias()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_categorias ON categorias;

CREATE TRIGGER trg_set_updated_at_categorias
BEFORE UPDATE ON categorias
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_categorias();

CREATE TABLE IF NOT EXISTS eventos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          VARCHAR(120) NOT NULL,
  descripcion     VARCHAR(2000) NOT NULL,
  fecha_evento    TIMESTAMPTZ NOT NULL,
  locacion        VARCHAR(200) NOT NULL,
  direccion       VARCHAR(300) NOT NULL,
  provincia       VARCHAR(100) NOT NULL,
  localidad       VARCHAR(100) NOT NULL,
  precio          NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  cantidad_entradas INTEGER NOT NULL CHECK (cantidad_entradas BETWEEN 1 AND 100000),
  entradas_vendidas INTEGER NOT NULL DEFAULT 0 CHECK (entradas_vendidas >= 0),
  categoria       VARCHAR(50) NOT NULL,
  imagen_url      TEXT NOT NULL,
  flyer_url       TEXT,
  medios_pago     TEXT[] NOT NULL,
  instagram       TEXT,
  tiktok          TEXT,
  estado          TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'AGOTADO', 'CANCELADO')),
  creador_id      UUID NOT NULL,
  creador_rol     TEXT NOT NULL CHECK (creador_rol IN ('ORGANIZADOR', 'ADMIN')),
  idempotency_key VARCHAR(128),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entradas_vendidas <= cantidad_entradas)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_eventos_creador_idempotency
  ON eventos (creador_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_eventos_estado_fecha
  ON eventos (estado, fecha_evento ASC);

CREATE TABLE IF NOT EXISTS compras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  evento_id       UUID NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 1000),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  precio_total    NUMERIC(12,2) NOT NULL CHECK (precio_total >= 0),
  metodo_pago     TEXT NOT NULL CHECK (metodo_pago IN ('TRANSFERENCIA_CBU', 'MERCADO_PAGO')),
  estado          TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADO', 'CANCELADO')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_compras_evento
    FOREIGN KEY (evento_id)
    REFERENCES eventos(id)
    ON DELETE RESTRICT,
  CONSTRAINT ck_compras_total_consistente
    CHECK (precio_total >= precio_unitario)
);

ALTER TABLE compras
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS comprador_nombre TEXT,
  ADD COLUMN IF NOT EXISTS comprador_apellido TEXT,
  ADD COLUMN IF NOT EXISTS comprador_email TEXT,
  ADD COLUMN IF NOT EXISTS comprador_documento TEXT,
  ADD COLUMN IF NOT EXISTS comprador_tipo_documento TEXT,
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_merchant_order_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_status TEXT,
  ADD COLUMN IF NOT EXISTS precio_base NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS costo_servicio NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fee_porcentaje NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS organizador_mp_user_id TEXT;

CREATE INDEX IF NOT EXISTS ix_compras_user_created_at
  ON compras (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_compras_evento_estado
  ON compras (evento_id, estado);

CREATE INDEX IF NOT EXISTS ix_compras_estado
  ON compras (estado);

CREATE OR REPLACE FUNCTION set_updated_at_compras()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_compras ON compras;

CREATE TRIGGER trg_set_updated_at_compras
BEFORE UPDATE ON compras
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_compras();

CREATE TABLE IF NOT EXISTS organizador_mercado_pago (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  mp_user_id      TEXT NOT NULL,
  mp_email        TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  public_key      TEXT,
  token_type      TEXT,
  scope           TEXT,
  expires_in      INTEGER,
  status          TEXT NOT NULL DEFAULT 'CONECTADA' CHECK (status IN ('NO_CONECTADA', 'CONECTADA', 'REQUIERE_RECONEXION', 'DESCONECTADA')),
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_organizador_mercado_pago_user UNIQUE (user_id),
  CONSTRAINT uq_organizador_mercado_pago_mp_user UNIQUE (mp_user_id)
);

CREATE OR REPLACE FUNCTION set_updated_at_organizador_mercado_pago()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_organizador_mercado_pago ON organizador_mercado_pago;

CREATE TRIGGER trg_set_updated_at_organizador_mercado_pago
BEFORE UPDATE ON organizador_mercado_pago
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_organizador_mercado_pago();

CREATE TABLE IF NOT EXISTS entradas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id     UUID NOT NULL,
  evento_id     UUID NOT NULL,
  numero_entrada INTEGER NOT NULL CHECK (numero_entrada >= 1),
  qr_token      UUID NOT NULL DEFAULT gen_random_uuid(),
  estado        TEXT NOT NULL DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE', 'USADA')),
  usada_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_entradas_compra
    FOREIGN KEY (compra_id)
    REFERENCES compras(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_entradas_evento
    FOREIGN KEY (evento_id)
    REFERENCES eventos(id)
    ON DELETE RESTRICT,
  CONSTRAINT uq_entradas_qr_token UNIQUE (qr_token),
  CONSTRAINT uq_entradas_numero_por_compra UNIQUE (compra_id, numero_entrada),
  CONSTRAINT ck_entradas_usada_consistente
    CHECK ((estado = 'USADA' AND usada_at IS NOT NULL) OR (estado = 'DISPONIBLE'))
);

CREATE INDEX IF NOT EXISTS ix_entradas_compra_estado
  ON entradas (compra_id, estado);

CREATE INDEX IF NOT EXISTS ix_entradas_evento_estado
  ON entradas (evento_id, estado);

CREATE INDEX IF NOT EXISTS ix_entradas_estado
  ON entradas (estado);

CREATE OR REPLACE FUNCTION set_updated_at_entradas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_entradas ON entradas;

CREATE TRIGGER trg_set_updated_at_entradas
BEFORE UPDATE ON entradas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_entradas();

CREATE TABLE IF NOT EXISTS carrusel_eventos (
  evento_id   UUID PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE carrusel_eventos
  DROP CONSTRAINT IF EXISTS carrusel_eventos_orden_key;

DROP INDEX IF EXISTS ix_carrusel_eventos_orden;

ALTER TABLE carrusel_eventos
  DROP COLUMN IF EXISTS orden;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_carrusel_eventos_evento'
  ) THEN
    ALTER TABLE carrusel_eventos
      ADD CONSTRAINT fk_carrusel_eventos_evento
      FOREIGN KEY (evento_id)
      REFERENCES eventos(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

INSERT INTO categorias (nombre)
SELECT DISTINCT TRIM(categoria)
FROM eventos
WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_eventos_categoria'
  ) THEN
    ALTER TABLE eventos
      ADD CONSTRAINT fk_eventos_categoria
      FOREIGN KEY (categoria)
      REFERENCES categorias(nombre)
      ON UPDATE CASCADE;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at_eventos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_eventos ON eventos;

CREATE TRIGGER trg_set_updated_at_eventos
BEFORE UPDATE ON eventos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_eventos();
`;

export async function runMigrations(): Promise<void> {
  await query(SCHEMA_SQL);
  console.log("[migrate] Migraciones ejecutadas correctamente");
}
