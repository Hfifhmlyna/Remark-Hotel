const { validationResult, matchedData } = require('express-validator');
const { setFlash } = require('../utils/flash');

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    setFlash(req, 'error', firstError.msg);

    const backUrl = req.get('referer') || '/';
    return res.redirect(backUrl);
  }

  // [SECURE CODING] Hanya data tervalidasi yang diteruskan ke controller.
  req.cleanedData = matchedData(req, {
    locations: ['body', 'params', 'query'],
    includeOptionals: true
  });

  return next();
}

module.exports = {
  handleValidationErrors
};
