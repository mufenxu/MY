import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });
const server = app.listen(config.port, config.host, () => {
  console.log(`MY 管理中心 API 已启动：http://${config.host}:${config.port}`);
  if (config.authDisabled) console.warn('当前为本地开发免登录模式。');
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务。`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
