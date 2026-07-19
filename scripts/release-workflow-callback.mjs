import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CALLBACK_PATH = '/api/releases/callback';

function normalizeStatus(value) {
  return {
    success: 'succeeded',
    failure: 'failed',
    cancelled: 'cancelled',
    queued: 'queued',
    building: 'building',
  }[String(value || '').toLowerCase()] || String(value || '').toLowerCase();
}

export async function readArtifacts(filename) {
  if (!filename) return [];
  try {
    const source = await readFile(filename, 'utf8');
    return source.split(/\r?\n/).filter(Boolean).map((line) => {
      const [component, image, digest, reference, shaTag] = line.split('\t');
      return { component, image, digest, reference, shaTag };
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function validateCallbackTarget(value, allowedOriginValue) {
  let target;
  let allowedOrigin;
  try {
    target = new URL(String(value || '').trim());
    allowedOrigin = new URL(String(allowedOriginValue || '').trim());
  } catch {
    throw new Error('Release callback URL and allowed origin must be valid absolute HTTPS URLs.');
  }
  if (
    target.protocol !== 'https:'
    || allowedOrigin.protocol !== 'https:'
    || allowedOrigin.origin !== allowedOrigin.href.replace(/\/$/, '')
    || target.origin !== allowedOrigin.origin
    || target.pathname !== CALLBACK_PATH
    || target.search
    || target.hash
    || target.username
    || target.password
  ) {
    throw new Error(`Release callback must use the protected HTTPS origin and exact ${CALLBACK_PATH} path.`);
  }
  return target.href;
}

export async function sendCallback({
  env = process.env,
  fetchImpl = fetch,
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const urlValue = String(env.RELEASE_CALLBACK_URL || '').trim();
  const allowedOriginValue = String(env.RELEASE_CALLBACK_ALLOWED_ORIGIN || '').trim();
  const token = String(env.RELEASE_CALLBACK_TOKEN || '');
  if (!urlValue && !allowedOriginValue && !token) {
    console.log('Release callback is not configured; skipping status synchronization.');
    return;
  }
  if (!urlValue || !allowedOriginValue || !token) {
    throw new Error('Release callback URL, allowed origin and token must be configured together.');
  }
  if (token.length < 32) throw new Error('RELEASE_CALLBACK_TOKEN must contain at least 32 characters.');
  const url = validateCallbackTarget(urlValue, allowedOriginValue);
  const artifacts = await readArtifacts(env.RELEASE_ARTIFACTS_FILE);
  const targets = String(env.RELEASE_TARGETS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const repository = env.GITHUB_REPOSITORY || '';
  const runId = env.GITHUB_RUN_ID || '';
  const payload = {
    type: 'build',
    releaseId: env.RELEASE_ID,
    status: normalizeStatus(env.RELEASE_STATUS),
    repository,
    workflow: env.GITHUB_WORKFLOW || '',
    ref: env.GITHUB_REF_NAME || '',
    revision: env.RELEASE_REVISION || env.GITHUB_SHA || '',
    targets: targets.length ? targets : artifacts.map((artifact) => artifact.component),
    artifacts,
    actor: env.GITHUB_ACTOR || 'github-actions',
    event: env.GITHUB_EVENT_NAME || '',
    runId,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT) || 1,
    url: env.GITHUB_SERVER_URL && repository && runId
      ? `${env.GITHUB_SERVER_URL}/${repository}/actions/runs/${runId}`
      : '',
    error: env.RELEASE_ERROR || '',
  };

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`release callback returned HTTP ${response.status}`);
      console.log(`Release ${payload.releaseId} synchronized as ${payload.status}.`);
      return;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < 4) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  sendCallback().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
