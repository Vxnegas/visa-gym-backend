-- =====================================================
-- VISA GYM - Agrega roles a los administradores
-- =====================================================
-- rol = 'admin'  -> control total (crear/editar/eliminar miembros, pagos,
--                   notificaciones, eventos, y puede crear otros usuarios).
-- rol = 'dueno'  -> solo lectura: puede ver miembros, pagos, reportes y
--                   notificaciones, pero no puede crear/editar/eliminar nada.

ALTER TABLE administradores
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_administradores_rol'
  ) THEN
    ALTER TABLE administradores
      ADD CONSTRAINT chk_administradores_rol CHECK (rol IN ('admin', 'dueno'));
  END IF;
END $$;
