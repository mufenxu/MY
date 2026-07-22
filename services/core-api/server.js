require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const { initCron, stopTask, TASKS } = require('./services/cronScheduler');
const logger = require('./utils/logger');
const { contentSecurityPolicyDirectives, sanitizeRequestUrl } = require('./utils/httpSecurity');
const { setAdminStaticCacheHeaders, isSpaNavigationRequest } = require('./utils/staticAssets');
const tuyaMessageService = require('./services/tuyaMessageService');
const tuyaAutomationService = require('./services/tuyaAutomationService');
const secretService = require('./services/secretService');
const settingsService = require('./services/settingsService');
const { migrateSensitiveData } = require('./services/sensitiveDataMigration');
const { cleanupRetiredFeatureData } = require('./services/retiredFeatureCleanup');
const courseOrderSubmissionWorker = require('./services/courseOrderSubmissionWorker');
const User = require('./models/User');
const CourseOrder = require('./models/CourseOrder');
const CourseOrderBatch = require('./models/CourseOrderBatch');
const { boundedTimeout, closeHttpServer, withDeadline } = require('./services/httpShutdown');

const app = express();
const PORT = process.env.CORE_PORT || process.env.PORT || 3045;
let server = null;
let initializationPromise = null;
let initialized = false;
let shutdownPromise = null;

function parseTrustProxy(value, fallback = 1) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1;
    const hops = Number.parseInt(normalized, 10);
    return Number.isFinite(hops) && hops >= 0 ? hops : String(value).trim();
}

// Keep the current one-hop proxy default, but allow direct deployments to opt out.
app.set('trust proxy', parseTrustProxy(
    process.env.CORE_TRUST_PROXY ?? process.env.TRUST_PROXY ?? process.env.PLATFORM_TRUST_PROXY,
    1,
));

// Middleware
app.use(requestId); // 全局请求 ID（必须最先注册）
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        directives: contentSecurityPolicyDirectives,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer-when-downgrade" },
    hsts: { maxAge: 31536000, includeSubDomains: false },
}));
// HTTP 请求日志 - 精简格式，跳过高频无意义请求
morgan.token('request-id', (req) => req.id || '-');
morgan.token('safe-url', sanitizeRequestUrl);
app.use(morgan(':request-id :method :safe-url :status :response-time[0]ms :res[content-length]', {
    stream: logger.stream,
    skip: (req, _res) => {
        // 跳过健康检查和根路径等高频请求
        return req.url === '/' || req.url === '/health' || req.url === '/favicon.ico';
    }
}));
const corsService = require('./services/corsService');

app.use(cors({
    origin: async function (origin, callback) {
        try {
            const allowed = await corsService.isOriginAllowed(origin);
            if (allowed) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        } catch (error) {
            // 出错时使用固定白名单作为后备
            if (!origin || corsService.STATIC_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'X-Request-Id', 'X-Core-Admin-Client', 'X-CSRF-Token', 'Idempotency-Key', 'If-Match'],
    exposedHeaders: ['X-CSRF-Token', 'ETag', 'X-Todo-Revision']
}));
app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf ? buf.toString('utf8') : '';
    }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});


// 静态文件服务 - 安全配置
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '7d'
}));
app.use('/public', express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '7d'
}));

// Routes
const { globalLimiter } = require('./middleware/rateLimit');
app.use('/api/', globalLimiter);
app.use('/api', require('./routes'));

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;
    res.status(isDbConnected ? 200 : 500).json({
        status: isDbConnected ? 'UP' : 'DOWN',
        timestamp: new Date().toISOString(),
        database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED'
    });
});

const configuredAdminDist = String(process.env.CORE_ADMIN_DIST || '').trim();
const adminDist = configuredAdminDist
    ? path.resolve(configuredAdminDist)
    : path.resolve(__dirname, '../../apps/core-admin/dist');
const adminIndex = path.join(adminDist, 'index.html');
const hasAdminSpa = fs.existsSync(adminIndex);

if (hasAdminSpa) {
    app.use(express.static(adminDist, {
        dotfiles: 'deny',
        index: false,
        fallthrough: true,
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => setAdminStaticCacheHeaders(adminDist, res, filePath)
    }));

    app.use((req, res, next) => {
        if (!isSpaNavigationRequest(req)) return next();
        res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        return res.sendFile(adminIndex);
    });
} else {
    app.get('/', (_req, res) => {
        res.send('Admin Server is running');
    });
}

// Error Handler
app.use(errorHandler);

async function initializeCoreRuntime() {
    if (initialized) {
        return app;
    }
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        });
        logger.info('MongoDB connected');
        await Promise.all([
            User.init(),
            CourseOrder.init(),
            CourseOrderBatch.init()
        ]);
        logger.info('Critical Core indexes ready');
        const retiredData = await cleanupRetiredFeatureData(mongoose.connection.db);
        if (retiredData.appClientsDropped
            || retiredData.authScanLogsDropped
            || retiredData.defaultResourceConfigsDeleted) {
            logger.info('Removed retired scan management and global configuration data', retiredData);
        }
        const migratedSecrets = await migrateSensitiveData();
        if (migratedSecrets.platformSecrets) {
            logger.info('Encrypted legacy Core secrets at rest', migratedSecrets);
        }
        await secretService.initCache();
        await settingsService.migrateNotifySecrets();
        await initCron();
        await courseOrderSubmissionWorker.start();
        tuyaMessageService.init();
        tuyaAutomationService.startScheduler();
        initialized = true;
        return app;
    })();

    try {
        return await initializationPromise;
    } finally {
        initializationPromise = null;
    }
}

async function closeCoreRuntime() {
    Object.keys(TASKS).forEach((taskId) => stopTask(taskId));
    tuyaMessageService.stop();
    await courseOrderSubmissionWorker.stop();
    tuyaAutomationService.stopScheduler();
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed.');
    }
    initialized = false;
}

function isCoreRuntimeReady() {
    return initialized && mongoose.connection.readyState === 1;
}

async function gracefulShutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    const timeoutMs = boundedTimeout(process.env.CORE_SHUTDOWN_TIMEOUT_MS);
    shutdownPromise = (async () => {
        logger.info(`Received ${signal}. Starting graceful shutdown...`);
        if (server) {
            const closingServer = server;
            server = null;
            await closeHttpServer(closingServer, {
                timeoutMs,
                onForce: () => logger.warn('HTTP shutdown deadline reached; forcing connections closed.'),
            });
            logger.info('HTTP server closed.');
        }
        await withDeadline(closeCoreRuntime(), {
            timeoutMs,
            message: 'Core runtime shutdown exceeded its deadline',
        });
    })();
    return shutdownPromise;
}

async function startStandalone() {
    try {
        await initializeCoreRuntime();
        server = app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
        });

        const shutdownAndExit = async (signal, exitCode = 0) => {
            try {
                await gracefulShutdown(signal);
                process.exit(exitCode);
            } catch (error) {
                logger.error('Graceful shutdown failed', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdownAndExit('SIGTERM'));
        process.on('SIGINT', () => shutdownAndExit('SIGINT'));
        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled Rejection at Promise:', {
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined
            });
        });
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception thrown:', {
                message: error.message,
                stack: error.stack
            });
            shutdownAndExit('uncaughtException', 1);
        });
    } catch (error) {
        logger.error('Server startup failed', error);
        process.exit(1);
    }
}

if (require.main === module) {
    startStandalone();
}

module.exports = {
    app,
    initializeCoreRuntime,
    closeCoreRuntime,
    isCoreRuntimeReady,
    startStandalone,
};
