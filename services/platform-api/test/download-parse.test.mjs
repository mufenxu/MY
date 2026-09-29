import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMediaAsset,
  extensionFromUrl,
  extractShareUrl,
  formatSize,
  isBlockedShareTarget,
  isDouyinUrl,
  mediaMimeType,
  normalizeDownloadExtension,
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
test('normalizeDownloadExtension 只接受干净的短扩展名', () => {
  assert.equal(normalizeDownloadExtension('MP4'), 'mp4');
  assert.equal(normalizeDownloadExtension('.webm'), 'webm');
  assert.equal(normalizeDownloadExtension('  png  '), 'png');
  assert.equal(normalizeDownloadExtension(''), '');
  assert.equal(normalizeDownloadExtension('jpeg2000'), '');
  assert.equal(normalizeDownloadExtension('a/b'), '');
  assert.equal(normalizeDownloadExtension('mp4?x=1'), '');
  assert.equal(normalizeDownloadExtension(undefined), '');
});

test('mediaMimeType 让扩展名与实际容器保持一致', () => {
  assert.equal(mediaMimeType('mp4', 'video'), 'video/mp4');
  assert.equal(mediaMimeType('webm', 'video'), 'video/webm');
  assert.equal(mediaMimeType('flv', 'video'), 'video/x-flv');
  assert.equal(mediaMimeType('webp', 'images'), 'image/webp');
  assert.equal(mediaMimeType('gif', 'video'), 'image/gif');
  assert.equal(mediaMimeType('', 'video'), 'video/mp4');
  assert.equal(mediaMimeType('unknown', 'images'), 'image/jpeg');
});

test('extensionFromUrl 从抖音图片地址推断真实格式', () => {
  const webp = 'https://p3-sign.douyinpic.com/tos-cn-i-0813c001/abc~tplv-dy-aweme-images:q75.webp?biz_tag=aweme_images&x-expires=1';
  const jpeg = 'https://p3-pc-sign.douyinpic.com/tos-cn-i-0813c001/ooEAQC2f7~tplv-dy-resize-origshort-autoq-75:330.jpeg?lk3s=138a59ce';

  assert.equal(extensionFromUrl(webp), 'webp');
  assert.equal(extensionFromUrl(jpeg), 'jpeg');
  // 抖音视频直链没有扩展名，返回空串交给调用方兜底。
  assert.equal(extensionFromUrl('https://v11-weba.douyinvod.com/c4776046ee773240c3a524d04acee9c1/6abc01'), '');
  assert.equal(extensionFromUrl('https://cdn.example.com/media.1/video'), '');
  assert.equal(extensionFromUrl('not a url'), '');
});

test('buildMediaAsset 让封面与原声也带上真实扩展名和 MIME', () => {
  const headers = { Referer: 'https://www.douyin.com/' };

  assert.equal(buildMediaAsset('', 'jpg', headers, 'images'), null);
  assert.equal(buildMediaAsset(undefined, 'jpg', headers, 'images'), null);
  assert.equal(buildMediaAsset('   ', 'jpg', headers, 'images'), null);

  const cover = buildMediaAsset('https://p3.douyinpic.com/a~tplv:330.jpeg?x=1', 'jpg', headers, 'images');
  assert.deepEqual(cover, {
    url: 'https://p3.douyinpic.com/a~tplv:330.jpeg?x=1',
    ext: 'jpeg',
    mimeType: 'image/jpeg',
    headers,
  });

  // 抖音原声地址没有扩展名，兜底 m4a（实测 ftypM4A + audio/mp4）。
  const music = buildMediaAsset('https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/abc', 'm4a', headers, 'audio');
  assert.equal(music.ext, 'm4a');
  assert.equal(music.mimeType, 'audio/mp4');
});

test('抖音视频结果同时带上封面与原声素材', async () => {
  const detail = {
    desc: '测试作品',
    author: { nickname: '测试作者' },
    video: {
      cover: { url_list: ['https://p3-pc-sign.douyinpic.com/cover~tplv-dy:330.jpeg?lk3s=1'] },
      duration: 12_345,
      cdn_url_expired: 1_790_706_785,
      bit_rate: [
        { bit_rate: 1_282_000, play_addr: { url_list: ['https://v11-weba.douyinvod.com/aaa/1'], width: 1080, height: 1920, data_size: 29_401_208 } },
      ],
    },
    music: { play_url: { url_list: ['https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/song'] } },
  };
  const result = await resolveDownloadTarget({
    url: 'https://v.douyin.com/TESTASSET1/',
    fetchImpl: createDouyinFetch(detail),
  });

  assert.equal(result.author, '测试作者');
  assert.equal(result.coverAsset.ext, 'jpeg');
  assert.equal(result.coverAsset.mimeType, 'image/jpeg');
  assert.equal(result.music.ext, 'm4a');
  assert.equal(result.music.mimeType, 'audio/mp4');
  assert.equal(result.music.headers.Referer, 'https://www.douyin.com/');
  assert.equal(result.qualities.length, 1);
  assert.equal(result.qualities[0].ext, 'mp4');
  assert.equal(result.qualities[0].mimeType, 'video/mp4');
  assert.equal(result.qualities[0].label, '1080P · 1282 kbps');
});

// 抖音链路只需要三样东西：ttwid 注册、短链跳转、详情接口。
function createDouyinFetch(detail) {
  return async (input) => {
    const url = String(input);
    if (url.startsWith('https://ttwid.bytedance.com/')) {
      return {
        url,
        headers: { getSetCookie: () => ['ttwid=stub-ttwid; Path=/'], get: () => '' },
        body: { cancel: async () => {} },
        async json() { return {}; },
      };
    }
    if (url.startsWith('https://www.douyin.com/aweme/v1/web/aweme/detail/')) {
      return {
        url,
        headers: { getSetCookie: () => [], get: () => '' },
        async json() { return { aweme_detail: detail }; },
      };
    }
    return {
      url: 'https://www.douyin.com/video/7380000000000000000',
      headers: { getSetCookie: () => [], get: () => '' },
      body: { cancel: async () => {} },
      async json() { return {}; },
    };
  };
}