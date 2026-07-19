import { readFile } from 'node:fs/promises';

function normalizeStatus(value) {
  return {
    success: 'succeeded',
    failure: 'failed',
    cancelled: 'cancelled',
    queued: 'queued',
    building: 'building',
  }[String(value || '').toLowerCase()] || String(value || '').toLowerCase();
}

async function readArtifacts(filename) {
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

async function sendCallback() {
  const url = String(process.env.RELEASE_CALLBACK_URL || '').trim();
  const token = String(process.env.RELEASE_CALLBACK_TOKEN || '');
  if (!url || !token) {
    console.log('Release callback is not configured; skipping status synchronization.');
    return;
  }
  if (token.length < 32) throw new Error('RELEASE_CALLBACK_TOKEN must contain at least 32 characters.');
  const artifacts = await readArtifacts(process.env.RELEASE_ARTIFACTS_FILE);
  const targets = String(process.env.RELEASE_TARGETS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const repository = process.env.GITHUB_REPOSITORY || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  const payload = {
    type: 'build',
    releaseId: process.env.RELEASE_ID,
    status: normalizeStatus(process.env.RELEASE_STATUS),
    repository,
    workflow: process.env.GITHUB_WORKFLOW || '',
    ref: process.env.GITHUB_REF_NAME || '',
    revision: process.env.RELEASE_REVISION || process.env.GITHUB_SHA || '',
    targets: targets.length ? targets : artifacts.map((artifact) => artifact.component),
    artifacts,
    actor: process.env.GITHUB_ACTOR || 'github-actions',
    event: process.env.GITHUB_EVENT_NAME || '',
    runId,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) || 1,
    url: process.env.GITHUB_SERVER_URL && repository && runId
      ? `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${runId}`
      : '',
    error: process.env.RELEASE_ERROR || '',
  };

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
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
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

sendCallback().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
