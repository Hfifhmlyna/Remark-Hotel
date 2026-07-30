const { body } = require('express-validator');

const registerValidator = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Nama lengkap wajib diisi.')
    .isLength({ max: 100 })
    .withMessage('Nama lengkap maksimal 100 karakter.')
    .escape(),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Format email tidak valid.')
    .normalizeEmail(),
  body('username')
    .trim()
    .isLength({ min: 4, max: 30 })
    .withMessage('Username harus 4-30 karakter.')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username hanya boleh huruf, angka, titik, underscore, dan dash.')
    .escape(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password minimal 8 karakter.')
];

const loginValidator = [
  body('username').trim().notEmpty().withMessage('Username wajib diisi.').escape(),
  body('password').notEmpty().withMessage('Password wajib diisi.')
];

module.exports = {
  registerValidator,
  loginValidator
};
