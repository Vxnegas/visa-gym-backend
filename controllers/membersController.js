const db = require('../database/db');

async function listar(req, res, next) {
  try {
    const { estado, plan, q } = req.query;
    const conditions = [];
    const params = [];

    if (estado) {
      params.push(estado);
      conditions.push(`estado = $${params.length}`);
    }
    if (plan) {
      params.push(plan);
      conditions.push(`plan = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      conditions.push(`(LOWER(nombre) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM miembros ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await db.query('SELECT * FROM miembros WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Miembro no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const {
      nombre, email, fecha_nacimiento, plan, estado,
      fecha_inicio_suscripcion, fecha_vencimiento_suscripcion,
      recibir_notificaciones, recibir_promociones, recibir_eventos,
    } = req.body;

    if (!nombre || !email) {
      return res.status(400).json({ error: 'Nombre y email son obligatorios.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const { rows } = await db.query(
      `INSERT INTO miembros
        (nombre, email, fecha_nacimiento, plan, estado, fecha_inicio_suscripcion,
         fecha_vencimiento_suscripcion, recibir_notificaciones, recibir_promociones, recibir_eventos)
       VALUES ($1,$2,$3,$4,COALESCE($5,'activo'),$6,$7,COALESCE($8,true),COALESCE($9,true),COALESCE($10,true))
       RETURNING *`,
      [nombre.trim(), email.toLowerCase().trim(), fecha_nacimiento || null, plan || 'basico',
        estado, fecha_inicio_suscripcion || null, fecha_vencimiento_suscripcion || null,
        recibir_notificaciones, recibir_promociones, recibir_eventos]
    );

    const miembro = rows[0];

    // Encolar notificación de bienvenida (deduplicada por miembro)
    await db.query(
      `INSERT INTO notificaciones (miembro_id, tipo, asunto, mensaje, estado, clave_deduplicacion)
       VALUES ($1, 'bienvenida', $2, $3, 'pendiente', $4)
       ON CONFLICT (clave_deduplicacion) DO NOTHING`,
      [
        miembro.id,
        `¡Bienvenido a VISA GYM, ${miembro.nombre}!`,
        `Hola ${miembro.nombre}, tu registro fue exitoso. ¡Nos vemos en el gimnasio!`,
        `bienvenida:${miembro.id}`,
      ]
    );

    res.status(201).json(miembro);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un miembro con ese email.' });
    }
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const campos = [
      'nombre', 'email', 'fecha_nacimiento', 'plan', 'estado',
      'fecha_inicio_suscripcion', 'fecha_vencimiento_suscripcion',
      'recibir_notificaciones', 'recibir_promociones', 'recibir_eventos', 'ultima_visita',
    ];
    const sets = [];
    const params = [];

    campos.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        params.push(req.body[campo]);
        sets.push(`${campo} = $${params.length}`);
      }
    });

    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar.' });

    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE miembros SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Miembro no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await db.query('DELETE FROM miembros WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Miembro no encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
