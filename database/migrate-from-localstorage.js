/**
 * Migra los datos del sistema anterior (localStorage del navegador) a PostgreSQL.
 *
 * CÓMO OBTENER EL JSON A MIGRAR:
 * 1. Abre el panel actual en el navegador (el que usa localStorage).
 * 2. Abre la consola (F12) y ejecuta:
 *      copy(localStorage.getItem('ironfit_gym_state_v1'))
 *    (ajusta el nombre de la clave STORAGE_KEY si es distinto en tu index.html)
 * 3. Pega el resultado en un archivo backend/database/localstorage-export.json
 * 4. Ejecuta:  npm run migrate:localstorage
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const EXPORT_PATH = path.join(__dirname, 'localstorage-export.json');

function planToDb(plan) {
  const map = { Mensual: 'mensual', Trimestral: 'trimestral', Anual: 'anual', 'Día por día': 'dia' };
  return map[plan] || (plan || 'mensual').toLowerCase();
}

function estadoToDb(status) {
  const map = { activo: 'activo', pendiente: 'activo', vencido: 'vencido' };
  return map[status] || 'activo';
}

async function run() {
  if (!fs.existsSync(EXPORT_PATH)) {
    console.error(`No se encontró ${EXPORT_PATH}.`);
    console.error('Exporta primero el localStorage siguiendo las instrucciones en este archivo.');
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
  const idMap = {}; // id numérico antiguo -> uuid nuevo

  console.log(`Migrando ${state.members?.length || 0} miembros...`);
  for (const m of state.members || []) {
    const { rows } = await db.query(
      `INSERT INTO miembros
        (nombre, email, fecha_nacimiento, plan, estado, fecha_inicio_suscripcion,
         fecha_vencimiento_suscripcion, recibir_notificaciones, recibir_promociones, recibir_eventos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [
        m.name, m.email, m.birthDate || null, planToDb(m.plan), estadoToDb(m.status),
        m.subStart || null, m.subEnd || null,
        m.notifGeneral !== false, m.notifPromos !== false, m.notifEvents !== false,
      ]
    );
    idMap[m.id] = rows[0].id;
  }

  console.log(`Migrando ${state.checkins?.length || 0} check-ins...`);
  for (const c of state.checkins || []) {
    const miembroId = idMap[c.memberId];
    if (!miembroId) continue;
    await db.query(
      `INSERT INTO checkins (miembro_id, fecha) VALUES ($1, COALESCE($2, CURRENT_DATE))`,
      [miembroId, c.date || null]
    );
  }

  console.log(`Migrando historial de notificaciones (${state.notifications?.length || 0})...`);
  for (const n of state.notifications || []) {
    const miembroId = idMap[n.memberId];
    await db.query(
      `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado)
       VALUES ($1, $2, $3, $4, $5)`,
      [miembroId || null, n.type || 'manual', n.subject || '(sin asunto)', n.message || '', n.status || 'enviado']
    );
  }

  console.log(`Migrando eventos (${state.events?.length || 0})...`);
  for (const e of state.events || []) {
    await db.query(
      `INSERT INTO eventos (nombre, descripcion, fecha_evento, hora_evento, publico_objetivo)
       VALUES ($1,$2,$3,$4,$5)`,
      [e.name, e.description || null, e.date, e.time || null, e.audience || 'todos']
    );
  }

  console.log('Migración completada con éxito.');
  console.log('IMPORTANTE: crea ahora tu primer administrador con POST /api/auth/register');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error durante la migración:', err);
  process.exit(1);
});
