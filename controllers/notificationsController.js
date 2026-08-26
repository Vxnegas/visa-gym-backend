const db = require('../database/db');
const { enviarCorreoNotificacion } = require('../services/emailService');

async function listar(req, res, next) {
  try {
    const { estado, tipo, miembro_id } = req.query;
    const params = [];
    const conditions = [];
    if (estado) { params.push(estado); conditions.push(`n.estado = $${params.length}`); }
    if (tipo) { params.push(tipo); conditions.push(`n.tipo = $${params.length}`); }
    if (miembro_id) { params.push(miembro_id); conditions.push(`n.miembro_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT n.*, m.nombre AS miembro_nombre, m.email AS miembro_email
       FROM notificaciones n LEFT JOIN miembros m ON m.id = n.miembro_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Crea una notificación manual. Puede ir a un miembro, a varios, o a un
 * segmento (todos / activos / por plan). Si scheduled_at está en el futuro
 * queda "programado"; si no, se envía de inmediato.
 */
async function crear(req, res, next) {
  try {
    const {
      miembro_ids, destino, plan, asunto, mensaje, enviar_inmediatamente, fecha_programada,
    } = req.body;

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'asunto y mensaje son obligatorios.' });
    }

    let miembros = [];
    if (Array.isArray(miembro_ids) && miembro_ids.length) {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE id = ANY($1) AND recibir_notificaciones = true`,
        [miembro_ids]
      );
      miembros = rows;
    } else if (destino === 'todos') {
      const { rows } = await db.query(`SELECT * FROM miembros WHERE recibir_notificaciones = true`);
      miembros = rows;
    } else if (destino === 'activos') {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE estado = 'activo' AND recibir_notificaciones = true`
      );
      miembros = rows;
    } else if (destino === 'plan' && plan) {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE plan = $1 AND recibir_notificaciones = true`,
        [plan]
      );
      miembros = rows;
    } else if (destino === 'vencidos') {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE estado = 'vencido' AND recibir_notificaciones = true`
      );
      miembros = rows;
    } else if (destino === 'pendientes') {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE estado = 'inactivo' AND recibir_notificaciones = true`
      );
      miembros = rows;
    } else if (destino === 'mora') {
      const { rows } = await db.query(
        `SELECT * FROM miembros WHERE estado IN ('vencido','inactivo') AND recibir_notificaciones = true`
      );
      miembros = rows;
    } else {
      return res.status(400).json({ error: 'Debes indicar miembro_ids o un destino válido.' });
    }

    if (!miembros.length) {
      return res.status(400).json({ error: 'No hay miembros que coincidan con los criterios.' });
    }

    const esProgramado = fecha_programada && new Date(fecha_programada) > new Date();
    const creadas = [];

    for (const miembro of miembros) {
      const { rows } = await db.query(
        `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado, fecha_programada)
         VALUES ($1, 'manual', $2, $3, $4, $5)
         RETURNING *`,
        [miembro.id, asunto, mensaje, esProgramado ? 'programado' : 'pendiente', fecha_programada || null]
      );
      creadas.push(rows[0]);
    }

    // Envío inmediato si corresponde
    if (!esProgramado && enviar_inmediatamente !== false) {
      for (const notif of creadas) {
        const miembro = miembros.find((m) => m.id === notif.miembro_id);
        try {
          await enviarCorreoNotificacion(notif, miembro.email);
        } catch (e) {
          console.error('Error enviando notificación manual:', e.message);
        }
      }
    }

    res.status(201).json({ creadas: creadas.length });
  } catch (err) {
    next(err);
  }
}

async function cancelar(req, res, next) {
  try {
    const { rows } = await db.query(
      `UPDATE notificaciones SET estado = 'cancelado'
       WHERE id = $1 AND estado IN ('pendiente','programado') RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notificación no encontrada o no cancelable.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, cancelar };
