const app = require('../src/app');
const { initializeDatabase } = require('../src/config/db');

let initializePromise;

async function ensureDatabaseReady() {
  if (!initializePromise) {
    initializePromise = initializeDatabase().catch((err) => {
      initializePromise = null;
      throw err;
    });
  }

  return initializePromise;
}

module.exports = async (req, res) => {
  try {
    await ensureDatabaseReady();
    return app(req, res);
  } catch (err) {
    console.error('[VERCEL] Failed to handle request', err);
    res.status(500).send('Terjadi kesalahan pada server.');
    return undefined;
  }
};
