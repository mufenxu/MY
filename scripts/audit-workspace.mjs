import { spawnSync } from 'node:child_process';
import { npmCommand } from './lib/npm-command.mjs';

const ALLOWED_ADVISORIES = new Set([
  'GHSA-qwww-vcr4-c8h2', // React Router RSC CSRF bypass (upstream unpatched range)
  'GHSA-mh99-v99m-4gvg', // brace-expansion
  'GHSA-vh45-f885-3048', // sm-crypto
  'CVE-2024-14257',
]);

const projects = [
  'apps/admin-console',
  'apps/official-website',
  'apps/core-admin',
  'apps/exam-admin',
  'apps/exam-miniapp',
  'apps/smart-campus-miniapp/miniprogram',
  'services/platform-api',
  'services/core-api',
  'services/exam-api',
  'services/campus-service',
  'services/iot-service',
  'services/notification-service',
];

let hasUnallowedVulnerabilities = false;

for (const project of projects) {
  const command = npmCommand(['--prefix', project, 'audit', '--omit=dev', '--json']);
  const result = spawnSync(command.command, command.args, { encoding: 'utf-8' });

  if (result.error) throw result.error;

  try {
    const json = JSON.parse(result.stdout || '{}');
    const vulnerabilities = json.vulnerabilities || {};

    for (const [name, vuln] of Object.entries(vulnerabilities)) {
      if (vuln.severity === 'high' || vuln.severity === 'critical') {
        const via = Array.isArray(vuln.via) ? vuln.via : [];
        const unallowed = via.filter((item) => {
          if (typeof item === 'object' && item.url) {
            const url = item.url;
            return !Array.from(ALLOWED_ADVISORIES).some((adv) => url.includes(adv));
          }
          return false;
        });

        if (unallowed.length > 0) {
          console.error(`[Security Audit] High/Critical vulnerability found in ${project} -> ${name}`);
          hasUnallowedVulnerabilities = true;
        }
      }
    }
  } catch (err) {
    if (result.status !== 0) {
      console.error(`[Security Audit] Audit failed for ${project}`);
      hasUnallowedVulnerabilities = true;
    }
  }
}

if (hasUnallowedVulnerabilities) {
  process.exit(1);
} else {
  console.log('✅ Workspace security audit passed cleanly.');
}
