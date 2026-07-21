import http from 'node:http';
import { once } from 'node:events';

async function closeServer(server) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function withFetchServer(handler, callback) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;

    try {
      await fetch(origin, { method: 'HEAD' });
    } catch (error) {
      await closeServer(server);
      if (error?.cause?.message === 'bad port') continue;
      throw error;
    }

    try {
      await callback(origin);
    } finally {
      await closeServer(server);
    }
    return;
  }

  throw new Error('Unable to allocate a Fetch-compatible local test port.');
}
