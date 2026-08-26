const express = require('express');
const { requireAuth, soloLecturaSiDueno } = require('../middleware/auth');
const ctrl = require('../controllers/paymentsController');

const router = express.Router();
router.use(requireAuth);
router.use(soloLecturaSiDueno);

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
