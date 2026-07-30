const express = require('express');
const adminUserController = require('../controllers/adminUserController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const { unlockUserValidator } = require('../validators/adminUserValidators');

const router = express.Router();

router.get('/admin/users', requireAuth, requireRole('admin'), adminUserController.listUsers);
router.post(
  '/admin/users/:id/unlock',
  requireAuth,
  requireRole('admin'),
  unlockUserValidator,
  handleValidationErrors,
  adminUserController.unlockUser
);

module.exports = router;
