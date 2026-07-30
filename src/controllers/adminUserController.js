const { all, get, run } = require('../config/db');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');
const { setFlash } = require('../utils/flash');

function isLockActive(lockedUntil) {
  if (!lockedUntil) {
    return false;
  }

  const lockedUntilDate = new Date(lockedUntil);
  if (Number.isNaN(lockedUntilDate.getTime())) {
    return false;
  }

  return lockedUntilDate > new Date();
}

async function listUsers(req, res, next) {
  try {
    // [SECURE CODING] Parameterized Query tidak dibutuhkan karena tanpa input user.
    const rows = await all(
      `
      SELECT id,
             full_name,
             email,
             username,
             role,
             failed_login_attempts,
             locked_until,
             last_failed_login_at,
             created_at
      FROM users
      ORDER BY id ASC
    `
    );

    const users = rows.map((row) => ({
      ...row,
      is_locked: isLockActive(row.locked_until)
    }));

    return res.render('admin/users', {
      title: 'Manajemen Pengguna',
      users
    });
  } catch (err) {
    return next(err);
  }
}

async function unlockUser(req, res, next) {
  try {
    const actorUserId = req.session.user.id;
    const { id } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk validasi target user.
    const targetUser = await get(
      'SELECT id, username, full_name, role, locked_until FROM users WHERE id = ?',
      [id]
    );

    if (!targetUser) {
      return res.status(404).render('error', {
        title: 'Pengguna Tidak Ditemukan',
        message: 'Data pengguna tidak ditemukan.'
      });
    }

    // [SECURE CODING] Parameterized Query untuk reset status lock akun.
    await run(
      `
      UPDATE users
      SET failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [id]
    );

    logger.security('USER_UNLOCKED', {
      actorUserId,
      targetUserId: targetUser.id,
      targetUsername: targetUser.username,
      ip: req.ip
    });

    await logAudit({
      actorUserId,
      action: 'USER_UNLOCKED',
      entityType: 'user',
      entityId: targetUser.id,
      metadata: {
        targetUsername: targetUser.username,
        targetRole: targetUser.role,
        previousLockedUntil: targetUser.locked_until
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', `Akun ${targetUser.username} berhasil di-unlock.`);
    return res.redirect('/admin/users');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  unlockUser
};
