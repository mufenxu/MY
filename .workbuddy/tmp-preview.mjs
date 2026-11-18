import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/official-website/dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const mockStatus = {
  overall: 'operational',
  generatedAt: new Date().toISOString(),
  services: Array.from({ length: 6 }, (_, i) => ({ name: `svc-${i}`, state: 'healthy', stale: false })),
  incidents: [],
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5199');
  if (url.pathname === '/api/public/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(mockStatus));
    return;
  }
  if (url.pathname === '/api/public/android/download') {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(5199, '127.0.0.1', () => console.log('preview on 5199'));
