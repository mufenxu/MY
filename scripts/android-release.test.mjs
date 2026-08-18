import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAndroidReleaseManifest,
  nextAndroidVersion,
  versionCodeFor,
} from './android-release.mjs';

test('patch releases keep multi-digit patch versions', () => {
  assert.equal(nextAndroidVersion(['android-v1.1.9'], 'patch', '1.1.0'), '1.1.10');
  assert.equal(versionCodeFor('1.1.10'), 1_001_010);
});

test('release version starts after the baseline and supports manual bumps', () => {
  assert.equal(nextAndroidVersion([], 'patch', '1.1.0'), '1.1.1');
  assert.equal(nextAndroidVersion(['android-v1.1.10'], 'minor', '1.1.0'), '1.2.0');
  assert.equal(nextAndroidVersion(['android-v1.9.4'], 'major', '1.1.0'), '2.0.0');
});

test('release manifest points at the immutable GitHub assets', () => {
  assert.deepEqual(
    createAndroidReleaseManifest({
      repository: 'mufenxu/MY',
      version: '1.2.0',
      sha256: 'a'.repeat(64),
      apkSize: 27_171_336,
      publishedAt: '2026-08-18T11:00:00Z',
      notes: '修复首页并优化更新体验',
    }),
    {
      packageName: 'cn.pxyb.mycontrol',
      versionName: '1.2.0',
      versionCode: 1_002_000,
      tag: 'android-v1.2.0',
      apkUrl: 'https://github.com/mufenxu/MY/releases/download/android-v1.2.0/my-control-1.2.0.apk',
      sha256: 'a'.repeat(64),
      apkSize: 27_171_336,
      releaseUrl: 'https://github.com/mufenxu/MY/releases/tag/android-v1.2.0',
      publishedAt: '2026-08-18T11:00:00Z',
      notes: '修复首页并优化更新体验',
    },
  );
});

test('release manifest uses Qiniu as the primary APK source when configured', () => {
  const manifest = createAndroidReleaseManifest({
    repository: 'mufenxu/MY',
    version: '1.2.0',
    sha256: 'b'.repeat(64),
    apkSize: 1,
    publishedAt: '2026-08-18T11:00:00Z',
    notes: '国内下载源',
    downloadBaseUrl: 'https://7n.pxyb.cn/',
  });

  assert.equal(manifest.apkUrl, 'https://7n.pxyb.cn/android/my-control-1.2.0.apk');
  assert.equal(
    manifest.fallbackApkUrl,
    'https://github.com/mufenxu/MY/releases/download/android-v1.2.0/my-control-1.2.0.apk',
  );
});
