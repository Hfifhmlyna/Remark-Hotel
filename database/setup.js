require('dotenv').config();

const { initializeDatabase } = require('../src/config/db');
const logger = require('../src/utils/logger');

initializeDatabase()
  .then(() => {
    logger.info('Database setup selesai.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Database setup gagal.', { message: err.message });
    process.exit(1);
  });
