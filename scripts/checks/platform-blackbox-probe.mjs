#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

export function parseBlackboxTargets(value) {
  let targets;
  try {
    targets = JSON.parse(String(value || ''));
  } catch {
    throw new Error('PLATFORM_BLACKBOX_TARGETS must be a JSON array.');
  }
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 20) {
    throw new Error('PLATFORM_BLACKBOX_TARGETS must contain 1 to 20 targets.');
  }
  const ids = new Set();
  return targets.map((target) => {
    const id = String(target?.id || '').trim();
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate blackbox target id: ${id}`);
    ids.add(id);
    const url = new URL(String(target?.url || ''));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported blackbox target protocol: ${url.protocol}`);
    return {
      id,
      url: url.toString(),
      expectedStatus: clampInteger(target.expectedStatus, 200, 100, 599),
    };
  });
}

export async function probeBlackboxTarget(target, {
  fetchImpl = fetch,
  timeoutMs = 8000,
  expectedIntervalMs = 30000,
  now = () => new Date(),
} = {}) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target.url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MY-External-Blackbox/1.0' },
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      targetId: target.id,
      state: response.status === target.expectedStatus ? 'healthy' : response.status >= 500 ? 'offline' : 'degraded',
      httpStatus: response.status,
      latencyMs,
      reason: response.status === target.expectedStatus ? '' : `unexpected_http_${response.status}`,
      recordedAt: now().toISOString(),
      expectedIntervalMs,
    };
  } catch (error) {
    return {
      targetId: target.id,
      state: 'offline',
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
      reason: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      recordedAt: now().toISOString(),
      expectedIntervalMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readBlackboxSpool(filename) {
  try {
    const samples = [];
    for (const line of (await readFile(filename, 'utf8')).split(/\r?\n/).filter(Boolean)) {
      try {
        samples.push(JSON.parse(line));
      } catch {
        // A power loss can leave one partial JSONL record; valid durable records still replay.
      }
    }
    return samples;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function replaceSpool(filename, samples) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, samples.map((sample) => JSON.stringify(sample)).join('\n') + (samples.length ? '\n' : ''), { mode: 0o600 });
  await rename(temporary, filename);
}

export async function appendBlackboxSpool(filename, samples, maximum = 10000) {
  await appendFile(filename, `\n${samples.map((sample) => `${JSON.stringify(sample)}\n`).join('')}`, { mode: 0o600 });
  const queued = await readBlackboxSpool(filename);
  if (queued.length > maximum) await replaceSpool(filename, queued.slice(-maximum));
}

export async function flushBlackboxSpool({
  filename,
  ingestUrl,
  token,
  probeId,
  fetchImpl = fetch,
  batchSize = 100,
  timeoutMs = 10000,
}) {
  let queued = await readBlackboxSpool(filename);
  while (queued.length) {
    const batch = queued.slice(0, batchSize);
    const response = await fetchImpl(ingestUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ probeId, samples: batch }),
    });
    const { ok, status } = response;
    await response.body?.cancel();
    if (!ok) throw new Error(`Blackbox ingest returned HTTP ${status}.`);
    queued = queued.slice(batch.length);
    await replaceSpool(filename, queued);
  }
}

function loadConfig(env = process.env) {
  const token = String(env.PLATFORM_BLACKBOX_INGEST_TOKEN || '');
  if (token.length < 32) throw new Error('PLATFORM_BLACKBOX_INGEST_TOKEN must be at least 32 characters.');
  const ingestUrl = new URL(String(env.PLATFORM_BLACKBOX_INGEST_URL || ''));
  if (!['http:', 'https:'].includes(ingestUrl.protocol)) throw new Error('PLATFORM_BLACKBOX_INGEST_URL must use HTTP or HTTPS.');
  const probeId = String(env.PLATFORM_BLACKBOX_PROBE_ID || os.hostname()).trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(probeId)) throw new Error('PLATFORM_BLACKBOX_PROBE_ID is invalid.');
  const intervalMs = clampInteger(env.PLATFORM_BLACKBOX_INTERVAL_MS, 30000, 10000, 300000);
  return {
    targets: parseBlackboxTargets(env.PLATFORM_BLACKBOX_TARGETS),
    ingestUrl: ingestUrl.toString(),
    token,
    probeId,
    intervalMs,
    timeoutMs: clampInteger(env.PLATFORM_BLACKBOX_TIMEOUT_MS, 8000, 1000, Math.min(intervalMs, 30000)),
    spoolFile: path.resolve(env.PLATFORM_BLACKBOX_SPOOL_FILE || path.join(process.cwd(), 'blackbox-spool.jsonl')),
    spoolMaxSamples: clampInteger(env.PLATFORM_BLACKBOX_SPOOL_MAX_SAMPLES, 10000, 100, 100000),
  };
}

async function runCycle(config) {
  const samples = await Promise.all(config.targets.map((target) => probeBlackboxTarget(target, {
    timeoutMs: config.timeoutMs,
    expectedIntervalMs: config.intervalMs,
  })));
  await appendBlackboxSpool(config.spoolFile, samples, config.spoolMaxSamples);
  try {
    await flushBlackboxSpool(config);
  } catch (error) {
    console.error(JSON.stringify({ event: 'blackbox_ingest_deferred', error: error.message, queued: (await readBlackboxSpool(config.spoolFile)).length }));
  }
  console.log(JSON.stringify({ event: 'blackbox_cycle', probeId: config.probeId, samples }));
}

async function main() {
  const config = loadConfig();
  await mkdir(path.dirname(config.spoolFile), { recursive: true, mode: 0o700 });
  const once = process.argv.includes('--once');
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  while (!stopping) {
    const startedAt = Date.now();
    await runCycle(config);
    if (once) break;
    const waitMs = Math.max(0, config.intervalMs - (Date.now() - startedAt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
