const origin = 'http://127.0.0.1:22100';
const publicOrigin = process.env.PLATFORM_PUBLIC_ORIGIN;
const username = process.env.PLATFORM_ADMIN_USERNAME;
const password = process.env.CI_PLATFORM_ADMIN_PASSWORD;
const metricsToken = process.env.PLATFORM_METRICS_TOKEN;

for (const [name, value] of Object.entries({ publicOrigin, username, password, metricsToken })) {
  if (!value) throw new Error(`${name} is required.`);
}

async function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} returned ${response.status}: ${await response.text()}`);
  }
  return response;
}

await expectStatus(await fetch(`${origin}/api/readyz`), 200, 'readiness');
const login = await expectStatus(await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: publicOrigin },
  body: JSON.stringify({ username, password }),
}), 200, 'login');
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) throw new Error('Login did not return a session cookie.');

const authenticated = await expectStatus(await fetch(`${origin}/api/auth/status`, {
  headers: { Cookie: cookie },
}), 200, 'authenticated status');
if (!(await authenticated.json()).authenticated) throw new Error('MongoDB-backed session was not accepted.');

const metrics = await expectStatus(await fetch(`${origin}/api/metrics`, {
  headers: { Authorization: `Bearer ${metricsToken}` },
}), 200, 'metrics');
if (!(await metrics.text()).includes('my_platform_http_requests_total')) {
  throw new Error('Prometheus metrics payload is incomplete.');
}

await expectStatus(await fetch(`${origin}/api/auth/logout`, {
  method: 'POST',
  headers: { Cookie: cookie, Origin: publicOrigin },
}), 200, 'logout');
const revoked = await expectStatus(await fetch(`${origin}/api/auth/status`, {
  headers: { Cookie: cookie },
}), 200, 'revoked status');
if ((await revoked.json()).authenticated) throw new Error('Revoked MongoDB-backed session remained active.');

console.log('Platform readiness, MongoDB session issue/revoke, and metrics verified.');
