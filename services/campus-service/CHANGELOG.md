# Changelog

## Unreleased

### Features

- Replace the school account form with a single SMS-code sign-in: the 学号/工号 + password fields and the "改用短信验证码登录" toggle are gone, and the code panel is now the only way to connect a school account.
- Rebuild that panel as a proper card (badge, labelled fields, `+86` prefix, inline 获取验证码 with countdown, remember-me, gradient submit, tone-coloured hints) with light/dark variants.
- Merge the web reservation area into one `预约` navigation entry with `研讨间` and `图书馆座位` top-level tabs, so the mobile quick nav keeps seven items instead of adding a second reservation entry.
- Add a discussion-room records tab with cancel, end-of-use and reschedule; reschedule follows the upstream cancel-then-recreate flow and states that warning before the second confirmation.
- Add slot-based room lookup on the discussion-room booking tab, reusing `spaces?date&startTime&endTime` (and `excludeReservationId` while rescheduling).
- Add a library-seat workspace: overview and area cards, seat list, a floor plan rendered from `querySeatLayout` coordinates, per-seat timeline, seat booking, current-use check-in/leave/stop, today/history/breach/door records and waitlist task management.
- Split the two library-seat automations into genuinely different features. The web console's 自动预约任务 is now a **scheduled** task: it runs once at the date/time the user picks (run date defaults to target minus one day, run time to 21:55), picks a seat by priority — requested labels, then neighbouring labels, then the 1–45 range, then any free seat in the area — and ends as soon as it books one or after three consecutive rounds confirm the whole area is taken. It lives in its own `library_seat_auto_tasks` collection behind `/api/campus/library-seat/auto-tasks`, with its own run plan, scheduler pass and tests. The Android 候补预约 keeps the original continuous-watcher behaviour on `/api/campus/library-seat/waitlists`; the two never share a row or a query.
- Link the campus identity code from the reservation tabs by reusing the existing `#campus` card instead of duplicating it.
- Collapse the remaining reading-area cards once one is picked, leaving the selected card plus an “展开其他 N 个阅览区” control, so a ten-area list no longer pushes the seat panel below the fold.
- Load the discussion-room auto-reservation task list on first paint, so the panel never sits on “正在加载自动预约任务…” when its tab activation event is missed.
- Keep the discussion-room run time at `07:00` and describe its rule inline (rooms open three days ahead, run date defaults to target minus three days), so the two automation features stay visibly distinct.

### Compatibility

- Fit the overview dashboard to 1280-1499px viewports: the four-column bento now uses shrinkable tracks, switches to a three-column arrangement in that range, and the login panel adapts through container queries instead of fixed field widths.
- Draw the library-seat floor plan at its real density: seat tiles are placed in pixels on a canvas sized from the coordinate spacing, so a 188-seat reading area keeps every label legible instead of smearing them into one blob, and the plan scrolls inside its own box when the room is wider than the screen.
- Reserve the iOS safe-area inset under the fixed bottom navigation, keep form controls at 16px on phones so iOS cannot zoom the page on focus, and cap the confirmation dialog at the viewport height.
- Keep the teaching-evaluation actions on one mobile row and render eight-digit water codes as a single tabular-number line without overflowing narrow screens.
- Use `HGU_PUBLIC_ORIGIN` for trusted-proxy HTTPS redirects so a WeChat visit to `hgu.pxyb.cn` cannot be redirected to the loopback upstream host.
- Fall back to native form submission in WeChat only when the asynchronous system-login request fails or times out, preserving the persistent header-token flow as the primary path.
- Replace the WeChat top-level form-navigation workaround with the normal asynchronous login flow, avoiding the redirect boundary where X5 WebViews can discard an otherwise valid session cookie.
- Keep Secure, HttpOnly cookies as the primary authentication mechanism and add a persistent, origin-scoped header fallback only for `MicroMessenger` clients. Regular browsers cannot use this fallback.
- Persist the signed WeChat fallback in the dedicated `hgu_wechat_app_session_v1` key so closing and reopening the WebView retains the login, while expired records, logout and account session revocation still invalidate it.
- Set the default application session lifetime to 720 hours (30 days), pass it through Docker Compose, prefer the fresh WeChat header token over stale compatibility cookies and version the updated browser assets as `wechat-v6`.

### Engineering

- Keep the SMS login flow in `sms-login.js` (now linted) with sanitised digits-only input, deadline-based cooldown that survives tab switches, and re-send invalidation when the phone number changes; the password login handler and its auto-relogin preference are removed from `app.js`.
- Add `ui-refresh.css` for the login card and the cross-page mobile fixes, register it in `index.html` and the asset budgets, and raise the `index.html` budget from 42KB to 44KB for the new markup.
- Serialize campus-session operations per user and query the UWC water code before its bill, preventing simultaneous token recovery from surfacing a false “account logged in elsewhere” error on first load.
- Split the reservation UI into `reservation-hub.js`, `libroom-page.js`, `libroom-records-page.js`, `libroom-auto-page.js` and `library-seat-page.js`, each with its own stylesheet, and register them in `check`, `lint` and the static asset budgets.
- Version every reservation script and stylesheet in `index.html`, because `?v=` responses are served `immutable` for a year: an unbumped URL keeps serving the first copy after an edit. `reservation-hub.js` also normalises its own DOM on start-up (extra `预约` nav entries, stray `#reservation` sections, legacy panels) so a double include can never render two entries.
- Keep reservation state in memory only; nothing is written to `localStorage`, so switching platform accounts in the same browser cannot leak another user's school reservations.
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
