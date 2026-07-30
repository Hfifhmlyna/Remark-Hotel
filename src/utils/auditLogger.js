const { run } = require('../config/db');
const logger = require('./logger');

async function logAudit({
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  try {
    // [SECURE CODING] Parameterized Query untuk menyimpan audit trail secara aman.
    await run(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        actorUserId,
        action,
        entityType,
        entityId !== null ? String(entityId) : null,
        JSON.stringify(metadata),
        ipAddress,
        userAgent
      ]
    );
  } catch (err) {
    // Audit log failure tidak boleh menggagalkan request utama.
    logger.error('AUDIT_LOG_WRITE_FAILED', {
      action,
      entityType,
      message: err.message
    });
  }
}

module.exports = {
  logAudit
};
