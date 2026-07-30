const fs = require('fs');
const path = require('path');

const isVercelRuntime = Boolean(process.env.VERCEL);
const logsDir = isVercelRuntime ? path.join('/tmp', 'remark-hotel-logs') : path.join(__dirname, '..', '..', 'logs');
const appLogFile = path.join(logsDir, 'app.log');
const securityLogFile = path.join(logsDir, 'security.log');
let fileLoggingEnabled = true;

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  fileLoggingEnabled = false;
  console.warn(`[LOGGER] File logging disabled: ${err.message}`);
}

function formatLine(level, message, details) {
  const timestamp = new Date().toISOString();
  const payload = details ? ` | ${JSON.stringify(details)}` : '';
  return `[${timestamp}] [${level}] ${message}${payload}`;
}

function appendLog(filePath, line) {
  if (!fileLoggingEnabled) {
    return;
  }

  try {
    fs.appendFileSync(filePath, `${line}\n`, { encoding: 'utf8' });
  } catch (err) {
    fileLoggingEnabled = false;
    console.warn(`[LOGGER] File logging disabled after write failure: ${err.message}`);
  }
}

function info(message, details) {
  const line = formatLine('INFO', message, details);
  console.log(line);
  appendLog(appLogFile, line);
}

function error(message, details) {
  const line = formatLine('ERROR', message, details);
  console.error(line);
  appendLog(appLogFile, line);
}

function security(event, details) {
  const line = formatLine('SECURITY', event, details);
  console.log(line);
  appendLog(securityLogFile, line);
}

module.exports = {
  info,
  error,
  security
};
