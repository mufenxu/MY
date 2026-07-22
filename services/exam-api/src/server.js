/**
 * Service startup entry.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const Admin = require('./models/Admin');
const MajorCategory = require('./models/MajorCategory');
const Category = require('./models/Category');
const Question = require('./models/Question');
const QuestionVersion = require('./models/QuestionVersion');
const ExamProgress = require('./models/ExamProgress');
const ExamResult = require('./models/ExamResult');
const { DEMO_SCOPE, buildScopeAssignment } = require('./utils/libraryScope');
const { isRuntimeReady, setRuntimeReady } = require('./runtimeState');
const { closeHttpServer } = require('./services/httpShutdown');

const BCRYPT_ROUNDS = 12;
const MIN_ADMIN_PASSWORD_LENGTH = config.adminPasswordMinLength;

let server;
let initialized = false;
let initializationPromise = null;
let shutdownPromise = null;

function isStrongAdminPassword(password) {
    return typeof password === 'string'
        && password.length >= MIN_ADMIN_PASSWORD_LENGTH
        && /[a-z]/.test(password)
        && /[A-Z]/.test(password)
        && /\d/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

async function initAdmin() {
    const count = await Admin.countDocuments();
    if (count > 0) {
        return;
    }

    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const displayName = process.env.DEFAULT_ADMIN_DISPLAY_NAME || 'Super Admin';
    let plainPassword = process.env.DEFAULT_ADMIN_PASSWORD || '';

    if (!plainPassword && config.isProduction) {
        logger.warn('DEFAULT_ADMIN_PASSWORD is not configured, skipping default admin bootstrap.');
        return;
    }

    if (!plainPassword) {
        plainPassword = `Aa1!${crypto.randomBytes(18).toString('base64url')}`;
        logger.warn({ username }, 'Generated a temporary admin password for local development: %s', plainPassword);
    }

    if (!isStrongAdminPassword(plainPassword)) {
        throw new Error(
            `DEFAULT_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters and include uppercase, lowercase, number, and symbol.`,
        );
    }

    const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    await Admin.create({
        username,
        password: hashedPassword,
        displayName,
    });

    logger.info({ username }, 'Default admin created');
}

async function initData() {
    if (!config.shouldSeedSampleData) {
        return;
    }

    const count = await Category.countDocuments();
    if (count > 0) {
        return;
    }

    logger.info('Seeding sample category and question data...');

    const majorCategory = await MajorCategory.create({
        name: '示例题库',
        sortOrder: 0,
        showOnHome: true,
        ...buildScopeAssignment(DEMO_SCOPE),
    });

    const category = await Category.create({
        name: '基础测试',
        count: 1,
        isPublished: true,
        majorCategoryId: majorCategory._id,
        ...buildScopeAssignment(DEMO_SCOPE),
    });

    await Question.create({
        type: 'single',
        content: '小程序中用于页面跳转的 API 是？',
        options: [
            { label: 'A', value: 'wx.navigateTo' },
            { label: 'B', value: 'wx.request' },
        ],
        answer: ['A'],
        analysis: 'wx.navigateTo 用于保留当前页面并跳转到应用内页面。',
        categoryId: category._id,
        ...buildScopeAssignment(DEMO_SCOPE),
    });

    logger.info('Sample data seeded.');
}

async function gracefulShutdown(signal, exitCode = 0) {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    shutdownPromise = (async () => {
        logger.info({ signal }, 'Received shutdown signal, shutting down gracefully...');
        setRuntimeReady(false);

        try {
            await closeHttpServer(server, {
                timeoutMs: config.shutdownTimeoutMs,
                onForce: () => logger.warn('Forcing remaining HTTP connections to close.'),
            });
            server = null;
            logger.info('HTTP server stopped.');
        } catch (error) {
            logger.error({ err: error }, 'Failed to close HTTP server');
            exitCode = 1;
        }

        try {
            await closeExamRuntime();
        } catch (error) {
            logger.error({ err: error }, 'Failed to close database connection');
            exitCode = 1;
        }

        process.exitCode = exitCode;
    })();

    return shutdownPromise;
}

async function initializeExamRuntime() {
    if (initialized) {
        return app;
    }
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        await connectDatabase();
        await initializeCriticalIndexes();
        await initAdmin();
        await initData();
        initialized = true;
        setRuntimeReady(true);
        return app;
    })();

    try {
        return await initializationPromise;
    } finally {
        initializationPromise = null;
    }
}

async function initializeCriticalIndexes(models = [Admin, ExamProgress, ExamResult, QuestionVersion]) {
    await Promise.all(models.map((Model) => Model.init()));
}

async function closeExamRuntime() {
    setRuntimeReady(false);
    if (initialized) {
        await disconnectDatabase();
        initialized = false;
    }
}

function isExamRuntimeReady() {
    return initialized && isRuntimeReady() && mongoose.connection.readyState === 1;
}

async function startStandalone() {
    try {
        await initializeExamRuntime();

        server = app.listen(config.port, () => {
            logger.info({ port: config.port }, 'Server started on http://localhost:%d', config.port);
        });

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        process.on('unhandledRejection', (error) => {
            logger.error({ err: error }, 'Unhandled promise rejection');
        });

        process.on('uncaughtException', (error) => {
            logger.fatal({ err: error }, 'Uncaught exception');
            gracefulShutdown('uncaughtException', 1);
        });
    } catch (error) {
        logger.fatal({ err: error }, 'Server startup failed');
        process.exit(1);
    }
}

if (require.main === module) {
    startStandalone();
}

module.exports = {
    app,
    initializeExamRuntime,
    closeExamRuntime,
    isExamRuntimeReady,
    initializeCriticalIndexes,
    gracefulShutdown,
    startStandalone,
};
