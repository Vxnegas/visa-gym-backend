const cron = require('node-cron');
const db = require('../database/db');
const { enviarCorreoNotificacion } = require('../services/emailService');

/**
 * A. Cumpleaños del día — deduplicado por miembro + año.
 */
async function revisarCumpleanos() {
  const anio = new Date().getFullYear();
  const { rows: miembros } = await db.query(`
    SELECT * FROM miembros
    WHERE recibir_notificaciones = true
      AND fecha_nacimiento IS NOT NULL
      AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)
  `);

  for (const m of miembros) {
    const clave = `cumpleanos:${m.id}:${anio}`;
    const { rows } = await db.query(
      `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado, clave_deduplicacion)
       VALUES ($1, 'cumpleanos', $2, $3, 'pendiente', $4)
       ON CONFLICT (clave_deduplicacion) DO NOTHING
       RETURNING *`,
      [m.id, `¡Feliz cumpleaños, ${m.nombre}!`,
        `Todo el equipo de VISA GYM te desea un excelente cumpleaños. ¡Que tengas un gran entrenamiento hoy!`,
        clave]
    );
    if (rows[0]) {
      await enviarCorreoNotificacion(rows[0], m.email).catch((e) => console.error('Error correo cumpleaños:', e.message));
    }
  }
}

/**
 * B. Recordatorios de vencimiento próximo (7, 3, 1 día antes) y el día del vencimiento.
 */
async function revisarVencimientosProximos() {
  const tramos = [
    { dias: 7, tipo: 'vencimiento_7' },
    { dias: 3, tipo: 'vencimiento_3' },
    { dias: 1, tipo: 'vencimiento_1' },
    { dias: 0, tipo: 'vencimiento_hoy' },
  ];

  for (const tramo of tramos) {
    const { rows: miembros } = await db.query(
      `SELECT * FROM miembros
       WHERE recibir_notificaciones = true
         AND fecha_vencimiento_suscripcion = CURRENT_DATE + $1::int`,
      [tramo.dias]
    );

    for (const m of miembros) {
      const clave = `${tramo.tipo}:${m.id}:${m.fecha_vencimiento_suscripcion}`;
      const asunto = tramo.dias === 0
        ? `Tu suscripción vence hoy, ${m.nombre}`
        : `Tu suscripción vence en ${tramo.dias} día(s)`;
      const mensaje = tramo.dias === 0
        ? `Hola ${m.nombre}, tu suscripción del plan ${m.plan} vence hoy. Renueva para seguir disfrutando del gimnasio.`
        : `Hola ${m.nombre}, tu suscripción del plan ${m.plan} vence en ${tramo.dias} día(s), el ${m.fecha_vencimiento_suscripcion}.`;

      const { rows } = await db.query(
        `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado, clave_deduplicacion)
         VALUES ($1, $2, $3, $4, 'pendiente', $5)
         ON CONFLICT (clave_deduplicacion) DO NOTHING
         RETURNING *`,
        [m.id, tramo.tipo, asunto, mensaje, clave]
      );
      if (rows[0]) {
        await enviarCorreoNotificacion(rows[0], m.email).catch((e) => console.error('Error correo vencimiento:', e.message));
      }
    }
  }
}

/**
 * C. Suscripciones vencidas — un solo correo, no repetido cada día.
 */
async function revisarVencidas() {
  const { rows: miembros } = await db.query(`
    SELECT * FROM miembros
    WHERE recibir_notificaciones = true
      AND fecha_vencimiento_suscripcion < CURRENT_DATE
      AND estado != 'vencido'
  `);

  for (const m of miembros) {
    const clave = `vencida:${m.id}:${m.fecha_vencimiento_suscripcion}`;
    const { rows } = await db.query(
      `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado, clave_deduplicacion)
       VALUES ($1, 'vencida', $2, $3, 'pendiente', $4)
       ON CONFLICT (clave_deduplicacion) DO NOTHING
       RETURNING *`,
      [m.id, `Tu suscripción ha vencido`,
        `Hola ${m.nombre}, tu suscripción venció el ${m.fecha_vencimiento_suscripcion}. Renueva tu plan para seguir accediendo al gimnasio.`,
        clave]
    );
    await db.query(`UPDATE miembros SET estado = 'vencido' WHERE id = $1`, [m.id]);
    if (rows[0]) {
      await enviarCorreoNotificacion(rows[0], m.email).catch((e) => console.error('Error correo vencida:', e.message));
    }
  }
}

/**
 * D. Procesar notificaciones y eventos programados cuya fecha ya llegó.
 */
async function procesarProgramados() {
  const { rows: pendientes } = await db.query(`
    SELECT n.*, m.email AS miembro_email FROM notificaciones n
    JOIN miembros m ON m.id = n.miembro_id
    WHERE (n.estado = 'programado' AND n.fecha_programada <= now())
       OR (n.estado = 'pendiente' AND n.fecha_programada IS NULL)
  `);
  for (const n of pendientes) {
    await enviarCorreoNotificacion(n, n.miembro_email).catch((e) => console.error('Error correo programado:', e.message));
  }

  const { rows: eventos } = await db.query(`
    SELECT * FROM eventos WHERE enviado = false AND fecha_envio IS NOT NULL AND fecha_envio <= now()
  `);
  for (const evento of eventos) {
    let filtro = 'true';
    if (evento.publico_objetivo === 'activos') filtro = `estado = 'activo'`;
    else if (evento.publico_objetivo && evento.publico_objetivo.startsWith('plan_')) {
      filtro = `plan = '${evento.publico_objetivo.replace('plan_', '')}'`;
    }

    const { rows: destinatarios } = await db.query(
      `SELECT * FROM miembros WHERE recibir_eventos = true AND ${filtro}`
    );

    for (const m of destinatarios) {
      const { rows } = await db.query(
        `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado)
         VALUES ($1, 'evento', $2, $3, 'pendiente') RETURNING *`,
        [m.id, evento.nombre, evento.descripcion || evento.nombre]
      );
      await enviarCorreoNotificacion(rows[0], m.email).catch((e) => console.error('Error correo evento:', e.message));
    }

    await db.query(`UPDATE eventos SET enviado = true WHERE id = $1`, [evento.id]);
  }
}

async function ejecutarTodosLosJobs() {
  console.log(`[jobs] Ejecutando automatizaciones — ${new Date().toISOString()}`);
  try { await revisarCumpleanos(); } catch (e) { console.error('[jobs] cumpleaños:', e.message); }
  try { await revisarVencimientosProximos(); } catch (e) { console.error('[jobs] vencimientos próximos:', e.message); }
  try { await revisarVencidas(); } catch (e) { console.error('[jobs] vencidas:', e.message); }
  try { await procesarProgramados(); } catch (e) { console.error('[jobs] programados:', e.message); }
  console.log('[jobs] Automatizaciones completadas.');
}

function iniciarScheduler() {
  // Todos los días a las 8:00 AM del servidor: cumpleaños y vencimientos
  cron.schedule('0 8 * * *', () => {
    revisarCumpleanos();
    revisarVencimientosProximos();
    revisarVencidas();
  });

  // Cada 5 minutos: procesar correos y eventos programados
  cron.schedule('*/5 * * * *', () => {
    procesarProgramados();
  });

  console.log('[jobs] Scheduler iniciado: cumpleaños/vencimientos diario 08:00, programados cada 5 min.');
}

module.exports = {
  iniciarScheduler,
  ejecutarTodosLosJobs,
  revisarCumpleanos,
  revisarVencimientosProximos,
  revisarVencidas,
  procesarProgramados,
};
