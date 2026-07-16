/**
 * Express application configuration.
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { NotFoundError } = require('./utils/errors');

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use((req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.id = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
});

const captchaResourceSources = [
    'https://o.alicdn.com',
    'https://g.alicdn.com',
    'https://static-captcha.aliyuncs.com',
    'https://static-captcha-sgp.aliyuncs.com',
];

const captchaConnectSources = [
    'https://cloudauth-device.aliyuncs.com',
    'https://cn-shanghai.device.saf.aliyuncs.com',
    'https://cloudauth-device.ap-southeast-1.aliyuncs.com',
    'https://ap-southeast-1.device.saf.aliyuncs.com',
    'https://ap-southeast-1-ga.device.saf.aliyuncs.com',
    'https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com',
    'https://cloudauth-device-dualstack.ap-southeast-1.aliyuncs.com',
    'https://*.captcha-esa-open.aliyuncs.com',
    'https://*.captcha-esa-open-b.aliyuncs.com',
    'https://*.captcha-open.aliyuncs.com',
    'https://*.captcha-open-b.aliyuncs.com',
    'https://*.captcha-open-dual.aliyuncs.com',
    'https://*.captcha-open-dual-b.aliyuncs.com',
    'https://*.captcha-open-southeast.aliyuncs.com',
    'https://*.captcha-open-southeast-b.aliyuncs.com',
    'https://*.captcha-open-southeast-dual.aliyuncs.com',
    'https://*.captcha-open-southeast-dual-b.aliyuncs.com',
];

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            // SFC templates are pre-compiled by Vite; no runtime compiler needed.
            scriptSrc: ["'self'", ...captchaResourceSources],
            scriptSrcElem: ["'self'", ...captchaResourceSources],
            styleSrc: ["'self'", "'unsafe-inline'", ...captchaResourceSources],
            styleSrcElem: ["'self'", "'unsafe-inline'", ...captchaResourceSources],
            fontSrc: ["'self'", 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: ["'self'", ...captchaConnectSources],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (
            config.corsOrigins.includes('*')
            || config.corsOrigins.length === 0
            || config.corsOrigins.includes(origin)
        ) {
            return callback(null, true);
        }

        return callback(null, false);
    },
}));

app.use(compression());
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));
app.use(requestLogger);

// Vite build output (SPA) served first with strong caching for hashed assets.
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const spaIndexPath = path.join(frontendDistPath, 'index.html');
const serveSpaIndex = (req, res, next) => {
    if (fs.existsSync(spaIndexPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(spaIndexPath);
    }

    return next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

app.use(express.static(frontendDistPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    },
}));

// Legacy public/ fallback serves old assets not yet migrated.
app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
        }

        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
    },
}));

const adminRoutes = require('./routes/adminRoutes');
const clientRoutes = require('./routes/clientRoutes');
const manageRoutes = require('./routes/manageRoutes');
const consoleRoutes = require('./routes/consoleRoutes');
const publicRoutes = require('./routes/publicRoutes');

const setNoStore = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
};

app.use('/api/public', setNoStore);
app.use('/api/admin', setNoStore);
app.use('/api/manage', setNoStore);
app.use('/api/console', setNoStore);

app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manage', manageRoutes);
app.use('/api/console', consoleRoutes);

app.get('/version', (req, res) => {
    res.json({ version: '2.0.0', status: 'public-ready', timestamp: Date.now() });
});

// Avoid auth middleware turning the browser's favicon probe into a 401.
app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/favicon.png');
});

const spaRoutePaths = new Set(['/', '/login', '/dashboard', '/exam-detail']);
app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && spaRoutePaths.has(req.path)) {
        return serveSpaIndex(req, res, next);
    }

    return next();
});

app.use('/', clientRoutes);

// SPA history fallback: non-API, non-file requests get the SPA index.html.
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
    }

    // Skip API routes and file requests
    if (req.path.startsWith('/api') || req.path.includes('.')) {
        return next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
    }

    // Serve SPA index for client-side routing
    return serveSpaIndex(req, res, next);
});

app.use(errorHandler);

module.exports = app;
