const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-key';
process.env.DB_PATH = './database/test-app.db';
process.env.SEED_ADMIN_USERNAME = 'admin';
process.env.SEED_ADMIN_PASSWORD = 'Admin123!';
process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
process.env.SEED_ADMIN_NAME = 'Administrator';
process.env.SEED_USER_USERNAME = 'user';
process.env.SEED_USER_PASSWORD = 'User12345!';
process.env.SEED_USER_EMAIL = 'user@example.com';
process.env.SEED_USER_NAME = 'Pengguna Awal';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '900000';
process.env.LOGIN_RATE_LIMIT_MAX = '100';
process.env.LOGIN_LOCKOUT_MAX_FAILED = '3';
process.env.LOGIN_LOCKOUT_DURATION_MS = '600000';

const testDbPath = path.join(__dirname, '..', 'database', 'test-app.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const app = require('../src/app');
const { initializeDatabase, run, get, closeDatabase } = require('../src/config/db');

function extractCsrfToken(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!match) {
    throw new Error('CSRF token not found in response HTML.');
  }

  return match[1];
}

async function loginWithForm(agent, username, password) {
  const loginPage = await agent.get('/login').expect(200);
  const token = extractCsrfToken(loginPage.text);

  return agent
    .post('/login')
    .type('form')
    .send({
      _csrf: token,
      username,
      password
    });
}

