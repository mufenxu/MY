import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_PART_FACTOR = 1_000;

function parseVersion(value) {
  const match = VERSION_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid semantic version: ${value}`);

  const version = match.slice(1).map(Number);
  if (!version.every(Number.isSafeInteger) || version[1] >= VERSION_PART_FACTOR || version[2] >= VERSION_PART_FACTOR) {
    throw new Error(`Version is outside the supported range: ${value}`);
  }
  return version;
}

export function versionCodeFor(version) {
  const [major, minor, patch] = parseVersion(version);
  const code = major * VERSION_PART_FACTOR * VERSION_PART_FACTOR + minor * VERSION_PART_FACTOR + patch;
  if (!Number.isSafeInteger(code) || code > 2_147_483_647) {
    throw new Error(`Version code is outside the Android range: ${version}`);
  }
  return code;
}

export function nextAndroidVersion(tags, bump = 'patch', baseline = '1.1.0') {
  if (!['patch', 'minor', 'major'].includes(bump)) throw new Error(`Unsupported version bump: ${bump}`);

  const versions = [baseline, ...tags
    .filter((tag) => tag.startsWith('android-v'))
    .map((tag) => tag.slice('android-v'.length))]
    .map((version) => ({ version, code: versionCodeFor(version) }))
    .sort((left, right) => right.code - left.code);
  const [major, minor, patch] = parseVersion(versions[0].version);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (patch + 1 >= VERSION_PART_FACTOR) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function createAndroidReleaseManifest({
  repository,
  version,
  sha256,
  apkSize,
  publishedAt,
  notes,
  downloadBaseUrl,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('Invalid APK SHA-256');
  if (!Number.isSafeInteger(apkSize) || apkSize <= 0) throw new Error('Invalid APK size');
  const tag = `android-v${version}`;
  const apkName = `my-control-${version}.apk`;
  const githubApkUrl = `https://github.com/${repository}/releases/download/${tag}/${apkName}`;
  const normalizedDownloadBaseUrl = normalizeDownloadBaseUrl(downloadBaseUrl);

  return {
    packageName: 'cn.pxyb.mycontrol',
    versionName: version,
    versionCode: versionCodeFor(version),
    tag,
    apkUrl: normalizedDownloadBaseUrl
      ? `${normalizedDownloadBaseUrl}/android/${apkName}`
      : githubApkUrl,
    ...(normalizedDownloadBaseUrl ? { fallbackApkUrl: githubApkUrl } : {}),
    sha256: sha256.toLowerCase(),
    apkSize,
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    publishedAt,
    notes,
  };
}

export function selectAndroidDraftRelease(releases) {
  const drafts = (Array.isArray(releases) ? releases : [])
    .filter((release) => release?.draft)
    .filter((release) => String(release.tag_name || '').startsWith('android-v'));
  if (drafts.length > 1) throw new Error('Multiple Android draft releases exist');
  const release = drafts[0];
  if (!release) return null;

  const version = String(release.tag_name).slice('android-v'.length);
  versionCodeFor(version);
  const notes = String(release.body || '').trim();
  if (!notes) throw new Error(`Android draft release ${release.tag_name} has empty release notes`);
  return {
    id: String(release.id),
    tag: String(release.tag_name),
    version,
    notes,
  };
}

function normalizeDownloadBaseUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Download base URL must be a clean HTTPS origin');
  }
  return value.replace(/\/+$/, '');
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

async function runCli() {
  const command = process.argv[2];
  if (command === 'next') {
    const tags = execFileSync('git', ['tag', '--list', 'android-v*'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    process.stdout.write(nextAndroidVersion(tags, option('--bump'), option('--base')));
    return;
  }

  if (command === 'version-code') {
    process.stdout.write(String(versionCodeFor(option('--version'))));
    return;
  }

  if (command === 'manifest') {
    const manifest = createAndroidReleaseManifest({
      repository: option('--repository'),
      version: option('--version'),
      sha256: option('--sha256'),
      apkSize: Number(option('--apk-size')),
      publishedAt: option('--published-at'),
      notes: readFileSync(option('--notes-file'), 'utf8').trim(),
      downloadBaseUrl: process.argv.includes('--download-base-url') ? option('--download-base-url') : undefined,
    });
    writeFileSync(option('--output'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return;
  }

  if (command === 'draft') {
    const repository = option('--repository');
    const token = option('--token');
    const [owner, name] = repository.split('/');
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'MY-Android-Release/1.0',
        },
      },
    );
    if (!response.ok) throw new Error(`GitHub release request failed with HTTP ${response.status}`);
    const draft = selectAndroidDraftRelease(await response.json());
    process.stdout.write(JSON.stringify(draft));
    return;
  }

  throw new Error('Usage: android-release.mjs <next|version-code|manifest|draft> [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
