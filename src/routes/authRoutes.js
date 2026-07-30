const express = require('express');
const authController = require('../controllers/authController');
const { loginRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const { registerValidator, loginValidator } = require('../validators/authValidators');

const router = express.Router();

router.get('/register', authController.showRegister);
router.post('/register', registerValidator, handleValidationErrors, authController.register);

router.get('/login', authController.showLogin);
router.post('/login', loginRateLimiter, loginValidator, handleValidationErrors, authController.login);

router.post('/logout', authController.logout);

module.exports = router;
