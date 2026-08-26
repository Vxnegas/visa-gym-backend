const express = require('express');
const { requireAuth, soloLecturaSiDueno } = require('../middleware/auth');
const ctrl = require('../controllers/membersController');

const router = express.Router();
router.use(requireAuth);
router.use(soloLecturaSiDueno);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
