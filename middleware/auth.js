const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Token faltante.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = {
      id: payload.sub,
      email: payload.email,
      nombre: payload.nombre,
      rol: payload.rol || 'admin',
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

/**
 * Bloquea cualquier acción de escritura (POST/PUT/DELETE) para el rol
 * 'dueno' (solo lectura). Los GET siempre pasan. Debe ir después de requireAuth.
 */
function soloLecturaSiDueno(req, res, next) {
  if (req.method !== 'GET' && req.admin?.rol === 'dueno') {
    return res.status(403).json({ error: 'Tu usuario tiene acceso de solo lectura y no puede realizar esta acción.' });
  }
  next();
}

/**
 * Exige uno de los roles indicados. Debe ir después de requireAuth.
 * Uso: router.post('/algo', requireAuth, requireRole('admin'), ctrl.crear)
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.admin?.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    next();
  };
}

module.exports = { requireAuth, soloLecturaSiDueno, requireRole };
