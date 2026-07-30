require('dotenv').config();

const app = require('./app');
const { initializeDatabase } = require('./config/db');
const logger = require('./utils/logger');

const port = Number(process.env.PORT) || 3000;

async function bootstrap() {
  try {
    await initializeDatabase();

    app.listen(port, () => {
      logger.info(`Server berjalan di http://localhost:${port}`);
    });
  } catch (err) {
    logger.error('Gagal memulai aplikasi', {
      message: err.message
    });
    process.exit(1);
  }
}

bootstrap();
