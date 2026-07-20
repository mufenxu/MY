const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

const consoleTransport = process.env.NODE_ENV === 'production'
    ? new winston.transports.Console()
    : new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            logFormat
        ),
    });

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }), // Log the stack trace if available
        winston.format.json() // Structured JSON logs for files
    ),
    transports: [
        // Containers need stdout/stderr logs so orchestration failures remain observable.
        consoleTransport,
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,  // 单个文件最大 5MB
            maxFiles: 3                 // 最多保留 3 个旧文件
        }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5 * 1024 * 1024,  // 单个文件最大 5MB
            maxFiles: 3                 // 最多保留 3 个旧文件
        }),
    ],
});

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
    write: function (message) {
        // Use the 'info' log level so the output will be picked up by both transports (file and console)
        logger.info(message.trim());
    },
};

module.exports = logger;
