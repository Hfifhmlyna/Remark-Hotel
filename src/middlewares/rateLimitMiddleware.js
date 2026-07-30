const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { setFlash } = require('../utils/flash');

const loginWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const loginMaxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5;

const loginRateLimiter = rateLimit({
  // [SECURE CODING] Batasi percobaan login untuk mitigasi brute force.
  windowMs: loginWindowMs,
  max: loginMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.security('LOGIN_RATE_LIMIT_TRIGGERED', {
      ip: req.ip,
      path: req.originalUrl
    });

    if (req.accepts('html')) {
      setFlash(req, 'error', 'Terlalu banyak percobaan login. Coba lagi beberapa saat.');
      return res.redirect('/login');
    }

    return res.status(429).json({
      message: 'Terlalu banyak percobaan login. Coba lagi beberapa saat.'
    });
  }
});

module.exports = {
  loginRateLimiter
};
