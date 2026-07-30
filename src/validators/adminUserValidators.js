const { param } = require('express-validator');

const unlockUserValidator = [
  param('id').isInt({ gt: 0 }).withMessage('ID pengguna tidak valid.').toInt()
];

module.exports = {
  unlockUserValidator
};
