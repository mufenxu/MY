const crypto = require('crypto');

const STATUS_ERROR_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR'
};

const INTERNAL_ERROR_MESSAGE = '服务器内部错误，请稍后重试。';

function createRequestId(value) {
  const incoming = String(value || '').trim();
  if (incoming && incoming.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(incoming)) {
    return incoming;
  }

  return crypto.randomUUID();
}

function normalizeStatusCode(value) {
  const statusCode = Number.parseInt(value, 10);
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    return 500;
  }

  return statusCode;
}

function normalizeErrorCode(statusCode, code) {
  const incoming = String(code || '').trim();
  if (incoming && incoming.length <= 80 && /^[A-Z0-9_:-]+$/.test(incoming)) {
    return incoming;
  }

  return STATUS_ERROR_CODES[statusCode] || 'REQUEST_FAILED';
}

function getPublicErrorMessage(statusCode, message) {
  if (statusCode >= 500) {
    return INTERNAL_ERROR_MESSAGE;
  }

  return message || '请求失败。';
}

function createErrorPayload(req, statusCode, message, code) {
  const normalizedStatus = normalizeStatusCode(statusCode);
  const normalizedCode = normalizeErrorCode(normalizedStatus, code);

  return {
    error: getPublicErrorMessage(normalizedStatus, message),
    code: normalizedCode,
    requestId: req.id
  };
}

function isHttpLoggingEnabled() {
  const value = process.env.LOG_HTTP_REQUESTS;
  if (value == null || value === '') {
    return true;
  }

  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function attachRequestContext(req, res, next) {
  const start = process.hrtime.bigint();
  req.id = createRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.id);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, 'error')) {
      const statusCode = normalizeStatusCode(res.statusCode);
      const code = statusCode >= 500
        ? normalizeErrorCode(statusCode)
        : normalizeErrorCode(statusCode, body.code);
      res.locals.errorCode = code;

      return originalJson({
        ...body,
        error: getPublicErrorMessage(statusCode, body.error),
        code,
        requestId: body.requestId || req.id
      });
    }

    return originalJson(body);
  };

  res.on('finish', () => {
    if (!isHttpLoggingEnabled()) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const entry = {
      event: 'http_request',
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || ''
    };

    if (res.statusCode >= 400 && res.locals.errorCode) {
      entry.errorCode = res.locals.errorCode;
    }

    const line = JSON.stringify(entry);
    if (res.statusCode >= 500) {
      console.error(line);
    } else {
      console.log(line);
    }
  });

  next();
}

function logRequestError(error, req, res, statusCode, code, internalCode) {
  if (!isHttpLoggingEnabled() || statusCode < 500) {
    return;
  }

  const stack = error && error.stack
    ? String(error.stack).split('\n').slice(0, 8)
    : undefined;
  const entry = {
    event: 'http_error',
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode,
    code,
    message: error && error.message ? error.message : String(error)
  };

  if (internalCode && internalCode !== code) {
    entry.internalCode = internalCode;
  }

  if (stack) {
    entry.stack = stack;
  }

  console.error(JSON.stringify(entry));
}

module.exports = {
  attachRequestContext,
  createErrorPayload,
  logRequestError,
  normalizeErrorCode,
  normalizeStatusCode
};
