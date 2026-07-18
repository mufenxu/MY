#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const TARGETS = {
  platform: {
    aliases: ['platform', 'platform-api'],
    acrRule: 'tags:build-platform-.*',
    tagPrefix: 'build-platform',
    composeService: 'platform-api',
    imageTag: 'platform-api-latest'
  },
  core: {
    aliases: ['core', 'core-api'],
    acrRule: 'tags:build-core-.*',
    tagPrefix: 'build-core',
    composeService: 'core-api',
    imageTag: 'core-api-latest'
  },
  exam: {
    aliases: ['exam', 'exam-api'],
    acrRule: 'tags:build-exam-.*',
    tagPrefix: 'build-exam',
    composeService: 'exam-api',
    imageTag: 'exam-api-latest'
  },
  notification: {
    aliases: ['notification', 'notification-service'],
    acrRule: 'tags:build-notification-.*',
    tagPrefix: 'build-notification',
    composeService: 'notification-service',
    imageTag: 'notification-service-latest'
  },
  backup: {
    aliases: ['backup', 'backup-runner'],
    acrRule: 'tags:build-backup-.*',
    tagPrefix: 'build-backup',
    composeService: 'backup-runner',
    imageTag: 'backup-runner-latest'
  },
  campus: {
    aliases: ['campus', 'campus-service'],
    acrRule: 'tags:build-campus-.*',
    tagPrefix: 'build-campus',
    composeService: 'campus-service',
    imageTag: 'campus-service-latest'
  },
  iot: {
    aliases: ['iot', 'iot-service'],
    acrRule: 'tags:build-iot-.*',
    tagPrefix: 'build-iot',
    composeService: 'iot-service',
    imageTag: 'iot-service-latest'
  },
  mongodb: {
    aliases: ['mongo', 'mongodb'],
    acrRule: 'tags:build-mongodb-.*',
    tagPrefix: 'build-mongodb',
    composeService: 'mongodb',
    imageTag: 'mongodb-7.0'
  }
};

const aliasMap = new Map();
for (const [target, metadata] of Object.entries(TARGETS)) {
  aliasMap.set(target, target);
  for (const alias of metadata.aliases) aliasMap.set(alias, target);
}

function usage() {
  const targets = Object.entries(TARGETS)
    .map(([target, metadata]) => `  ${target.padEnd(12)} ${metadata.acrRule.padEnd(26)} ${metadata.imageTag}`)
    .join('\n');

  return `Usage:
  npm run acr:build -- <target...> [--dry-run] [--suffix <text>]

Targets:
${targets}

Examples:
  npm run acr:build -- iot
  npm run acr:build -- core campus
  npm run acr:build -- iot --dry-run
  npm run acr:build -- all
`;
}

function parseArgs(argv) {
  const targets = [];
  let dryRun = false;
  let suffix = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--suffix') {
      suffix = argv[index + 1] || '';
      index += 1;
      continue;
    }

    for (const target of arg.split(',')) {
      const trimmed = target.trim();
      if (trimmed) targets.push(trimmed);
    }
  }

  if (targets.length === 0) {
    throw new Error(`Missing target.\n\n${usage()}`);
  }

  return { targets, dryRun, suffix };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result;
}

function git(args, options = {}) {
  return run('git', args, options);
}

function getOutput(command, args, options = {}) {
  return run(command, args, { ...options, capture: true }).stdout.trim();
}

function normalizeTargets(inputTargets) {
  const expanded = inputTargets.flatMap((target) => (target === 'all' ? Object.keys(TARGETS) : [target]));
  const selected = [];
  const seen = new Set();
  const invalid = [];

  for (const input of expanded) {
    const key = aliasMap.get(input);
    if (!key) {
      invalid.push(input);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(key);
    }
  }

  if (invalid.length > 0) {
    throw new Error(`Unknown ACR build target: ${invalid.join(', ')}\n\n${usage()}`);
  }

  return selected;
}

function formatTimestamp(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function normalizeSuffix(input, shortSha) {
  const suffix = input || `${formatTimestamp(new Date())}-${shortSha}`;
  if (!/^[0-9A-Za-z._-]+$/.test(suffix)) {
    throw new Error('Tag suffix may only contain letters, numbers, dots, underscores, and hyphens.');
  }
  return suffix;
}

function isDirty(repoRoot) {
  const unstaged = git(['diff', '--quiet'], { cwd: repoRoot, allowFailure: true, capture: true }).status !== 0;
  const staged = git(['diff', '--cached', '--quiet'], { cwd: repoRoot, allowFailure: true, capture: true }).status !== 0;
  return unstaged || staged;
}

function tagExists(repoRoot, tag) {
  const result = git(['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`], {
    cwd: repoRoot,
    allowFailure: true,
    capture: true
  });
  return result.status === 0;
}

function main() {
  const { targets, dryRun, suffix: suffixInput } = parseArgs(process.argv.slice(2));
  const selectedTargets = normalizeTargets(targets);
  const repoRoot = getOutput('git', ['rev-parse', '--show-toplevel']);
  const shortSha = getOutput('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot });
  const branch = getOutput('git', ['branch', '--show-current'], { cwd: repoRoot }) || 'detached';
  const suffix = normalizeSuffix(suffixInput, shortSha);

  if (isDirty(repoRoot)) {
    console.warn('Warning: local changes are not included in the build tag. Commit them first if they should be built.');
  }

  const plans = selectedTargets.map((target) => {
    const metadata = TARGETS[target];
    const tag = `${metadata.tagPrefix}-${suffix}`;
    return { target, tag, ...metadata };
  });

  for (const plan of plans) {
    if (tagExists(repoRoot, plan.tag)) {
      throw new Error(`Tag already exists locally: ${plan.tag}. Use --suffix with a new value.`);
    }
  }

  console.log(`ACR build trigger plan for ${shortSha} on ${branch}:`);
  for (const plan of plans) {
    console.log(`- ${plan.target}: ${plan.tag} -> ${plan.imageTag} (${plan.composeService})`);
  }

  if (dryRun) {
    console.log('\nDry run only. No tags were created or pushed.');
    return;
  }

  for (const plan of plans) {
    git(['tag', plan.tag], { cwd: repoRoot });
  }
  git(['push', 'origin', ...plans.map((plan) => plan.tag)], { cwd: repoRoot });

  console.log('\nAfter ACR finishes, deploy the selected services on the server:');
  for (const plan of plans) {
    console.log(`docker compose --env-file .env -f infra/docker/compose.yml pull ${plan.composeService}`);
    console.log(`docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build ${plan.composeService}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
