const db = require('../database/db');

async function listar(req, res, next) {
  try {
    const { fecha, miembro_id } = req.query;
    const params = [];
    const conditions = [];
    if (fecha) { params.push(fecha); conditions.push(`c.fecha = $${params.length}`); }
    if (miembro_id) { params.push(miembro_id); conditions.push(`c.miembro_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT c.*, m.nombre AS miembro_nombre
       FROM checkins c JOIN miembros m ON m.id = c.miembro_id
       ${where}
       ORDER BY c.fecha DESC, c.hora DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { miembro_id } = req.body;
    if (!miembro_id) return res.status(400).json({ error: 'miembro_id es obligatorio.' });

    const { rows } = await db.query(
      `INSERT INTO checkins (miembro_id) VALUES ($1) RETURNING *`,
      [miembro_id]
    );
    await db.query(`UPDATE miembros SET ultima_visita = now() WHERE id = $1`, [miembro_id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear };
