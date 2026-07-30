const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const isVercelRuntime = Boolean(process.env.VERCEL);
const defaultDbPath = isVercelRuntime ? '/tmp/app.db' : './database/app.db';
const dbPathFromEnv = process.env.DB_PATH || defaultDbPath;
const resolvedDbPath = path.isAbsolute(dbPathFromEnv)
  ? dbPathFromEnv
  : path.join(__dirname, '..', '..', dbPathFromEnv);

const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(resolvedDbPath, (err) => {
  if (err) {
    logger.error('Gagal membuka database SQLite', { message: err.message });
  }
});

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        return reject(err);
      }

      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }

      return resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }

      return resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        return reject(err);
      }

      return resolve();
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        return reject(err);
      }

      return resolve();
    });
  });
}

async function initializeDatabase() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_failed_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      agenda TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await ensureUserSecurityColumns();
  await seedDefaultUsers();
  await seedDefaultRooms();
  logger.info('Database initialized', { dbPath: resolvedDbPath });
}

async function ensureUserSecurityColumns() {
  const userColumns = await all('PRAGMA table_info(users)');
  const availableColumns = new Set(userColumns.map((column) => column.name));

  if (!availableColumns.has('failed_login_attempts')) {
    await run('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
  }

  if (!availableColumns.has('locked_until')) {
    await run('ALTER TABLE users ADD COLUMN locked_until TEXT');
  }

  if (!availableColumns.has('last_failed_login_at')) {
    await run('ALTER TABLE users ADD COLUMN last_failed_login_at TEXT');
  }
}

async function seedDefaultUsers() {
  await createUserIfNotExists({
    fullName: process.env.SEED_ADMIN_NAME || 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
    role: 'admin'
  });

  await createUserIfNotExists({
    fullName: process.env.SEED_USER_NAME || 'Pengguna Awal',
    email: process.env.SEED_USER_EMAIL || 'user@example.com',
    username: process.env.SEED_USER_USERNAME || 'user',
    password: process.env.SEED_USER_PASSWORD || 'User12345!',
    role: 'user'
  });
}

async function seedDefaultRooms() {
  const hotelName = process.env.HOTEL_NAME || 'Remark Hotel';

  const defaultRooms = [
    {
      name: 'Deluxe 101',
      location: `${hotelName} - Lantai 1`,
      capacity: 2,
      description: 'Kamar deluxe dengan 1 king bed dan city view.'
    },
    {
      name: 'Deluxe 102',
      location: `${hotelName} - Lantai 1`,
      capacity: 2,
      description: 'Kamar deluxe dengan twin bed untuk tamu bisnis.'
    },
    {
      name: 'Executive 201',
      location: `${hotelName} - Lantai 2`,
      capacity: 2,
      description: 'Kamar executive dengan area kerja dan breakfast.'
    },
    {
      name: 'Family 301',
      location: `${hotelName} - Lantai 3`,
      capacity: 4,
      description: 'Kamar keluarga dengan 2 queen bed.'
    },
    {
      name: 'Suite 401',
      location: `${hotelName} - Lantai 4`,
      capacity: 4,
      description: 'Suite premium dengan ruang tamu terpisah.'
    }
  ];

  for (const room of defaultRooms) {
    await createRoomIfNotExists(room);
  }
}

async function createRoomIfNotExists({ name, location, capacity, description }) {
  // [SECURE CODING] Parameterized Query untuk mencegah SQL Injection pada seed kamar.
  const existingRoom = await get('SELECT id FROM rooms WHERE name = ? AND location = ?', [
    name,
    location
  ]);

  if (existingRoom) {
    return;
  }

  // [SECURE CODING] Parameterized Query untuk insert data kamar default.
  await run('INSERT INTO rooms (name, location, capacity, description) VALUES (?, ?, ?, ?)', [
    name,
    location,
    capacity,
    description
  ]);

  logger.security('SEED_ROOM_CREATED', {
    name,
    location,
    capacity
  });
}

async function createUserIfNotExists({ fullName, email, username, password, role }) {
  // [SECURE CODING] Parameterized Query untuk mencegah SQL Injection.
  const existingUser = await get('SELECT id FROM users WHERE username = ? OR email = ?', [
    username,
    email
  ]);

  if (existingUser) {
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);

  // [SECURE CODING] Parameterized Query untuk insert user secara aman.
  await run(
    'INSERT INTO users (full_name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [fullName, email, username, passwordHash, role]
  );

  logger.security('SEED_USER_CREATED', { username, role });
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  closeDatabase,
  initializeDatabase
};
