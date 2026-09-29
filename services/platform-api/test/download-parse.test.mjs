import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractShareUrl,
  formatSize,
  isBlockedShareTarget,
  isDouyinUrl,
  readDownloadConfig,
  resolutionLabel,
  resolveDownloadTarget,
} from '../src/download-parse.mjs';

test('extractShareUrl 从抖音整段分享文案里取出链接', () => {
  const shareText = '9.74 复制打开抖音，看看【甘肃.鹏鹏的作品】从实体店干到线上店铺 https://v.douyin.com/b0HckDdF-iw/ 08/21 d@N.jp :2pm baN:/';

  assert.equal(extractShareUrl(shareText), 'https://v.douyin.com/b0HckDdF-iw/');
});

test('extractShareUrl 去掉链接末尾的中文标点', () => {
  assert.equal(extractShareUrl('看这个 https://v.douyin.com/abc123/，很好看'), 'https://v.douyin.com/abc123/');
  assert.equal(extractShareUrl('https://v.douyin.com/abc123/。'), 'https://v.douyin.com/abc123/');
});

test('extractShareUrl 拒绝空输入、非 http 协议和超长地址', () => {
  assert.equal(extractShareUrl(''), '');
  assert.equal(extractShareUrl('   '), '');
  assert.equal(extractShareUrl('javascript:alert(1)'), '');
  assert.equal(extractShareUrl(`https://v.douyin.com/${'a'.repeat(2_100)}/`), '');
});

test('isDouyinUrl 只认抖音与抖音分享域名', () => {
  assert.equal(isDouyinUrl('https://v.douyin.com/b0HckDdF-iw/'), true);
  assert.equal(isDouyinUrl('https://www.douyin.com/video/7380000000000000000'), true);
  assert.equal(isDouyinUrl('https://www.iesdouyin.com/share/video/7380000000000000000/'), true);
  assert.equal(isDouyinUrl('https://evil-douyin.com/video/1'), false);
  assert.equal(isDouyinUrl('https://douyin.com.evil.example/video/1'), false);
  assert.equal(isDouyinUrl('https://www.bilibili.com/video/BV1xx'), false);
  assert.equal(isDouyinUrl('not a url'), false);
});

test('isBlockedShareTarget 拦截回环、内网与链路本地地址', () => {
  const blocked = [
    'http://localhost/video',
    'http://foo.local/video',
    'http://127.0.0.1/video',
    'http://10.1.2.3/video',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.10/video',
    'http://172.16.0.1/video',
    'http://100.64.0.1/video',
    'http://[::1]/video',
    'http://[fd00::1]/video',
    'file:///etc/passwd',
  ];

  for (const candidate of blocked) {
    assert.equal(isBlockedShareTarget(candidate), true, candidate);
  }
  assert.equal(isBlockedShareTarget('https://v.douyin.com/b0HckDdF-iw/'), false);
  assert.equal(isBlockedShareTarget('https://www.bilibili.com/video/BV1xx'), false);
  assert.equal(isBlockedShareTarget(''), true);
});

test('readDownloadConfig 使用默认值并夹住超时范围', () => {
  const fallback = readDownloadConfig({});
  assert.equal(fallback.ytdlpPath, 'yt-dlp');
  assert.equal(fallback.timeoutMs, 20_000);

  assert.equal(readDownloadConfig({ PLATFORM_YTDLP_PATH: '  ' }).ytdlpPath, 'yt-dlp');
  assert.equal(readDownloadConfig({ PLATFORM_YTDLP_PATH: '/opt/bin/yt-dlp' }).ytdlpPath, '/opt/bin/yt-dlp');

  assert.equal(readDownloadConfig({ PLATFORM_DOWNLOAD_TIMEOUT_MS: '1' }).timeoutMs, 5_000);
  assert.equal(readDownloadConfig({ PLATFORM_DOWNLOAD_TIMEOUT_MS: '999999' }).timeoutMs, 120_000);
  assert.equal(readDownloadConfig({ PLATFORM_DOWNLOAD_TIMEOUT_MS: '30000' }).timeoutMs, 30_000);
  assert.equal(readDownloadConfig({ PLATFORM_DOWNLOAD_TIMEOUT_MS: 'abc' }).timeoutMs, 20_000);
});

test('resolutionLabel 用短边标注竖版视频清晰度', () => {
  assert.equal(resolutionLabel(720, 1280), '720P');
  assert.equal(resolutionLabel(1920, 1080), '1080P');
  assert.equal(resolutionLabel(0, 0), '原始画质');
});

test('formatSize 输出可读体积', () => {
  assert.equal(formatSize(23_082_302), '22.0 MB');
  assert.equal(formatSize(2_048), '2 KB');
  assert.equal(formatSize(1024 * 1024 * 1024), '1.00 GB');
  assert.equal(formatSize(0), '');
});

test('resolveDownloadTarget 在发起网络请求前就拒绝非法与内网链接', async () => {
  const neverCalled = () => {
    throw new Error('解析非法链接时不应该发起网络请求');
  };

  await assert.rejects(
    resolveDownloadTarget({ url: '这里没有链接', fetchImpl: neverCalled }),
    (error) => error.status === 400 && error.code === 'INVALID_URL',
  );
  await assert.rejects(
    resolveDownloadTarget({ url: 'http://169.254.169.254/latest/meta-data/', fetchImpl: neverCalled }),
    (error) => error.status === 400 && error.code === 'BLOCKED_TARGET',
  );
});