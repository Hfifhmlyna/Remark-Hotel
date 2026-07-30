const { setFlash } = require('../utils/flash');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    logger.security('AUTH_REQUIRED_BLOCKED', {
      path: req.originalUrl,
      method: req.method,
      ip: req.ip
    });

    void logAudit({
      actorUserId: null,
      action: 'AUTH_REQUIRED_BLOCKED',
      entityType: 'authorization',
      entityId: req.originalUrl,
      metadata: {
        method: req.method
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }

  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      logger.security('ACCESS_DENIED', {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        requiredRoles: roles,
        actualRole: req.session.user ? req.session.user.role : null,
        userId: req.session.user ? req.session.user.id : null
      });

      void logAudit({
        actorUserId: req.session.user ? req.session.user.id : null,
        action: 'ACCESS_DENIED',
        entityType: 'authorization',
        entityId: req.originalUrl,
        metadata: {
          method: req.method,
          requiredRoles: roles,
          actualRole: req.session.user ? req.session.user.role : null
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(403).render('error', {
        title: 'Akses Ditolak',
        message: 'Anda tidak memiliki izin untuk mengakses halaman ini.'
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
