const express = require('express');
const auditController = require('../controllers/auditController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/admin/audit-logs', requireAuth, requireRole('admin'), auditController.listAuditLogs);

module.exports = router;
