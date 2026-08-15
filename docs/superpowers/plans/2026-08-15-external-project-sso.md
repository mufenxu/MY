# External Project SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure external-project registry and OAuth 2.1/OIDC login broker so the MY console and Android app can open independently deployed projects without another password.

**Architecture:** Extend the existing `admin-console` authentication boundary with a focused external application store and identity service. Persist registrations and one-time authorization codes in `platform_app`, sign standards-shaped ID/access tokens with a dedicated Ed25519 key, and expose launch APIs consumed by the console and Android without sharing the central session cookie across domains.

**Tech Stack:** Node.js 20, Express 5, MongoDB, Web Crypto-compatible PKCE, Ed25519 JWT/JWK, React 19/Vite, Kotlin/Jetpack Compose.

---

### Task 1: External application store

**Files:**
- Create: `apps/admin-console/src/external-application-store.js`
- Create: `apps/admin-console/test/external-application-store.test.js`
- Modify: `services/platform-api/src/runtime-paths.mjs`
- Modify: `services/platform-api/src/portal-store-lifecycle.mjs`
- Modify: `services/platform-api/src/server.mjs`

- [ ] Write failing tests proving client secrets are returned once, stored as hashes, redirect URIs are exact, updates preserve secrets, rotation invalidates the old secret, and authorization codes are one-time with TTL and PKCE metadata.
- [ ] Run `npm.cmd test -- test/external-application-store.test.js` from `apps/admin-console` and confirm failure because the module is missing.
- [ ] Implement memory and Mongo stores with `scrypt`, SHA-256 code hashing, unique indexes and TTL indexes.
- [ ] Wire the Mongo store into the platform runtime lifecycle and readiness checks.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: OIDC primitives and configuration

**Files:**
- Create: `apps/admin-console/src/external-identity.js`
- Create: `apps/admin-console/test/external-identity.test.js`
- Modify: `apps/admin-console/src/config.js`
- Modify: `.env.example`
- Create: `scripts/generate-external-auth-keys.mjs`
- Modify: `package.json`

- [ ] Write failing tests for PKCE S256 verification, JWT EdDSA signing, JWKS export, issuer/audience/expiry verification and safe OAuth error generation.
- [ ] Run the focused test and confirm the missing module failure.
- [ ] Implement compact JWT signing and verification using Node `crypto`, with no third-party token dependency.
- [ ] Add dedicated external-auth key configuration, development-only generated keys, production validation and a key generator command.
- [ ] Re-run the focused test and configuration tests.

### Task 3: OAuth/OIDC and management APIs

**Files:**
- Modify: `apps/admin-console/src/app.js`
- Create: `apps/admin-console/test/external-auth-api.test.js`

- [ ] Write failing API tests for discovery, JWKS, CRUD role protection, secret one-time display, launch generation, exact redirect validation, authorize login/role checks, token exchange, PKCE failure, code replay rejection and UserInfo.
- [ ] Run the focused API test and confirm the routes return 404.
- [ ] Add discovery and token routes before the authenticated `/api` middleware, then add authenticated management and launch routes under `/api/external-apps`.
- [ ] Extend safe login `returnTo` handling to allow only same-origin `/oauth/authorize` requests.
- [ ] Record registration, rotation, launch, authorize and token outcomes through the existing audit store.
- [ ] Re-run the focused API tests.

### Task 4: External application health status

**Files:**
- Create: `apps/admin-console/src/external-application-service.js`
- Create: `apps/admin-console/test/external-application-service.test.js`
- Modify: `apps/admin-console/src/app.js`

- [ ] Write failing tests for HTTPS/loopback URL validation, timeout-bounded health checks, disabled applications and sanitized client responses.
- [ ] Implement list/detail/health aggregation without adding external applications to internal SLO or incident calculations.
- [ ] Expose `GET /api/external-apps` and refresh support.
- [ ] Re-run the focused tests.

### Task 5: Console external application panel

**Files:**
- Create: `apps/admin-console/src/client/ExternalApplicationsView.jsx`
- Modify: `apps/admin-console/src/client/App.jsx`
- Modify: `apps/admin-console/src/client/navigation.js`
- Modify: `apps/admin-console/src/client/styles.css`
- Modify: `apps/admin-console/test/navigation.test.js`
- Modify: `apps/admin-console/test/frontend-resilience.test.js`

- [ ] Add failing source-level tests for the navigation entry, external application API usage, secret reveal-once dialog and launch endpoint.
- [ ] Add a dedicated “外部应用” navigation view using existing controls and Lucide icons.
- [ ] Implement list, health refresh, create/edit/disable/delete/rotate flows for `super_admin`, and open-only behavior for lower roles.
- [ ] Make launch call the server first and navigate only to the returned short-lived URL.
- [ ] Run focused frontend tests and `npm.cmd run build`.

### Task 6: Android external application integration

**Files:**
- Modify: `apps/android-app/app/src/main/java/cn/pxyb/mycontrol/data/Models.kt`
- Modify: `apps/android-app/app/src/main/java/cn/pxyb/mycontrol/data/PlatformApi.kt`
- Modify: `apps/android-app/app/src/main/java/cn/pxyb/mycontrol/ui/AppViewModel.kt`
- Modify: `apps/android-app/app/src/main/java/cn/pxyb/mycontrol/ui/OverviewScreen.kt`
- Create: `apps/android-app/app/src/test/java/cn/pxyb/mycontrol/data/ExternalApplicationParsingTest.kt`

- [ ] Write a failing parser test for external application and launch payloads.
- [ ] Add immutable external application models and API methods for list and launch.
- [ ] Load external applications with the overview while preserving cached internal service behavior.
- [ ] Add a separate external-applications section using existing list-row visuals; use `PlatformWebActivity` for `webview` and `ACTION_VIEW` for `browser`.
- [ ] Run the focused Kotlin test and `compileDebugKotlin`.

### Task 7: Integration documentation and adapter

**Files:**
- Create: `docs/external-project-sso.md`
- Create: `examples/external-sso-express/app.mjs`
- Create: `examples/external-sso-express/package.json`
- Create: `examples/external-sso-express/README.md`

- [ ] Document registration, DNS/TLS prerequisites, redirect URI rules, discovery, token validation, role mapping, logout limitations and troubleshooting.
- [ ] Add a minimal Express reference that generates `state` and PKCE, redirects to MY, exchanges the code on its backend, verifies the ID Token against JWKS and creates an HttpOnly local session.
- [ ] Run `node --check examples/external-sso-express/app.mjs`.

### Task 8: Final verification

**Files:**
- Review all changed files.

- [ ] Run the focused admin-console tests covering stores, identity, API, navigation and frontend sources.
- [ ] Run `npm.cmd run build` in `apps/admin-console`.
- [ ] Run `npm.cmd run check` only if focused failures indicate shared platform risk; otherwise keep validation scoped.
- [ ] Run the Android focused unit test and `compileDebugKotlin`.
- [ ] Run `git diff --check` and inspect `git diff --stat` plus the final task-only diff.
- [ ] Confirm no real credentials, `.env` values, commits, pushes or deployment changes were created.
