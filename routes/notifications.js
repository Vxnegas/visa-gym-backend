const express = require('express');
const { requireAuth, soloLecturaSiDueno } = require('../middleware/auth');
const ctrl = require('../controllers/notificationsController');

const router = express.Router();
router.use(requireAuth);
router.use(soloLecturaSiDueno);

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.post('/:id/cancelar', ctrl.cancelar);

module.exports = router;