describe('Sistem Reservasi Ruangan - Basic Flow', () => {
  beforeAll(async () => {
    await initializeDatabase();

    // [SECURE CODING] Parameterized Query untuk setup data test.
    await run('INSERT INTO rooms (name, location, capacity, description) VALUES (?, ?, ?, ?)', [
      'Ruang Testing A',
      'Gedung QA Lt.2',
      20,
      'Ruangan untuk integration test'
    ]);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('registrasi user baru berhasil', async () => {
    const guestAgent = request.agent(app);
    const registerPage = await guestAgent.get('/register').expect(200);
    const csrfToken = extractCsrfToken(registerPage.text);

    const response = await guestAgent
      .post('/register')
      .type('form')
      .send({
        _csrf: csrfToken,
        fullName: 'Tester Registrasi',
        email: 'tester.reg@example.com',
        username: 'testerreg',
        password: 'Password123!'
      });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login');
  });

  test('akun user terkunci sementara setelah gagal login berulang', async () => {
    const userAgent = request.agent(app);
    const adminAgent = request.agent(app);

    for (let i = 0; i < 3; i += 1) {
      const loginPage = await userAgent.get('/login').expect(200);
      const csrfToken = extractCsrfToken(loginPage.text);

      const failedLoginResponse = await userAgent
        .post('/login')
        .type('form')
        .send({
          _csrf: csrfToken,
          username: 'user',
          password: 'WrongPassword!'
        });

      expect(failedLoginResponse.statusCode).toBe(302);
      expect(failedLoginResponse.headers.location).toBe('/login');
    }

    const lockedUser = await get('SELECT id, locked_until FROM users WHERE username = ?', ['user']);
    expect(lockedUser.locked_until).toBeTruthy();

    const loginPageAfterLock = await userAgent.get('/login').expect(200);
    const csrfAfterLock = extractCsrfToken(loginPageAfterLock.text);

    const blockedLoginResponse = await userAgent
      .post('/login')
      .type('form')
      .send({
        _csrf: csrfAfterLock,
        username: 'user',
        password: 'User12345!'
      });

    expect(blockedLoginResponse.statusCode).toBe(302);
    expect(blockedLoginResponse.headers.location).toBe('/login');

    const lockAuditLog = await get(
      'SELECT action FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT 1',
      ['AUTH_LOGIN_LOCKED']
    );
    expect(lockAuditLog).toBeDefined();

    const adminLoginResponse = await loginWithForm(adminAgent, 'admin', 'Admin123!');
    expect(adminLoginResponse.statusCode).toBe(302);

    const usersPage = await adminAgent.get('/admin/users').expect(200);
    const adminCsrfToken = extractCsrfToken(usersPage.text);

    const unlockResponse = await adminAgent
      .post(`/admin/users/${lockedUser.id}/unlock`)
      .type('form')
      .send({
        _csrf: adminCsrfToken
      });

    expect(unlockResponse.statusCode).toBe(302);
    expect(unlockResponse.headers.location).toBe('/admin/users');

    const unlockedUser = await get('SELECT failed_login_attempts, locked_until FROM users WHERE id = ?', [
      lockedUser.id
    ]);
    expect(unlockedUser.failed_login_attempts).toBe(0);
    expect(unlockedUser.locked_until).toBeNull();

    const unlockAuditLog = await get(
      'SELECT action FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT 1',
      ['USER_UNLOCKED']
    );
    expect(unlockAuditLog).toBeDefined();
  });

  test('user dapat login dan mengajukan reservasi, admin dapat approve', async () => {
    const userAgent = request.agent(app);
    const adminAgent = request.agent(app);

    const userLoginResponse = await loginWithForm(userAgent, 'user', 'User12345!');
    expect(userLoginResponse.statusCode).toBe(302);
    expect(userLoginResponse.headers.location).toBe('/');

    const reservationPage = await userAgent.get('/reservations/new').expect(200);
    const userCsrfToken = extractCsrfToken(reservationPage.text);

    const reservationTitle = `Rapat Sprint ${Date.now()}`;
    const createReservationResponse = await userAgent
      .post('/reservations')
      .type('form')
      .send({
        _csrf: userCsrfToken,
        roomId: 1,
        title: reservationTitle,
        agenda: 'Pembahasan backlog sprint',
        startTime: '2026-08-10T09:00:00.000Z',
        endTime: '2026-08-10T11:00:00.000Z'
      });

    expect(createReservationResponse.statusCode).toBe(302);
    expect(createReservationResponse.headers.location).toBe('/reservations/my');

    // [SECURE CODING] Parameterized Query untuk verifikasi hasil test.
    const createdReservation = await get('SELECT id, status FROM reservations WHERE title = ?', [
      reservationTitle
    ]);
    expect(createdReservation).toBeDefined();
    expect(createdReservation.status).toBe('pending');

    const adminLoginResponse = await loginWithForm(adminAgent, 'admin', 'Admin123!');
    expect(adminLoginResponse.statusCode).toBe(302);
    expect(adminLoginResponse.headers.location).toBe('/');

    const manageReservationPage = await adminAgent.get('/admin/reservations').expect(200);
    const adminCsrfToken = extractCsrfToken(manageReservationPage.text);

    const approveResponse = await adminAgent
      .post(`/admin/reservations/${createdReservation.id}/status`)
      .type('form')
      .send({
        _csrf: adminCsrfToken,
        status: 'approved',
        adminNote: 'Disetujui untuk jadwal tersedia.'
      });

    expect(approveResponse.statusCode).toBe(302);
    expect(approveResponse.headers.location).toBe('/admin/reservations');

    const approvedReservation = await get('SELECT status FROM reservations WHERE id = ?', [
      createdReservation.id
    ]);
    expect(approvedReservation.status).toBe('approved');

    const approvalAuditLog = await get(
      'SELECT action FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT 1',
      ['RESERVATION_APPROVED']
    );
    expect(approvalAuditLog).toBeDefined();
  });

  test('dashboard audit logs hanya bisa diakses admin', async () => {
    const userAgent = request.agent(app);
    const adminAgent = request.agent(app);

    const userLoginResponse = await loginWithForm(userAgent, 'user', 'User12345!');
    expect(userLoginResponse.statusCode).toBe(302);

    const forbiddenResponse = await userAgent.get('/admin/audit-logs');
    expect(forbiddenResponse.statusCode).toBe(403);
    expect(forbiddenResponse.text).toContain('Akses Ditolak');

    const forbiddenUsersPage = await userAgent.get('/admin/users');
    expect(forbiddenUsersPage.statusCode).toBe(403);

    const adminLoginResponse = await loginWithForm(adminAgent, 'admin', 'Admin123!');
    expect(adminLoginResponse.statusCode).toBe(302);

    const adminAuditPage = await adminAgent.get('/admin/audit-logs');
    expect(adminAuditPage.statusCode).toBe(200);
    expect(adminAuditPage.text).toContain('Audit Logs');

    const adminUsersPage = await adminAgent.get('/admin/users');
    expect(adminUsersPage.statusCode).toBe(200);
    expect(adminUsersPage.text).toContain('Manajemen Pengguna');
  });
});
