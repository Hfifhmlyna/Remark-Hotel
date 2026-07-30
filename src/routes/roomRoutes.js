const express = require('express');
const roomController = require('../controllers/roomController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const { roomIdParamValidator, roomValidator } = require('../validators/roomValidators');

const router = express.Router();

router.get('/admin/rooms', requireAuth, requireRole('admin'), roomController.listRooms);
router.get('/admin/rooms/new', requireAuth, requireRole('admin'), roomController.showCreateRoom);
router.post(
  '/admin/rooms',
  requireAuth,
  requireRole('admin'),
  roomValidator,
  handleValidationErrors,
  roomController.createRoom
);
router.get(
  '/admin/rooms/:id/edit',
  requireAuth,
  requireRole('admin'),
  roomIdParamValidator,
  handleValidationErrors,
  roomController.showEditRoom
);
router.post(
  '/admin/rooms/:id/update',
  requireAuth,
  requireRole('admin'),
  [...roomIdParamValidator, ...roomValidator],
  handleValidationErrors,
  roomController.updateRoom
);
router.post(
  '/admin/rooms/:id/delete',
  requireAuth,
  requireRole('admin'),
  roomIdParamValidator,
  handleValidationErrors,
  roomController.deleteRoom
);

module.exports = router;
