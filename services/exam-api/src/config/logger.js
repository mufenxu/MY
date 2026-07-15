/**
 * 结构化日志模块
 * 开发环境使用 pino-pretty 格式化输出，生产环境输出 JSON。
 */
const pino = require('pino');
const config = require('./index');

const logger = pino({
    level: process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug'),
    transport: config.isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
});

module.exports = logger;
