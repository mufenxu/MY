#!/usr/bin/env node

import { loadImageBuildGraph, resolveRequestedImageTargets } from "./resolve-image-targets.mjs";

const graph = await loadImageBuildGraph();

function usage() {
  const targets = Object.entries(graph.targets)
    .map(([target, metadata]) => `  ${target.padEnd(12)} ${metadata.tag}`)
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

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const selected = resolveRequestedImageTargets(args.join(','), graph);
  const targetsInput = selected.join(',');
  const services = selected.map((target) => graph.targets[target].composeService).join(' ');

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
  console.log('npm run compose:up');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
