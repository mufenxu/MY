#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const graphUrl = new URL('../config/image-build-targets.json', import.meta.url);

export async function loadImageBuildGraph(url = graphUrl) {
  const graph = JSON.parse(await readFile(url, 'utf8'));
  const targetNames = Object.keys(graph.targets || {});
  if (graph.schemaVersion !== 1 || targetNames.length === 0 || !Array.isArray(graph.rules)) {
    throw new Error('Image build target graph is invalid.');
  }
  for (const rule of graph.rules) {
    if (!Array.isArray(rule.paths) || !Array.isArray(rule.targets)) throw new Error('Image build rule is invalid.');
    for (const target of rule.targets) {
      if (target !== '*' && !graph.targets[target]) throw new Error(`Image build rule references unknown target: ${target}`);
    }
  }
  return graph;
}

function normalizePath(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesPath(filename, pattern) {
  const normalizedFilename = normalizePath(filename);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith('/**')) {
    return normalizedFilename.startsWith(normalizedPattern.slice(0, -2));
  }
  return normalizedFilename === normalizedPattern;
}

function orderedSelection(graph, selected) {
  return Object.keys(graph.targets).filter((target) => selected.has(target));
}

export function resolveChangedImageTargets(files, graph) {
  const selected = new Set();
  for (const filename of files.map(normalizePath).filter(Boolean)) {
    for (const rule of graph.rules) {
      if (!rule.paths.some((pattern) => matchesPath(filename, pattern))) continue;
      const targets = rule.targets.includes('*') ? Object.keys(graph.targets) : rule.targets;
      for (const target of targets) selected.add(target);
    }
  }
  return orderedSelection(graph, selected);
}

export function resolveRequestedImageTargets(value, graph) {
  const aliases = new Map();
  for (const [target, metadata] of Object.entries(graph.targets)) {
    aliases.set(target, target);
    for (const alias of metadata.aliases || []) aliases.set(alias, target);
  }
  const requested = String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (requested.includes('all')) return Object.keys(graph.targets);
  const selected = new Set();
  for (const item of requested) {
    const target = aliases.get(item);
    if (!target) throw new Error(`Unknown image target: ${item}`);
    selected.add(target);
  }
  if (selected.size === 0) throw new Error('At least one image target is required.');
  return orderedSelection(graph, selected);
}

export function releaseArtifactTargets(targets, graph) {
  return targets.filter((target) => graph.targets[target]?.releaseArtifact !== false);
}

function readArgument(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? '' : args[index + 1] || '';
}

async function main() {
  const args = process.argv.slice(2);
  const graph = await loadImageBuildGraph();
  const manual = readArgument(args, '--manual');
  const fileList = readArgument(args, '--files');
  const outputFile = readArgument(args, '--github-output');
  let targets;
  if (manual) {
    targets = resolveRequestedImageTargets(manual, graph);
  } else if (fileList) {
    targets = resolveChangedImageTargets((await readFile(fileList, 'utf8')).split(/\r?\n/), graph);
  } else {
    throw new Error('Use --manual <targets> or --files <changed-files.txt>.');
  }

  const resolved = targets.join(',');
  const releaseTargets = releaseArtifactTargets(targets, graph).join(',');
  console.log(`Resolved targets: ${resolved || '(none)'}`);
  if (outputFile) {
    await appendFile(outputFile, `targets=${resolved}\nrelease_targets=${releaseTargets}\n`);
  } else {
    console.log(resolved);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
