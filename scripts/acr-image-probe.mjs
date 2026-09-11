#!/usr/bin/env node
// ACR 个人版实例镜像删除能力探测。
// 默认只读：列 tag、区分生产标签与可清理候选。
// 删除必须显式给出 --delete <tag> --yes，且受保护标签一律拒绝。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
].join(', ');

const EXTRA_PROTECTED_TAGS = [
  'latest',
  'deployment-runner-latest',
  'node-pool-latest',
  '__ACR_BUILD_SERVICE_INTERNAL_IMAGE_CACHE',
];

const CANDIDATE_PATTERN = /-(?:latest-)?[0-9a-f]{12}$/i;
const PAGE_SIZE = 200;
const MAX_PAGES = 30;
const PROBE_DIGEST = `sha256:${'0'.repeat(64)}`;

export function parseImageRepository(value) {
  const text = String(value || '').trim().replace(/^https?:\/\//, '').replace(/[:/]+$/, '');
  const [host, ...rest] = text.split('/');
  const name = rest.join('/');
  if (!host || !host.includes('.') || rest.length < 2) {
    throw new Error('镜像仓库需形如 <registry-host>/<namespace>/<name>');
  }
  return { host, name };
}

export function isProtectedTag(tag, protectedTags) {
  if (protectedTags.has(tag)) return true;
  if (tag.endsWith('-latest')) return true;
  return false;
}

export function isCleanupCandidate(tag) {
  return CANDIDATE_PATTERN.test(tag);
}

export function summarizeTags(tags, protectedTags) {
  const protectedList = [];
  const candidates = [];
  const others = [];
  for (const tag of tags) {
    if (isProtectedTag(tag, protectedTags)) protectedList.push(tag);
    else if (isCleanupCandidate(tag)) candidates.push(tag);
    else others.push(tag);
  }
  return { protectedList, candidates, others };
}

export function groupCandidates(candidates) {
  const groups = new Map();
  for (const tag of candidates) {
    const prefix = tag.replace(/-(?:latest-)?[0-9a-f]{12}$/i, '');
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(tag);
  }
  return [...groups.entries()]
    .map(([prefix, items]) => ({ prefix, items: items.sort() }))
    .sort((a, b) => b.items.length - a.items.length || a.prefix.localeCompare(b.prefix));
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function parseAuthChallenge(host, fetchImpl) {
  const response = await fetchImpl(`https://${host}/v2/`, { method: 'GET' });
  const header = response.headers.get('www-authenticate') || '';
  const realm = /realm="([^"]+)"/.exec(header)?.[1];
  const service = /service="([^"]+)"/.exec(header)?.[1];
  return { status: response.status, realm, service };
}

export async function fetchRegistryToken({ repository, scope, username, password, fetchImpl = fetch }) {
  const { host } = parseImageRepository(repository);
  const challenge = await parseAuthChallenge(host, fetchImpl);
  if (!challenge.realm) {
    if (challenge.status < 400) return { token: null, actions: [], anonymous: true };
    throw new Error(`registry 未返回 Bearer 认证信息（HTTP ${challenge.status}）`);
  }
  const url = new URL(challenge.realm);
  if (challenge.service) url.searchParams.set('service', challenge.service);
  url.searchParams.set('scope', scope);
  const headers = {};
  if (username && password) headers.Authorization = basicAuth(username, password);
  const response = await fetchImpl(url, { headers });
  if (response.status === 401) throw new Error('token 端点拒绝认证（ACR_USERNAME / ACR_PASSWORD 不正确或权限不足）');
  if (!response.ok) throw new Error(`token 端点返回 HTTP ${response.status}`);
  const body = await response.json();
  const token = body.token || body.access_token || null;
  if (!token) throw new Error('token 端点未返回 token');
  const declared = Array.isArray(body.access?.[0]?.actions) ? body.access[0].actions : [];
  const claims = decodeTokenClaims(token);
  const actions = declared.length ? declared : tokenActions(claims);
  return { token, actions, subject: claims?.sub || null, anonymous: !username };
}

export function decodeTokenClaims(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function tokenActions(claims) {
  const access = claims?.access;
  if (!Array.isArray(access)) return [];
  return [...new Set(access.flatMap((entry) => (Array.isArray(entry?.actions) ? entry.actions : [])))];
}

export async function listTags({ repository, token, fetchImpl = fetch }) {
  const { host, name } = parseImageRepository(repository);
  const tags = [];
  let last = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`https://${host}/v2/${name}/tags/list`);
    url.searchParams.set('n', String(PAGE_SIZE));
    if (last) url.searchParams.set('last', last);
    const response = await fetchImpl(url, { headers: authHeaders(token) });
    if (response.status === 401) throw new Error('列出 tag 需要认证：请设置 ACR_USERNAME / ACR_PASSWORD');
    if (!response.ok) throw new Error(`tags/list 返回 HTTP ${response.status}`);
    const body = await response.json();
    const batch = Array.isArray(body.tags) ? body.tags.filter(Boolean) : [];
    if (batch.length === 0) break;
    tags.push(...batch);
    last = batch[batch.length - 1];
    if (batch.length < PAGE_SIZE) break;
  }
  return [...new Set(tags)].sort();
}

