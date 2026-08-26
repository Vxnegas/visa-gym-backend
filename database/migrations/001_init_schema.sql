-- =====================================================
-- VISA GYM - Esquema inicial de base de datos
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ADMINISTRADORES
CREATE TABLE IF NOT EXISTS administradores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MIEMBROS
CREATE TABLE IF NOT EXISTS miembros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  fecha_nacimiento DATE,
  plan VARCHAR(50) NOT NULL DEFAULT 'basico',
  estado VARCHAR(20) NOT NULL DEFAULT 'activo', -- activo, inactivo, vencido
  fecha_inicio_suscripcion DATE,
  fecha_vencimiento_suscripcion DATE,
  recibir_notificaciones BOOLEAN NOT NULL DEFAULT true,
  recibir_promociones BOOLEAN NOT NULL DEFAULT true,
  recibir_eventos BOOLEAN NOT NULL DEFAULT true,
  ultima_visita TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_miembros_estado ON miembros(estado);
CREATE INDEX IF NOT EXISTS idx_miembros_vencimiento ON miembros(fecha_vencimiento_suscripcion);

-- PAGOS
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  miembro_id UUID NOT NULL REFERENCES miembros(id) ON DELETE CASCADE,
  monto NUMERIC(10,2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'completado', -- completado, pendiente, fallido
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_miembro ON pagos(miembro_id);

-- CHECK-INS
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  miembro_id UUID NOT NULL REFERENCES miembros(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_miembro ON checkins(miembro_id);
CREATE INDEX IF NOT EXISTS idx_checkins_fecha ON checkins(fecha);

-- NOTIFICACIONES
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  miembro_id UUID REFERENCES miembros(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL, -- bienvenida, cumpleanos, vencimiento_7, vencimiento_3, vencimiento_1, vencimiento_hoy, vencida, manual, evento
  asunto VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente, programado, procesando, enviado, error, cancelado
  fecha_programada TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ,
  error_mensaje TEXT,
  clave_deduplicacion VARCHAR(255) UNIQUE, -- ej: bienvenida:{miembro_id}, cumpleanos:{miembro_id}:{anio}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_estado ON notificaciones(estado);
CREATE INDEX IF NOT EXISTS idx_notificaciones_miembro ON notificaciones(miembro_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha_programada ON notificaciones(fecha_programada);

-- EVENTOS
CREATE TABLE IF NOT EXISTS eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  fecha_evento DATE NOT NULL,
  hora_evento TIME,
  publico_objetivo VARCHAR(30) NOT NULL DEFAULT 'todos', -- todos, activos, plan_basico, plan_premium...
  fecha_envio TIMESTAMPTZ,
  enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LOGS DE ENVÍO
CREATE TABLE IF NOT EXISTS logs_de_envio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notificacion_id UUID REFERENCES notificaciones(id) ON DELETE CASCADE,
  destinatario VARCHAR(150) NOT NULL,
  proveedor VARCHAR(50) NOT NULL DEFAULT 'smtp',
  estado VARCHAR(20) NOT NULL, -- exitoso, fallido
  respuesta_proveedor TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_updated ON administradores;
CREATE TRIGGER trg_admin_updated BEFORE UPDATE ON administradores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_miembros_updated ON miembros;
CREATE TRIGGER trg_miembros_updated BEFORE UPDATE ON miembros
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
