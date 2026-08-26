const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }

    const { rows } = await db.query(
      'SELECT * FROM administradores WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const admin = rows[0];

    // Respuesta genérica para no revelar si el email existe
    if (!admin) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, nombre: admin.nombre, rol: admin.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      admin: { id: admin.id, nombre: admin.nombre, email: admin.email, rol: admin.rol },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Crea un nuevo usuario del sistema.
 * - Si todavía no existe ningún administrador (primer arranque del sistema),
 *   se permite crear el primero sin estar autenticado, y siempre queda con
 *   rol 'admin' (control total), sin importar lo que venga en el body.
 * - Si ya existe al menos un administrador, esta ruta exige estar
 *   autenticado como 'admin' (ver middleware permitirRegistroSegunContexto
 *   en routes/auth.js) y ahí sí se puede indicar el rol: 'admin' o 'dueno'.
 */
async function registrarAdmin(req, res, next) {
  try {
    const { nombre, email, password } = req.body;
    let { rol } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const { rows: existentes } = await db.query('SELECT COUNT(*)::int AS c FROM administradores');
    const esPrimerUsuario = existentes[0].c === 0;

    if (esPrimerUsuario) {
      rol = 'admin'; // el primer usuario siempre queda con control total
    } else if (!['admin', 'dueno'].includes(rol)) {
      return res.status(400).json({ error: "El rol debe ser 'admin' o 'dueno'." });
    }

    const hash = await bcrypt.hash(password, 12);

    const { rows } = await db.query(
      `INSERT INTO administradores (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, created_at`,
      [nombre.trim(), email.toLowerCase().trim(), hash, rol]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un administrador con ese email.' });
    }
    next(err);
  }
}

async function me(req, res) {
  res.json({ admin: req.admin });
}

module.exports = { login, registrarAdmin, me };