export async function resolveTagDigest({ repository, tag, token, fetchImpl = fetch }) {
  const { host, name } = parseImageRepository(repository);
  const url = `https://${host}/v2/${name}/manifests/${encodeURIComponent(tag)}`;
  const head = await fetchImpl(url, { method: 'HEAD', headers: { ...authHeaders(token), Accept: MANIFEST_ACCEPT } });
  if (head.ok) {
    const digest = head.headers.get('docker-content-digest');
    if (digest) return digest.trim().toLowerCase();
  }
  if (head.status === 404) return null;
  const get = await fetchImpl(url, { method: 'GET', headers: { ...authHeaders(token), Accept: MANIFEST_ACCEPT } });
  if (!get.ok) return null;
  const digest = get.headers.get('docker-content-digest');
  if (digest) return digest.trim().toLowerCase();
  const { createHash } = await import('node:crypto');
  const buffer = Buffer.from(await get.arrayBuffer());
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export async function deleteManifest({ repository, reference, token, fetchImpl = fetch }) {
  const { host, name } = parseImageRepository(repository);
  const url = `https://${host}/v2/${name}/manifests/${encodeURIComponent(reference)}`;
  const response = await fetchImpl(url, {
    method: 'DELETE',
    headers: { ...authHeaders(token), Accept: MANIFEST_ACCEPT },
  });
  const text = await response.text().catch(() => '');
  return { status: response.status, ok: response.ok, body: text.slice(0, 400) };
}

export function interpretDeleteProbe(status) {
  if (status === 404) return '删除接口可用：不存在的 manifest 返回 404（MANIFEST_UNKNOWN），说明 registry 开放了删除。';
  if (status === 405 || status === 501) return '删除接口未开放：registry 返回 405/501，个人版实例可能不支持通过 API 删除镜像。';
  if (status === 401 || status === 403) return '权限不足：token 未授予删除权限，请检查 ACR 账号密码与仓库权限。';
  if (status === 400) return 'reference 格式不被接受：ACR 只允许按 digest 删除，不能按 tag 名删除。';
  if (status === 202 || status === 200) return '删除接口可用（返回 2xx）。';
  return `未预期状态码 ${status}，需要人工确认。`;
}

// 阿里云只有 scope 为 * 时才下发全权 token；pull,push,delete 会被降级为 pull,push。
export const FULL_SCOPE = '*';

export function canDelete(actions) {
  return actions.includes('*') || actions.includes('delete');
}

async function loadProtectedTags() {
  const tags = new Set(EXTRA_PROTECTED_TAGS);
  try {
    const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'image-build-targets.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    for (const target of Object.values(config.targets || {})) {
      if (target?.tag) tags.add(String(target.tag));
    }
  } catch {
    // 读不到配置时仍保留内置保护清单。
  }
  return tags;
}

function parseArgs(argv) {
  const args = { mode: 'list' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--list') args.mode = 'list';
    else if (token === '--probe-delete') args.mode = 'probe-delete';
    else if (token === '--delete') { args.mode = 'delete'; args.tag = argv[index + 1]; index += 1; }
    else if (token === '--repository') { args.repository = argv[index + 1]; index += 1; }
    else if (token === '--yes') args.yes = true;
    else if (token === '--help' || token === '-h') args.mode = 'help';
    else throw new Error(`未知参数：${token}`);
  }
  return args;
}

function resolveRepository(args) {
  const fromArgs = args.repository || process.env.ACR_IMAGE_REPOSITORY || process.env.PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY;
  if (fromArgs) return String(fromArgs).trim();
  const registry = String(process.env.ACR_REGISTRY || '').trim();
  if (registry) return `${registry}/mufenxu/my`;
  throw new Error('缺少镜像仓库：请设置 PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY 或使用 --repository <host>/<namespace>/<name>');
}

function credentials() {
  const username = String(process.env.ACR_USERNAME || '').trim();
  const password = String(process.env.ACR_PASSWORD || '');
  return { username, password, configured: Boolean(username && password) };
}

function printUsage() {
  console.log([
    'ACR 个人版镜像探测（默认只读）',
    '',
    '  node --env-file=.env scripts/acr-image-probe.mjs                      # 列 tag、区分生产标签与可清理候选',
    '  node --env-file=.env scripts/acr-image-probe.mjs --probe-delete       # 非破坏性探测删除能力（不删除真实镜像）',
    '  node --env-file=.env scripts/acr-image-probe.mjs --delete <tag> --yes # 删除指定 tag',
    '',
    '可选参数：--repository <host>/<namespace>/<name>',
    '环境变量：ACR_USERNAME / ACR_PASSWORD（删除与探测需要），PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY（默认仓库）',
  ].join('\n'));
}

