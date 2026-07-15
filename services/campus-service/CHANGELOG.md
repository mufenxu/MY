# Changelog

## Unreleased

### Compatibility

- Keep the teaching-evaluation actions on one mobile row and render eight-digit water codes as a single tabular-number line without overflowing narrow screens.
- Replace the WeChat top-level form-navigation workaround with the normal asynchronous login flow, avoiding the redirect boundary where X5 WebViews can discard an otherwise valid session cookie.
- Keep Secure, HttpOnly cookies as the primary authentication mechanism and add a persistent, origin-scoped header fallback only for `MicroMessenger` clients. Regular browsers cannot use this fallback.
- Persist the signed WeChat fallback in the dedicated `hgu_wechat_app_session_v1` key so closing and reopening the WebView retains the login, while expired records, logout and account session revocation still invalidate it.
- Set the default application session lifetime to 720 hours (30 days), pass it through Docker Compose, prefer the fresh WeChat header token over stale compatibility cookies and version the updated browser assets as `wechat-v6`.

### Engineering

- Serialize campus-session operations per user and query the UWC water code before its bill, preventing simultaneous token recovery from surfacing a false “account logged in elsewhere” error on first load.
- Add browser-storage and server integration regressions for WebView reopen persistence, 30-day expiry, cookie-free WeChat login, stale-cookie recovery and regular-browser isolation.
- Document the compatibility invariants that must be preserved when changing authentication, cookies or browser asset loading. This implementation supersedes the navigation-based workaround recorded in 0.2.3.

## 0.2.4 - 2026-07-13

### Reliability

- Redirect proxied HTTP requests to HTTPS before serving the login page so Secure session cookies are not lost in embedded browsers.
- Document the required Nginx port 80 to HTTPS redirect for public deployments.

## 0.2.3 - 2026-07-13

### Compatibility

- Submit system login as a top-level form navigation inside WeChat/X5 so the WebView persists the HttpOnly session cookie before loading protected APIs.
- Keep the existing asynchronous login flow for regular browsers and preserve the host-only, Secure, HttpOnly and SameSite cookie policy.
- Prefer the WeChat compatibility cookie when stale prefixed cookies remain from an earlier deployment.
- Version the updated browser assets to bypass immutable WebView caches.

### Engineering

- Add integration coverage for navigation-based WeChat login and mixed old/new cookie migration.

## 0.2.2 - 2026-07-12

### Compatibility

- Load the browser application as a deferred classic script so WeChat/X5 WebViews that ignore module scripts can submit the login form normally.
- Add a tightly scoped WeChat fallback for WebViews that reject `__Host-` cookies; the fallback remains host-only, Secure, HttpOnly and SameSite protected.
- Show an actionable Chinese compatibility message instead of silently reloading the login form when the embedded browser cannot execute the application.
- Add integration coverage proving that the embedded-browser cookie can authenticate and retains all required security attributes.

## 0.2.1 - 2026-07-12

### Reliability

- Serialize academic operations per user so WebVPN no longer rejects simultaneous timetable, GPA, classroom and evaluation requests with `failed in concurrency login`.
- Recover when the school gateway briefly reports a concurrent login after another request has already established the session.
- Upgrade legacy HTTP redirects from verified school hosts to HTTPS while continuing to reject external, credential-bearing and unapproved destinations.
- Refresh academic modules sequentially in the browser and version the application asset to prevent stale cached JavaScript.

### Engineering

- Extract and test the keyed serial queue and school redirect policy; the suite now covers failure cleanup, cross-user concurrency and redirect-origin isolation.
- Add an exact-host extension allow-list for future verified official school domains without weakening the default policy.

## 0.2.0 - 2026-07-12

### Security

- Encrypt school sessions and academic caches at rest with AES-256-GCM in production.
- Derive a domain-separated encryption fallback from the session secret for configuration-compatible upgrades, with automatic migration to a later independent data key.
- Move browser authentication to HttpOnly cookie-only sessions and revoke sessions after password or account-state changes.
- Add bounded login/API rate limits, trusted-proxy controls, upstream URL validation, response limits and audit logging.
- Stop retaining complete invitation codes after initial creation.

### Reliability

- Merge concurrent school-session updates transactionally to prevent lost cookies and tokens.
- Select a writable runtime UID/GID automatically across local bind mounts, NAS, NFS and CIFS storage; forbidden `chown` operations no longer cause restart loops.
- Add graceful shutdown, readiness checks, database busy timeout, bounded background work and multi-user timetable refresh.
- Add consistent online SQLite backups and production integration tests.

### Performance

- Add Brotli/gzip, ETag and immutable versioned-asset caching.
- Defer nonessential first-load requests, remove redundant upstream lookups and reduce the emblem asset from 222 KB to 44 KB.

### Engineering

- Add ESLint, Node test suites, CI quality gates, Dependabot, multi-architecture image publishing and hardened non-root containers.
- Extract reusable logging, rate-limiting, encrypted-storage and session-cookie modules under `src/lib`.
