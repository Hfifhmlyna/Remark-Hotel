const express = require('express');
const reservationController = require('../controllers/reservationController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const {
  createReservationValidator,
  reservationStatusValidator
} = require('../validators/reservationValidators');

const router = express.Router();

router.get('/reservations', requireAuth, reservationController.redirectReservationHome);

router.get('/reservations/new', requireAuth, requireRole('user'), reservationController.showCreateReservation);
router.post(
  '/reservations',
  requireAuth,
  requireRole('user'),
  createReservationValidator,
  handleValidationErrors,
  reservationController.createReservation
);
router.get('/reservations/my', requireAuth, requireRole('user'), reservationController.listMyReservations);

router.get(
  '/admin/reservations',
  requireAuth,
  requireRole('admin'),
  reservationController.listAllReservationsForAdmin
);
router.post(
  '/admin/reservations/:id/status',
  requireAuth,
  requireRole('admin'),
  reservationStatusValidator,
  handleValidationErrors,
  reservationController.updateReservationStatus
);

module.exports = router;