async function runList(repository) {
  const { name } = parseImageRepository(repository);
  const { username, password } = credentials();
  const scope = `repository:${name}:pull`;
  const { token, anonymous } = await fetchRegistryToken({ repository, scope, username, password });
  const tags = await listTags({ repository, token });
  const protectedTags = await loadProtectedTags();
  const { protectedList, candidates, others } = summarizeTags(tags, protectedTags);
  console.log(`仓库：${repository}`);
  console.log(`认证：${anonymous ? '匿名 token（仓库公开）' : 'ACR 账号 token'}`);
  console.log(`tag 总数：${tags.length}｜生产/保护：${protectedList.length}｜可清理候选：${candidates.length}｜其它：${others.length}`);
  console.log('');
  console.log('保护标签（不会被删除）：');
  for (const tag of protectedList.sort()) console.log(`  - ${tag}`);
  if (others.length) {
    console.log('');
    console.log('其它标签（旧式 sha-*、node-pool-* 等，需人工判断）：');
    for (const tag of others.sort().slice(0, 40)) console.log(`  - ${tag}`);
    if (others.length > 40) console.log(`  ... 其余 ${others.length - 40} 个已省略`);
  }
  console.log('');
  console.log('可清理候选分组：');
  for (const group of groupCandidates(candidates)) {
    console.log(`  ${group.prefix}: ${group.items.length}`);
  }
  if (!candidates.length) console.log('  （无）');
}

async function runProbeDelete(repository) {
  const { name } = parseImageRepository(repository);
  const { username, password, configured } = credentials();
  console.log(`仓库：${repository}`);
  if (!configured) {
    console.log('未配置 ACR_USERNAME / ACR_PASSWORD：无法验证写入权限。');
    console.log('请在服务器上设置后重试，例如：ACR_USERNAME=<账号> ACR_PASSWORD=<密码> node --env-file=.env scripts/acr-image-probe.mjs --probe-delete');
    return;
  }
  const { token, actions, subject } = await fetchRegistryToken({
    repository,
    scope: `repository:${name}:${FULL_SCOPE}`,
    username,
    password,
  });
  if (subject) console.log(`token 主体：${subject}`);
  console.log(`token 授权动作：${actions.length ? actions.join(', ') : '未返回 actions 字段'}`);
  if (!canDelete(actions)) {
    console.log('结论：token 未授予删除权限，无法继续探测。');
    console.log('阿里云只在 scope 为 * 时下发全权 token，带 pull,push,delete 的 scope 会被降级为 pull,push。');
    console.log('请检查 ACR_USERNAME / ACR_PASSWORD 是否正确，以及该账号对该仓库是否有写入权限。');
    return;
  }
  const probe = await deleteManifest({ repository, reference: PROBE_DIGEST, token });
  console.log(`探测请求：DELETE /v2/${name}/manifests/${PROBE_DIGEST}（该 manifest 不存在，不会删除任何真实镜像）`);
  console.log(`返回状态码：${probe.status}`);
  if (probe.body) console.log(`返回内容：${probe.body}`);
  console.log(`结论：${interpretDeleteProbe(probe.status)}`);
  if (probe.status === 401 || probe.status === 403) {
    console.log('提示：若已配置 ACR 凭据仍返回 401/403，说明凭据未生效（阿里云在凭据错误时只下发匿名 token）。');
  }
  if (probe.status === 404 || probe.status === 202) {
    console.log('');
    console.log('下一步可选择一个废弃候选 tag 做真实删除验证：');
    console.log('  node --env-file=.env scripts/acr-image-probe.mjs --delete <tag> --yes');
  }
}

async function runDelete(repository, tag, confirmed) {
  if (!tag) throw new Error('--delete 需要指定 tag');
  if (!confirmed) {
    console.log(`将要删除：${tag}`);
    console.log('确认后在命令末尾追加 --yes 才会真正执行。');
    return;
  }
  const protectedTags = await loadProtectedTags();
  if (isProtectedTag(tag, protectedTags)) {
    throw new Error(`拒绝删除受保护标签：${tag}`);
  }
  const { name } = parseImageRepository(repository);
  const { username, password, configured } = credentials();
  if (!configured) throw new Error('删除需要 ACR_USERNAME / ACR_PASSWORD');
  const { token } = await fetchRegistryToken({ repository, scope: `repository:${name}:${FULL_SCOPE}`, username, password });
  const digest = await resolveTagDigest({ repository, tag, token });
  console.log(`tag：${tag}`);
  console.log(`digest：${digest || '未解析到，将按 tag 作为 reference 删除'}`);
  const result = await deleteManifest({ repository, reference: digest || tag, token });
  console.log(`返回状态码：${result.status}`);
  if (result.body) console.log(`返回内容：${result.body}`);
  console.log(result.ok ? '删除请求已被接受（ACR 存储空间为异步回收）。' : '删除失败，请查看上面的返回内容。');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'help') {
    printUsage();
    return;
  }
  const repository = resolveRepository(args);
  if (args.mode === 'list') return runList(repository);
  if (args.mode === 'probe-delete') return runProbeDelete(repository);
  if (args.mode === 'delete') return runDelete(repository, args.tag, args.yes);
  throw new Error(`未知模式：${args.mode}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
