#!/usr/bin/env node
// 校园网中转：在学校内网的机器上运行，给云端的 campus-service 提供 HTTP CONNECT 出口。
//
// 使用方式（两段都要起）：
//   1) 校内机器： node scripts/school-relay.mjs
//   2) 云服务器： ssh -N -R 3128:127.0.0.1:3128 root@<云服务器>
//   3) 云服务器 .env： HGU_UPSTREAM_PROXY=http://127.0.0.1:3128
//
// 只允许转发 hgu.edu.cn 及其子域，避免这个端口被当成通用代理。
// 默认只监听 127.0.0.1，必须配合 ssh 反向隧道使用；如需容器直连见 README。
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.RELAY_PORT || 3128);
const HOST = process.env.RELAY_HOST || "127.0.0.1";
const ALLOW_ALL = process.env.RELAY_ALLOW_ALL === "1";
const ALLOW_SUFFIX = String(process.env.RELAY_ALLOW_SUFFIX || "hgu.edu.cn")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

function isAllowed(hostname) {
  if (ALLOW_ALL) return true;
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  return ALLOW_SUFFIX.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const server = http.createServer((req, res) => {
  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("该端口只提供 HTTP CONNECT 中转。\n");
});

server.on("connect", (req, clientSocket, head) => {
  const [hostname, rawPort] = String(req.url || "").split(":");
  const port = Number(rawPort || 443);

  if (!isAllowed(hostname) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }

  const upstream = net.connect(port, hostname);
  upstream.setTimeout(15000, () => upstream.destroy());

  upstream.once("connect", () => {
    upstream.setTimeout(0);
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(PORT, HOST, () => {
  console.log(
    `school relay listening on ${HOST}:${PORT}  allow=${ALLOW_ALL ? "*" : ALLOW_SUFFIX.join(",")}`
  );
});
