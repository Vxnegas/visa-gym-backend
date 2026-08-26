const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, registrarAdmin, me } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../database/db');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  message: { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
});

/**
 * Permite crear el primer usuario del sistema sin autenticación (bootstrap).
 * Una vez existe al menos un administrador, exige estar logueado como 'admin'
 * para poder crear cuentas nuevas (por ejemplo, la cuenta de solo lectura del dueño).
 */
async function permitirRegistroSegunContexto(req, res, next) {
  try {
    const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM administradores');
    if (rows[0].c === 0) return next(); // aún no hay nadie: se permite crear el primer admin
    return requireAuth(req, res, () => requireRole('admin')(req, res, next));
  } catch (err) {
    next(err);
  }
}

router.post('/login', authLimiter, login);
router.post('/register', authLimiter, permitirRegistroSegunContexto, registrarAdmin);
router.get('/me', requireAuth, me);

module.exports = router;
