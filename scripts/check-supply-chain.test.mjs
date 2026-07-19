import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCompose, inspectDockerfile, inspectWorkflow } from './check-supply-chain.mjs';

test('workflow inspection rejects mutable external action references', () => {
  assert.deepEqual(inspectWorkflow(`
steps:
  - uses: ./local-action
  - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
`, 'secure.yml'), []);
  assert.match(
    inspectWorkflow('steps:\n  - uses: actions/checkout@v7\n', 'unsafe.yml')[0],
    /not pinned/,
  );
  assert.match(
    inspectWorkflow('steps:\n  - uses: docker://node:24\n', 'unsafe.yml')[0],
    /sha256 digest/,
  );
});

test('Dockerfile inspection resolves ARG defaults and rejects mutable base tags', () => {
  const digest = 'a'.repeat(64);
  assert.deepEqual(inspectDockerfile(`
# syntax=docker/dockerfile:1.7.1@sha256:${digest}
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:${digest}
FROM \${NODE_IMAGE} AS build
FROM build AS runtime
`, 'secure.Dockerfile'), []);
  assert.match(
    inspectDockerfile('FROM node:24-bookworm-slim\n', 'unsafe.Dockerfile')[0],
    /not pinned/,
  );
  assert.match(
    inspectDockerfile('ARG NODE_IMAGE\nFROM \${NODE_IMAGE}\n', 'missing.Dockerfile')[0],
    /no immutable default/,
  );
  assert.match(
    inspectDockerfile(`# syntax=docker/dockerfile:1.7\nFROM node:24@sha256:${digest}\n`, 'mutable-syntax.Dockerfile')[0],
    /syntax frontend is not pinned/,
  );
});

test('Compose inspection permits local builds and rejects mutable external images', () => {
  const digest = 'b'.repeat(64);
  assert.deepEqual(inspectCompose(`
services:
  local:
    image: \${LOCAL_IMAGE:-my-platform/local:local}
  broker:
    image: eclipse-mosquitto:2.0.22@sha256:${digest}
`, 'secure-compose.yml'), []);
  assert.match(
    inspectCompose('services:\n  broker:\n    image: eclipse-mosquitto:2\n', 'unsafe-compose.yml')[0],
    /not pinned/,
  );
});
