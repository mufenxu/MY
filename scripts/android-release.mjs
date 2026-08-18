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
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('Invalid APK SHA-256');
  if (!Number.isSafeInteger(apkSize) || apkSize <= 0) throw new Error('Invalid APK size');
  const tag = `android-v${version}`;
  const apkName = `my-control-${version}.apk`;

  return {
    packageName: 'cn.pxyb.mycontrol',
    versionName: version,
    versionCode: versionCodeFor(version),
    tag,
    apkUrl: `https://github.com/${repository}/releases/download/${tag}/${apkName}`,
    sha256: sha256.toLowerCase(),
    apkSize,
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    publishedAt,
    notes,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function runCli() {
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
    });
    writeFileSync(option('--output'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return;
  }

  throw new Error('Usage: android-release.mjs <next|version-code|manifest> [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
