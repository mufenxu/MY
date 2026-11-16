import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadImageBuildGraph } from './resolve-image-targets.mjs';

const repoRoot = new URL('../../', import.meta.url);
const dockerDir = new URL('infra/docker/', repoRoot);

const dockerfileNames = (await readdir(dockerDir)).filter((name) => name.endsWith('.Dockerfile'));

function splitStages(source) {
  const stages = [];
  const lines = source.split('\n');
  let current = null;
  for (const line of lines) {
    const from = /^FROM\s+\S+(?:\s+AS\s+(\S+))?\s*$/i.exec(line);
    if (from) {
      current = { name: from[1] || '', lines: [] };
      stages.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return stages;
}

function buildStageApp(stage) {
  const workdir = stage.lines.map((line) => /^WORKDIR\s+(\S+)/i.exec(line)).find(Boolean);
  if (!workdir) return null;
  const match = /^\/build\/(apps|services)\/([^/]+)$/.exec(workdir[1].trim());
  return match ? { kind: match[1], name: match[2] } : null;
}

async function fileDependencies(kind, name) {
  const manifest = new URL(`${kind}/${name}/package.json`, repoRoot);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifest, 'utf8'));
  } catch {
    return [];
  }
  const dependencies = { ...parsed.dependencies, ...parsed.devDependencies };
  return Object.entries(dependencies)
    .filter(([, version]) => String(version).startsWith('file:'))
    .map(([dependency, version]) => ({
      dependency,
      // file:../../packages/foo -> foo
      packageDir: String(version).replace(/^file:/, '').replace(/[/\\]+$/, '').split(/[/\\]/).pop(),
    }));
}

test('each image build stage copies every local package the app installs', async () => {
  const problems = [];
  for (const name of dockerfileNames) {
    const source = await readFile(new URL(name, dockerDir), 'utf8');
    for (const stage of splitStages(source)) {
      const app = buildStageApp(stage);
      if (!app) continue;

      const installAt = stage.lines.findIndex((line) => /^RUN\s+npm\s+ci\b/.test(line));
      if (installAt < 0) continue;

      const copied = new Set();
      stage.lines.forEach((line, index) => {
        const copy = /^COPY\s+(?:--\S+\s+)*packages\/([^/\s]+)\//.exec(line);
        if (!copy) return;
        if (index > installAt) {
          problems.push(`${name}:${stage.name} 在 npm ci 之后才复制 packages/${copy[1]}，依赖解析会失败`);
          return;
        }
        copied.add(copy[1]);
      });

      for (const dependency of await fileDependencies(app.kind, app.name)) {
        if (!copied.has(dependency.packageDir)) {
          problems.push(
            `${name}:${stage.name} 构建 ${app.kind}/${app.name} 依赖 ${dependency.dependency}（packages/${dependency.packageDir}），但没有先复制该目录`,
          );
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('official website builds using only the sources copied into its Docker stage', async (t) => {
  const dockerfile = await readFile(new URL('platform-api.Dockerfile', dockerDir), 'utf8');
  const stage = splitStages(dockerfile).find((item) => item.name === 'official-website-build');
  assert.ok(stage, 'the platform image must build the official website');
  const buildAt = stage.lines.findIndex((line) => /^RUN\s+npm\s+run\s+build\b/.test(line));
  assert.ok(buildAt >= 0, 'the website stage must run its production build');

  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'my-website-docker-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  let workdir = '/';
  for (const line of stage.lines.slice(0, buildAt)) {
    const workdirMatch = /^WORKDIR\s+(\S+)/.exec(line);
    if (workdirMatch) workdir = path.posix.resolve(workdir, workdirMatch[1]);
    const copy = /^COPY\s+(\S+\/)\s+(\S+)\s*$/.exec(line);
    if (!copy) continue;
    const destination = path.join(fixtureRoot, path.posix.resolve(workdir, copy[2]).slice(1));
    await cp(new URL(copy[1], repoRoot), destination, {
      recursive: true,
      filter: (source) => {
        const name = path.basename(source);
        return !['node_modules', 'dist', 'test', '__tests__', '.git'].includes(name)
          && (!name.startsWith('.env') || name === '.env.example')
          && name !== 'project.private.config.json';
      },
    });
  }

  const appDirectory = path.join(fixtureRoot, workdir.slice(1));
  // 复用已安装的工具，源码仍由该阶段的 COPY 决定，避免测试联网安装依赖。
  await symlink(
    fileURLToPath(new URL('apps/official-website/node_modules/', repoRoot)),
    path.join(appDirectory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('apps/official-website/node_modules/vite/bin/vite.js', repoRoot)),
    'build',
  ], { cwd: appDirectory, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `website Docker stage build failed:\n${result.stdout}\n${result.stderr}`);
});

test('every shared package copied into an image triggers a rebuild of that image', async () => {
  const graph = await loadImageBuildGraph();

  // 一个 Dockerfile 影响哪些镜像目标：既包括直接引用它的目标，也包括规则里点名它的目标
  // （拆分部署用的 core-api / exam-api Dockerfile 没有独立目标，改动归到 platform）。
  const targetsByDockerfile = new Map();
  const addTarget = (dockerfile, target) => {
    const list = targetsByDockerfile.get(dockerfile) || [];
    list.push(target);
    targetsByDockerfile.set(dockerfile, list);
  };
  for (const [target, metadata] of Object.entries(graph.targets)) addTarget(metadata.dockerfile, target);
  for (const rule of graph.rules) {
    for (const path of rule.paths) {
      if (!path.startsWith('infra/docker/') || !path.endsWith('.Dockerfile')) continue;
      for (const target of rule.targets) {
        for (const key of target === '*' ? Object.keys(graph.targets) : [target]) addTarget(path, key);
      }
    }
  }

  const problems = [];
  for (const name of dockerfileNames) {
    const dockerfile = `infra/docker/${name}`;
    const targets = [...new Set(targetsByDockerfile.get(dockerfile) || [])];
    if (targets.length === 0) continue;
    const source = await readFile(new URL(name, dockerDir), 'utf8');
    const packages = new Set();
    for (const line of source.split('\n')) {
      const copy = /^COPY\s+(?:--\S+\s+)*packages\/([^/\s]+)\//.exec(line);
      if (copy) packages.add(copy[1]);
    }
    for (const packageDir of packages) {
      const covered = new Set();
      for (const rule of graph.rules) {
        if (!rule.paths.includes(`packages/${packageDir}/**`)) continue;
        for (const target of rule.targets) {
          if (target === '*') {
            for (const key of Object.keys(graph.targets)) covered.add(key);
          } else {
            covered.add(target);
          }
        }
      }
      for (const target of targets) {
        if (!covered.has(target)) {
          problems.push(`${dockerfile} 复制了 packages/${packageDir}，但 packages/${packageDir}/** 的变更不会触发 ${target} 重建`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the ACR workflow watches every shared package that images embed', async () => {
  const workflow = await readFile(new URL('.github/workflows/aliyun-acr.yml', repoRoot), 'utf8');
  const copied = new Set();
  for (const name of dockerfileNames) {
    const source = await readFile(new URL(name, dockerDir), 'utf8');
    for (const line of source.split('\n')) {
      const copy = /^COPY\s+(?:--\S+\s+)*packages\/([^/\s]+)\//.exec(line);
      if (copy) copied.add(copy[1]);
    }
  }

  const missing = [...copied].filter((packageDir) => !workflow.includes(`packages/${packageDir}/**`));
  assert.deepEqual(missing, []);
});
