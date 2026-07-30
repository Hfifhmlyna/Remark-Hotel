const path = require('path');
const express = require('express');
const session = require('express-session');
const csrf = require('csurf');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const roomRoutes = require('./routes/roomRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const { all } = require('./config/db');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const app = express();
const appName = process.env.HOTEL_NAME || 'Remark Hotel';

if (process.env.NODE_ENV === 'production') {
  // [DEPLOYMENT] Dibutuhkan agar secure cookie bekerja di belakang reverse proxy (mis. Vercel).
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    // [SECURE CODING] Secret session diambil dari environment variable.
    secret: process.env.SESSION_SECRET || 'please-change-session-secret',
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === 'production',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(
  csrf({
    // [SECURE CODING] Proteksi CSRF untuk seluruh state-changing request berbasis form.
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
  })
);

app.use((req, res, next) => {
  res.locals.appName = appName;
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.csrfToken = typeof req.csrfToken === 'function' ? req.csrfToken() : '';
  delete req.session.flash;
  next();
});

app.get('/', async (req, res, next) => {
  let featuredRooms = [];

  try {
    // [SECURE CODING] Query read-only tanpa input user untuk menampilkan kamar unggulan.
    featuredRooms = await all(
      'SELECT id, name, location, capacity, description FROM rooms ORDER BY capacity DESC, id ASC LIMIT 6'
    );
  } catch (err) {
    // [RESILIENCE] Jangan gagalkan halaman utama jika query kamar unggulan bermasalah.
    logger.error('FEATURED_ROOMS_LOAD_FAILED', {
      message: err.message
    });
  }

  try {
    return res.render('index', {
      title: `Sistem Reservasi ${appName}`,
      featuredRooms
    });
  } catch (err) {
    return next(err);
  }
});

app.use(authRoutes);
app.use(profileRoutes);
app.use(roomRoutes);
app.use(reservationRoutes);
app.use(auditRoutes);
app.use(adminUserRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
