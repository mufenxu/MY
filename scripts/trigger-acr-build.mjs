#!/usr/bin/env node

const TARGETS = {
  platform: {
    aliases: ['platform', 'platform-api'],
    composeService: 'platform-api',
    imageTag: 'platform-api-latest',
  },
  core: {
    aliases: ['core', 'core-api'],
    composeService: 'core-api',
    imageTag: 'core-api-latest',
  },
  exam: {
    aliases: ['exam', 'exam-api'],
    composeService: 'exam-api',
    imageTag: 'exam-api-latest',
  },
  notification: {
    aliases: ['notification', 'notification-service'],
    composeService: 'notification-service',
    imageTag: 'notification-service-latest',
  },
  backup: {
    aliases: ['backup', 'backup-runner'],
    composeService: 'backup-runner',
    imageTag: 'backup-runner-latest',
  },
  campus: {
    aliases: ['campus', 'campus-service'],
    composeService: 'campus-service',
    imageTag: 'campus-service-latest',
  },
  iot: {
    aliases: ['iot', 'iot-service'],
    composeService: 'iot-service',
    imageTag: 'iot-service-latest',
  },
  mongodb: {
    aliases: ['mongo', 'mongodb'],
    composeService: 'mongodb',
    imageTag: 'mongodb-7.0',
  },
};

const aliasMap = new Map();
for (const [target, metadata] of Object.entries(TARGETS)) {
  aliasMap.set(target, target);
  for (const alias of metadata.aliases) aliasMap.set(alias, target);
}

function usage() {
  const targets = Object.entries(TARGETS)
    .map(([target, metadata]) => `  ${target.padEnd(12)} ${metadata.imageTag}`)
    .join('\n');

  return `Usage:
  npm run acr:build -- <target...>

This no longer pushes Git tags for Alibaba Cloud ACR build rules.
Use GitHub Actions -> "Build and push Aliyun ACR images" instead.

Targets:
${targets}

Examples:
  npm run acr:build -- platform backup
  npm run acr:build -- iot
  npm run acr:build -- all
`;
}

function normalizeTargets(args) {
  const rawTargets = args.flatMap((arg) => arg.split(',').map((target) => target.trim()).filter(Boolean));
  const expanded = rawTargets.flatMap((target) => (target === 'all' ? Object.keys(TARGETS) : [target]));
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
    throw new Error(`Unknown ACR image target: ${invalid.join(', ')}\n\n${usage()}`);
  }
  if (selected.length === 0) {
    throw new Error(`Missing target.\n\n${usage()}`);
  }
  return selected;
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const selected = normalizeTargets(args);
  const targetsInput = selected.join(',');
  const services = selected.map((target) => TARGETS[target].composeService).join(' ');

  console.log('Alibaba Cloud ACR is now used as an image registry only.');
  console.log('Builds are run from GitHub Actions, not from ACR source build rules.');
  console.log('Pushes to main automatically build affected images based on changed files.\n');
  console.log('For retries or explicit target selection, open GitHub -> Actions -> "Build and push Aliyun ACR images" -> Run workflow.');
  console.log(`Set targets to: ${targetsInput}`);
  console.log('Keep push_sha_tags enabled unless you are intentionally skipping immutable tags.\n');
  console.log('Required GitHub repository secrets:');
  console.log('- ALIYUN_ACR_USERNAME');
  console.log('- ALIYUN_ACR_PASSWORD\n');
  console.log('After the workflow succeeds, deploy on the server:');
  console.log(`docker compose --env-file .env -f infra/docker/compose.yml pull ${services}`);
  console.log(`docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build ${services}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
