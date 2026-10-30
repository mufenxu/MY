import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { npmCommand } from "../lib/npm-command.mjs";

const projects = JSON.parse(readFileSync(new URL("../../config/workspace-projects.json", import.meta.url), 'utf8'));

for (const project of projects) {
  console.log(`\nInstalling ${project}`);
  const command = npmCommand(['ci', '--prefix', project, '--no-audit', '--no-fund']);
  const result = spawnSync(command.command, command.args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
