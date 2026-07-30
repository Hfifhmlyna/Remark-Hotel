const bcrypt = require('bcryptjs');
const { get, run } = require('../config/db');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');
const { setFlash } = require('../utils/flash');

async function showProfile(req, res, next) {
  try {
    const userId = req.session.user.id;

    // [SECURE CODING] Parameterized Query untuk akses profil milik user login.
    const profile = await get(
      'SELECT id, full_name, email, username, role, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (!profile) {
      return res.status(404).render('error', {
        title: 'Profil Tidak Ditemukan',
        message: 'Profil pengguna tidak ditemukan.'
      });
    }

    return res.render('profile/edit', {
      title: 'Profil Pengguna',
      profile
    });
  } catch (err) {
    return next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const userId = req.session.user.id;
    const { fullName, email, username, currentPassword, newPassword } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk mengambil data user saat ini.
    const currentUser = await get('SELECT id, password_hash FROM users WHERE id = ?', [userId]);

    if (!currentUser) {
      return res.status(404).render('error', {
        title: 'Profil Tidak Ditemukan',
        message: 'Profil pengguna tidak ditemukan.'
      });
    }

    // [SECURE CODING] Parameterized Query untuk mencegah konflik email/username.
    const conflictUser = await get('SELECT id FROM users WHERE (email = ? OR username = ?) AND id <> ?', [
      email,
      username,
      userId
    ]);

    if (conflictUser) {
      setFlash(req, 'error', 'Email atau username sudah digunakan akun lain.');
      return res.redirect('/profile');
    }

    let passwordHash = currentUser.password_hash;

    if (newPassword) {
      if (!currentPassword) {
        setFlash(req, 'error', 'Masukkan password saat ini untuk mengubah password baru.');
        return res.redirect('/profile');
      }

      const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, currentUser.password_hash);
      if (!isCurrentPasswordValid) {
        setFlash(req, 'error', 'Password saat ini tidak sesuai.');
        return res.redirect('/profile');
      }

      passwordHash = bcrypt.hashSync(newPassword, 12);
    }

    // [SECURE CODING] Parameterized Query untuk update profil user.
    await run(
      `
      UPDATE users
      SET full_name = ?,
          email = ?,
          username = ?,
          password_hash = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [fullName, email, username, passwordHash, userId]
    );

    req.session.user.fullName = fullName;
    req.session.user.email = email;
    req.session.user.username = username;

    logger.security('PROFILE_UPDATED', {
      userId,
      username,
      changedPassword: Boolean(newPassword)
    });

    await logAudit({
      actorUserId: userId,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'user',
      entityId: userId,
      metadata: {
        username,
        changedPassword: Boolean(newPassword)
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', 'Profil berhasil diperbarui.');
    return res.redirect('/profile');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  showProfile,
  updateProfile
};
