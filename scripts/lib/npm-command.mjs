import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function npmCommand(args, {
  env = process.env,
  execPath = process.execPath,
  platform = process.platform,
  fileExists = existsSync,
} = {}) {
  const candidates = [
    env.npm_execpath,
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => candidate.endsWith('.js') && fileExists(candidate));
  if (npmCli) return { command: execPath, args: [npmCli, ...args] };
  if (platform === 'win32') {
    return {
      command: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args],
    };
  }
  return { command: 'npm', args };
}
