const http = require("http");

const app = require("./app");
const config = require("./config");

const server = http.createServer(app);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WeCom Notify API 已启动，端口：${config.port}`);
});

const signals = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
});

