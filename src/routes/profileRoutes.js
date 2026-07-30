const express = require('express');
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const { profileUpdateValidator } = require('../validators/profileValidators');

const router = express.Router();

router.get('/profile', requireAuth, profileController.showProfile);
router.post(
  '/profile',
  requireAuth,
  profileUpdateValidator,
  handleValidationErrors,
  profileController.updateProfile
);

module.exports = router;
