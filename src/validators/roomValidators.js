const { body, param } = require('express-validator');

const roomIdParamValidator = [
  param('id').isInt({ gt: 0 }).withMessage('ID ruangan tidak valid.').toInt()
];

const roomValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nama ruangan wajib diisi.')
    .isLength({ max: 120 })
    .withMessage('Nama ruangan maksimal 120 karakter.')
    .escape(),
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Lokasi ruangan wajib diisi.')
    .isLength({ max: 150 })
    .withMessage('Lokasi ruangan maksimal 150 karakter.')
    .escape(),
  body('capacity')
    .isInt({ gt: 0 })
    .withMessage('Kapasitas harus berupa angka lebih dari 0.')
    .toInt(),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Deskripsi maksimal 255 karakter.')
    .escape()
];

module.exports = {
  roomIdParamValidator,
  roomValidator
};
