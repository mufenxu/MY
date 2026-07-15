/**
 * MongoDB 连接管理
 * 包含连接事件监听和优雅关闭
 */
const mongoose = require('mongoose');
const config = require('./index');
const logger = require('./logger');

async function connectDatabase() {
    try {
        await mongoose.connect(config.mongodbUri);
        logger.info('MongoDB 连接成功');
    } catch (err) {
        logger.fatal({ err }, 'MongoDB 连接失败');
        throw err;
    }

    mongoose.connection.on('error', (err) => {
        logger.error({ err }, 'MongoDB 连接错误');
    });

    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB 连接断开');
    });

    mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB 重新连接成功');
    });
}

async function disconnectDatabase() {
    await mongoose.connection.close();
    logger.info('MongoDB 连接已关闭');
}

module.exports = { connectDatabase, disconnectDatabase };
