const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const dbProvider = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();
const isPostgresProvider = dbProvider === 'postgres';
const isVercelRuntime = Boolean(process.env.VERCEL);
const defaultDbPath = isVercelRuntime ? '/tmp/app.db' : './database/app.db';
const dbPathFromEnv = process.env.DB_PATH || defaultDbPath;
const resolvedDbPath = path.isAbsolute(dbPathFromEnv)
  ? dbPathFromEnv
  : path.join(__dirname, '..', '..', dbPathFromEnv);

let db = null;
let pgPool = null;

if (isPostgresProvider) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL wajib diisi ketika DB_PROVIDER=postgres');
  }

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.PGSSLMODE === 'disable'
        ? false
        : {
            rejectUnauthorized: false
          }
  });
} else {
  const dbDir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.Database(resolvedDbPath, (err) => {
    if (err) {
      logger.error('Gagal membuka database SQLite', { message: err.message });
    }
  });

  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  });
}

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function convertQuestionMarksToPostgres(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function normalizeId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : value;
}

function addReturningIdIfInsert(sql) {
  const trimmed = sql.trim();
  if (!/^insert\s+/i.test(trimmed) || /\breturning\b/i.test(trimmed)) {
    return sql;
  }

  const withoutSemicolon = trimmed.replace(/;\s*$/, '');
  return `${withoutSemicolon} RETURNING id`;
}

function run(sql, params = []) {
  if (isPostgresProvider) {
    const convertedSql = convertQuestionMarksToPostgres(sql);
    const preparedSql = addReturningIdIfInsert(convertedSql);

    return pgPool.query(preparedSql, params).then((result) => ({
      lastID: normalizeId(result.rows?.[0]?.id),
      changes: Number(result.rowCount || 0)
    }));
  }

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
  if (isPostgresProvider) {
    const convertedSql = convertQuestionMarksToPostgres(sql);
    return pgPool.query(convertedSql, params).then((result) => result.rows[0]);
  }

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
  if (isPostgresProvider) {
    const convertedSql = convertQuestionMarksToPostgres(sql);
    return pgPool.query(convertedSql, params).then((result) => result.rows);
  }

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
  if (isPostgresProvider) {
    const statements = splitSqlStatements(sql);
    return statements.reduce((chain, statement) => {
      return chain.then(() => pgPool.query(statement));
    }, Promise.resolve());
  }

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
  if (isPostgresProvider) {
    if (!pgPool) {
      return Promise.resolve();
    }

    return pgPool.end().then(() => {
      pgPool = null;
    });
  }

  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        return reject(err);
      }

      return resolve();
    });
  });
}

async function pingDatabase() {
  if (isPostgresProvider) {
    await pgPool.query('SELECT 1');
    return;
  }

  await get('SELECT 1 AS ok');
}

function getDatabaseProvider() {
  return isPostgresProvider ? 'postgres' : 'sqlite';
}

function getPostgresPool() {
  return pgPool;
}

function isTruthyEnv(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

async function initializeSqliteDatabase() {
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

  await ensureUserSecurityColumnsSqlite();
}

async function initializePostgresDatabase() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_failed_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      room_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      agenda TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      sid VARCHAR PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions(expire);
  `);

  await ensureUserSecurityColumnsPostgres();
}

async function initializeDatabase() {
  if (isPostgresProvider) {
    await initializePostgresDatabase();
  } else {
    await initializeSqliteDatabase();
  }

  await seedDefaultUsers();
  await seedDefaultRooms();

  logger.info('Database initialized', {
    provider: isPostgresProvider ? 'postgres' : 'sqlite',
    dbPath: isPostgresProvider ? undefined : resolvedDbPath
  });
}

async function ensureUserSecurityColumnsSqlite() {
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

async function ensureUserSecurityColumnsPostgres() {
  const userColumns = await all(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
  `
  );
  const availableColumns = new Set(userColumns.map((column) => column.column_name));

  if (!availableColumns.has('failed_login_attempts')) {
    await run('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
  }

  if (!availableColumns.has('locked_until')) {
    await run('ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ');
  }

  if (!availableColumns.has('last_failed_login_at')) {
    await run('ALTER TABLE users ADD COLUMN last_failed_login_at TIMESTAMPTZ');
  }
}

async function seedDefaultUsers() {
  const forceUpdateAdminSeed = isTruthyEnv(process.env.SEED_ADMIN_FORCE_UPDATE);

  await createUserIfNotExists({
    fullName: process.env.SEED_ADMIN_NAME || 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
    role: 'admin',
    forceUpdateExisting: forceUpdateAdminSeed
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

async function createUserIfNotExists({
  fullName,
  email,
  username,
  password,
  role,
  forceUpdateExisting = false
}) {
  // [SECURE CODING] Parameterized Query untuk mencegah SQL Injection.
  const existingUser = await get('SELECT id, username, email, role FROM users WHERE username = ? OR email = ?', [
    username,
    email
  ]);

  const passwordHash = bcrypt.hashSync(password, 12);

  if (existingUser) {
    if (!forceUpdateExisting) {
      return;
    }

    // [SECURE CODING] Parameterized Query untuk force reset akun admin dari env bila diminta.
    await run(
      `
      UPDATE users
      SET full_name = ?,
          email = ?,
          username = ?,
          password_hash = ?,
          role = ?,
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [fullName, email, username, passwordHash, role, existingUser.id]
    );

    logger.security('SEED_USER_FORCE_UPDATED', {
      userId: existingUser.id,
      username,
      role
    });

    return;
  }

  // [SECURE CODING] Parameterized Query untuk insert user secara aman.
  await run(
    'INSERT INTO users (full_name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [fullName, email, username, passwordHash, role]
  );

  logger.security('SEED_USER_CREATED', { username, role });
}

module.exports = {
  db: isPostgresProvider ? pgPool : db,
  run,
  get,
  all,
  exec,
  pingDatabase,
  getDatabaseProvider,
  getPostgresPool,
  closeDatabase,
  initializeDatabase
};
