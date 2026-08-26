const db = require('../database/db');

async function listar(req, res, next) {
  try {
    const { rows } = await db.query(`SELECT * FROM eventos ORDER BY fecha_evento ASC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const {
      nombre, descripcion, fecha_evento, hora_evento, publico_objetivo, fecha_envio,
    } = req.body;

    if (!nombre || !fecha_evento) {
      return res.status(400).json({ error: 'nombre y fecha_evento son obligatorios.' });
    }

    const { rows } = await db.query(
      `INSERT INTO eventos (nombre, descripcion, fecha_evento, hora_evento, publico_objetivo, fecha_envio)
       VALUES ($1,$2,$3,$4,COALESCE($5,'todos'),$6)
       RETURNING *`,
      [nombre.trim(), descripcion || null, fecha_evento, hora_evento || null, publico_objetivo, fecha_envio || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await db.query('DELETE FROM eventos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Evento no encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, eliminar };
