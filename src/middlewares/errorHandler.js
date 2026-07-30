const logger = require('../utils/logger');
const { setFlash } = require('../utils/flash');

function notFoundHandler(req, res) {
  return res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'Halaman yang Anda cari tidak ditemukan.'
  });
}

function errorHandler(err, req, res, next) {
  if (err.code === 'EBADCSRFTOKEN') {
    logger.security('CSRF_VALIDATION_FAILED', {
      path: req.originalUrl,
      method: req.method,
      ip: req.ip
    });

    if (req.accepts('html')) {
      setFlash(req, 'error', 'Permintaan tidak valid. Silakan muat ulang halaman dan coba lagi.');
      return res.redirect(req.get('referer') || '/');
    }

    return res.status(403).json({
      message: 'Permintaan tidak valid.'
    });
  }

  logger.error('Unhandled application error', {
    path: req.originalUrl,
    method: req.method,
    message: err.message
  });

  const statusCode = err.status || 500;
  const genericMessage = 'Terjadi kesalahan pada sistem. Silakan coba lagi.';

  // [SECURE CODING] Tidak mengirim detail stack trace/DB error ke pengguna.
  if (req.accepts('html')) {
    return res.status(statusCode).render('error', {
      title: `${statusCode} - Error`,
      message: genericMessage
    });
  }

  return res.status(statusCode).json({ message: genericMessage });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
