const bcrypt = require('bcryptjs');
const { get, run } = require('../config/db');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');
const { setFlash } = require('../utils/flash');

const loginLockoutMaxFailed = Number(process.env.LOGIN_LOCKOUT_MAX_FAILED) || 5;
const loginLockoutDurationMs = Number(process.env.LOGIN_LOCKOUT_DURATION_MS) || 15 * 60 * 1000;

function isLockoutActive(lockedUntil) {
  if (!lockedUntil) {
    return false;
  }

  const lockedUntilDate = new Date(lockedUntil);
  if (Number.isNaN(lockedUntilDate.getTime())) {
    return false;
  }

  return lockedUntilDate > new Date();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
}

function showRegister(req, res) {
  if (req.session.user) {
    return res.redirect('/');
  }

  return res.render('auth/register', {
    title: 'Registrasi Pengguna'
  });
}

async function register(req, res, next) {
  try {
    const { fullName, email, username, password } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk cek duplikasi akun.
    const existingUser = await get('SELECT id FROM users WHERE email = ? OR username = ?', [
      email,
      username
    ]);

    if (existingUser) {
      setFlash(req, 'error', 'Email atau username sudah terdaftar.');
      return res.redirect('/register');
    }

    const passwordHash = bcrypt.hashSync(password, 12);

    // [SECURE CODING] Parameterized Query untuk insert data user.
    const insertResult = await run(
      "INSERT INTO users (full_name, email, username, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
      [fullName, email, username, passwordHash]
    );

    await logAudit({
      actorUserId: insertResult.lastID,
      action: 'AUTH_REGISTER_SUCCESS',
      entityType: 'user',
      entityId: insertResult.lastID,
      metadata: {
        username,
        email,
        role: 'user'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.security('REGISTER_SUCCESS', { username, ip: req.ip });
    setFlash(req, 'success', 'Registrasi berhasil. Silakan login.');
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
}

function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect('/');
  }

  return res.render('auth/login', {
    title: 'Login'
  });
}

async function login(req, res, next) {
  try {
    const { username, password } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk mengambil user berdasarkan username.
    const user = await get(
      `
      SELECT id,
             full_name,
             email,
             username,
             password_hash,
             role,
             failed_login_attempts,
             locked_until
      FROM users
      WHERE username = ?
    `,
      [username]
    );

    if (user && isLockoutActive(user.locked_until)) {
      logger.security('LOGIN_BLOCKED_LOCKOUT', {
        username,
        userId: user.id,
        ip: req.ip,
        lockedUntil: user.locked_until
      });

      await logAudit({
        actorUserId: user.id,
        action: 'AUTH_LOGIN_LOCKED',
        entityType: 'auth',
        entityId: user.id,
        metadata: {
          username,
          lockedUntil: user.locked_until,
          reason: 'active_lockout'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      setFlash(req, 'error', 'Akun terkunci sementara. Silakan coba lagi beberapa saat.');
      return res.redirect('/login');
    }

    const isPasswordValid = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!isPasswordValid) {
      let accountLocked = false;
      let lockedUntilValue = null;

      if (user) {
        const nextFailedAttempts = Number(user.failed_login_attempts || 0) + 1;

        if (nextFailedAttempts >= loginLockoutMaxFailed) {
          accountLocked = true;
          lockedUntilValue = new Date(Date.now() + loginLockoutDurationMs).toISOString();
        }

        // [SECURE CODING] Parameterized Query untuk update status lockout login user.
        await run(
          `
          UPDATE users
          SET failed_login_attempts = ?,
              locked_until = ?,
              last_failed_login_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
          [
            accountLocked ? 0 : nextFailedAttempts,
            accountLocked ? lockedUntilValue : null,
            user.id
          ]
        );
      }

      logger.security('LOGIN_FAILED', {
        username,
        ip: req.ip,
        accountLocked
      });

      await logAudit({
        actorUserId: user ? user.id : null,
        action: accountLocked ? 'AUTH_LOGIN_LOCKED' : 'AUTH_LOGIN_FAILED',
        entityType: 'auth',
        entityId: user ? user.id : username,
        metadata: {
          username,
          accountLocked,
          lockedUntil: lockedUntilValue
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      if (accountLocked) {
        setFlash(req, 'error', 'Akun terkunci sementara. Silakan coba lagi beberapa saat.');
      } else {
        setFlash(req, 'error', 'Kredensial tidak valid.');
      }

      return res.redirect('/login');
    }

    // [SECURE CODING] Reset hitungan gagal login ketika autentikasi berhasil.
    await run(
      `
      UPDATE users
      SET failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [user.id]
    );

    // [SECURE CODING] Regenerasi session untuk mitigasi session fixation.
    await regenerateSession(req);

    req.session.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      username: user.username,
      role: user.role
    };

    logger.security('LOGIN_SUCCESS', {
      userId: user.id,
      username: user.username,
      role: user.role,
      ip: req.ip
    });

    await logAudit({
      actorUserId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'auth',
      entityId: user.id,
      metadata: {
        username: user.username,
        role: user.role
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', `Selamat datang, ${user.full_name}.`);
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  const sessionUser = req.session.user;

  if (sessionUser) {
    logger.security('LOGOUT', {
      userId: sessionUser.id,
      username: sessionUser.username,
      ip: req.ip
    });

    await logAudit({
      actorUserId: sessionUser.id,
      action: 'AUTH_LOGOUT',
      entityType: 'auth',
      entityId: sessionUser.id,
      metadata: {
        username: sessionUser.username
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  return req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie('connect.sid');

    return res.redirect('/login');
  });
}

module.exports = {
  showRegister,
  register,
  showLogin,
  login,
  logout
};
