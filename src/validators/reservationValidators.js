const { body, param } = require('express-validator');

const createReservationValidator = [
  body('roomId').isInt({ gt: 0 }).withMessage('Ruangan tidak valid.').toInt(),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Judul reservasi wajib diisi.')
    .isLength({ max: 150 })
    .withMessage('Judul reservasi maksimal 150 karakter.')
    .escape(),
  body('agenda')
    .trim()
    .notEmpty()
    .withMessage('Agenda wajib diisi.')
    .isLength({ max: 255 })
    .withMessage('Agenda maksimal 255 karakter.')
    .escape(),
  body('startTime').isISO8601().withMessage('Format waktu mulai tidak valid.'),
  body('endTime').isISO8601().withMessage('Format waktu selesai tidak valid.')
];

const reservationStatusValidator = [
  param('id').isInt({ gt: 0 }).withMessage('ID reservasi tidak valid.').toInt(),
  body('status')
    .isIn(['approved', 'rejected'])
    .withMessage('Status harus approved atau rejected.'),
  body('adminNote')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Catatan admin maksimal 255 karakter.')
    .escape()
];

module.exports = {
  createReservationValidator,
  reservationStatusValidator
};
