const db = require('../database/db');

async function listar(req, res, next) {
  try {
    const { miembro_id } = req.query;
    const params = [];
    let where = '';
    if (miembro_id) {
      params.push(miembro_id);
      where = 'WHERE p.miembro_id = $1';
    }
    const { rows } = await db.query(
      `SELECT p.*, m.nombre AS miembro_nombre, m.email AS miembro_email
       FROM pagos p JOIN miembros m ON m.id = p.miembro_id
       ${where}
       ORDER BY p.fecha_pago DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { miembro_id, monto, metodo_pago, estado, fecha_pago } = req.body;
    if (!miembro_id || !monto || !metodo_pago) {
      return res.status(400).json({ error: 'miembro_id, monto y metodo_pago son obligatorios.' });
    }
    if (Number(monto) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0.' });
    }

    const { rows } = await db.query(
      `INSERT INTO pagos (miembro_id, monto, metodo_pago, estado, fecha_pago)
       VALUES ($1,$2,$3,COALESCE($4,'completado'),COALESCE($5, now()))
       RETURNING *`,
      [miembro_id, monto, metodo_pago, estado, fecha_pago || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await db.query('DELETE FROM pagos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Pago no encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, eliminar };
