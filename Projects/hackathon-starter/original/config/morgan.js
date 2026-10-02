const logger = require('morgan');
const Bowser = require('bowser');

// Colors belong in the format string, not in a token: morgan escapes control characters that a token returns.
const colors = {
  red: 31,
  green: 32,
  yellow: 33,
  cyan: 36,
};

const statusColor = (status) => {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  return colors.green;
};

// Custom token for timestamp without timezone offset
logger.token('short-date', () => {
  const now = new Date();
  return now.toLocaleString('sv').replace(',', '');
});

// Custom token for simplified user agent using Bowser
logger.token('parsed-user-agent', (req) => {
  const userAgent = req.headers['user-agent'];
  if (!userAgent) return 'Unknown';
  const parsedUA = Bowser.parse(userAgent);
  const osName = parsedUA.os.name || 'Unknown';
  const browserName = parsedUA.browser.name || 'Unknown';

  // Get major version number
  const version = parsedUA.browser.version || '';
  const majorVersion = version.split('.')[0];

  return `${osName}/${browserName} v${majorVersion}`;
});

// Track bytes actually sent
logger.token('bytes-sent', (req, res) => {
  // Check for original uncompressed size first
  let length =
    res.getHeader('X-Original-Content-Length') || // Some compression middlewares add this
    res.get('x-content-length') || // Alternative header
    res.getHeader('Content-Length');

  // For static files
  if (!length && res.locals && res.locals.stat) {
    length = res.locals.stat.size;
  }

  // For response bodies (API responses)
  if (!length && res._contentLength) {
    length = res._contentLength;
  }

  // If we found a length, format it
  if (length && Number.isNaN(Number(length)) === false) {
    return `${(parseInt(length, 10) / 1024).toFixed(2)}KB`;
  }

  // For chunked responses
  const transferEncoding = res.getHeader('Transfer-Encoding');
  if (transferEncoding === 'chunked') {
    return 'chunked';
  }

  return '-';
});

// Track partial response info
logger.token('transfer-state', (req, res) => {
  if (!res._header) return 'NO_RESPONSE';
  if (res.finished) return 'COMPLETE';
  return 'PARTIAL';
});

// Define the custom request log format
// In development/test environments, include the full IP address in the logs to facilitate debugging,
// especially when collaborating with other developers testing the running instance.
// In production, omit the IP address to reduce the risk of leaking sensitive information and to support
// compliance with GDPR and other privacy regulations.
// Also using a function so we can test it in our unit tests.
const getMorganFormat = (color = colors.green) =>
  process.env.NODE_ENV === 'production'
    ? `:short-date :method :url \x1b[${color}m:status\x1b[0m :response-time[0]ms :bytes-sent :transfer-state - :parsed-user-agent`
    : `:short-date :method :url \x1b[${color}m:status\x1b[0m :response-time[0]ms :bytes-sent :transfer-state :remote-addr :parsed-user-agent`;

// Compile one line per color at startup instead of on every request
const compiledLines = new Map(Object.values(colors).map((color) => [color, logger.compile(getMorganFormat(color))]));

const formatLine = (tokens, req, res) => compiledLines.get(statusColor(res.statusCode))(tokens, req, res);

// Create a middleware to capture original content length
const captureContentLength = (req, res, next) => {
  const originalWrite = res.write;
  const originalEnd = res.end;
  let length = 0;

  res.write = (...args) => {
    const [chunk] = args;
    if (chunk) {
      length += chunk.length;
    }
    return originalWrite.apply(res, args);
  };

  res.end = (...args) => {
    const [chunk] = args;
    if (chunk) {
      length += chunk.length;
    }
    if (length > 0) {
      res._contentLength = length;
    }
    return originalEnd.apply(res, args);
  };

  next();
};

exports.morganLogger = () => (req, res, next) => {
  captureContentLength(req, res, () => {
    logger(formatLine, {
      immediate: false,
    })(req, res, next);
  });
};

// Expose for testing
exports._getMorganFormat = getMorganFormat;
exports._formatLine = formatLine;
