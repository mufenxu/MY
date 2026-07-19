# Release Center

The release center uses four isolated responsibilities:

| Responsibility | Owner | Trust boundary |
| --- | --- | --- |
| Build and candidate verification | GitHub Actions | Repository workflow and GitHub secrets |
| Release history and approval | Admin console | MongoDB-backed platform application |
| Docker and Compose execution | Internal deployment Sidecar | Isolated backend-only container with Docker access |
| Runtime inventory | Internal deployment Sidecar | Read-only Docker inspection returned to the console |

The platform container never receives the Docker socket. Release records are stored in the `release_builds` and `release_deployments` collections so that every administrator sees the same history on every device.

## Safety model

Release writes remain disabled unless all required controls are present:

- `PLATFORM_RELEASE_ACTIONS_ENABLED=true`;
- a GitHub token that can read and dispatch the configured Actions workflow;
- a dedicated release callback token of at least 32 random characters;
- an allowlisted ACR repository;
- for deploy and rollback, a reachable internal deployment runner and a different strong bearer token.

Only `super_admin` can build, deploy, or roll back. Every operation rechecks the administrator password and TOTP when configured. Deployment accepts only an artifact emitted by a successful build callback. Image references must have the exact form `repository@sha256:<64 hex characters>` and must match the configured repository.

## GitHub configuration

Create a protected GitHub Environment named `production`, enable required reviewers, and restrict deployments to the `main` branch. Configure these Environment secrets:

```text
ALIYUN_ACR_USERNAME
ALIYUN_ACR_PASSWORD
PLATFORM_RELEASE_CALLBACK_TOKEN
```

Configure these Environment variables:

```text
PLATFORM_RELEASE_CALLBACK_URL=https://pxyb.cn/api/releases/callback
PLATFORM_RELEASE_CALLBACK_ORIGIN=https://pxyb.cn
```

`PLATFORM_RELEASE_CALLBACK_TOKEN` must match the platform environment and must not reuse the deployment-runner bearer token. The workflow does not accept a callback URL input. Its callback client requires HTTPS, an exact match with `PLATFORM_RELEASE_CALLBACK_ORIGIN`, the fixed `/api/releases/callback` path, no query string, and no redirects.

The ACR workflow waits for the exact commit's `ci.yml` run to pass. It then:

1. builds SHA-suffixed candidate images;
2. records each candidate manifest Digest;
3. starts the complete Compose stack with those exact candidates;
4. runs platform session, readiness, and metrics smoke checks;
5. promotes the verified candidates to the normal deployment tags;
6. sends the immutable artifact manifest to the release center.

If the callback is temporarily unavailable, GitHub history remains visible. A build without a validated callback manifest cannot be deployed from the release center.

## Platform environment

Add the following production values without enabling writes yet:

```text
PLATFORM_RELEASE_ACTIONS_ENABLED=false
PLATFORM_RELEASE_ENVIRONMENT=production
PLATFORM_RELEASE_CALLBACK_TOKEN=<random callback token>
PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY=crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my
PLATFORM_DEPLOY_HOOK_URL=http://deployment-runner:22104
PLATFORM_DEPLOY_HOOK_TOKEN=<different random runner token>
COMPOSE_PROFILES=release
DEPLOYMENT_RUNNER_IMAGE=crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:deployment-runner-latest
DEPLOY_RUNNER_WORKSPACE_ROOT=/absolute/path/to/MY
DEPLOY_RUNNER_COMPOSE_PATH=infra/docker/compose.yml
```

Recreate `platform-api` after changing these values. Keep the release action switch disabled until the runner checks below pass.

## Deployment Sidecar installation (recommended)

The recommended runner is an internal Compose Sidecar. It is not published through Nginx and has no host port. Only `platform-api` can reach it through the backend network.

### Image-only production directory

Source code is not required on the production host. A production directory may contain only `.env` and `docker-compose.yaml`. For example:

```text
/www/server/panel/data/compose/my/
├── .env
└── docker-compose.yaml
```

1. Keep release writes disabled and set the deployment layout in `.env`:

   ```text
   COMPOSE_PROFILES=release
   PLATFORM_RELEASE_ACTIONS_ENABLED=false
   DEPLOY_RUNNER_WORKSPACE_ROOT=/www/server/panel/data/compose/my
   DEPLOY_RUNNER_COMPOSE_PATH=docker-compose.yaml
   DEPLOY_RUNNER_ENV_FILE=.env
   PLATFORM_DEPLOY_HOOK_URL=http://deployment-runner:22104
   ```

2. Read the Docker Socket group ID on that host and record the returned number as `DEPLOY_RUNNER_DOCKER_GID` in `.env`:

   ```bash
   stat -c '%g' /var/run/docker.sock
   ```

3. Give the Sidecar group access to update `.env` atomically while keeping secrets unavailable to other users:

   ```bash
   cd /www/server/panel/data/compose/my
   DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
   chgrp "$DOCKER_GID" . .env docker-compose.yaml
   chmod 2770 .
   chmod 660 .env
   chmod 640 docker-compose.yaml
   ```

The Compose file mounts `DEPLOY_RUNNER_WORKSPACE_ROOT` at the identical absolute path inside the Sidecar. `DEPLOY_RUNNER_COMPOSE_PATH` must be relative, cannot escape that directory, and allows the production file to be renamed without requiring a source checkout. Build contexts in the file are never used by the release runner because all release operations use published images with `--no-build`.

### Source checkout

On a host that does contain a repository checkout, enter the repository root and prepare the environment while keeping release writes disabled. The command records the Linux absolute path, Docker Socket group ID, and the default `infra/docker/compose.yml` path:

   ```bash
   npm run release:sidecar:configure
   ```

The configuration command grants only that group read/write access to `.env` and the repository root. The Sidecar itself runs as a non-root user. The current public ACR repository needs no registry credentials inside the Sidecar.

### Start and verify

From the prepared deployment directory, use its actual Compose filename. For the image-only layout above:

   ```bash
   docker compose --env-file .env -f docker-compose.yaml --profile release config --quiet
   docker compose --env-file .env -f docker-compose.yaml --profile release pull deployment-runner platform-api
   docker compose --env-file .env -f docker-compose.yaml --profile release up -d --no-build --wait --wait-timeout 240 deployment-runner platform-api
   ```

Confirm the release center shows the runner as connected, all eight components are observed, and preflight returns no blocked checks for a non-database component. Then set `PLATFORM_RELEASE_ACTIONS_ENABLED=true` in `.env` and recreate only the platform container:

   ```bash
   docker compose --env-file .env -f docker-compose.yaml --profile release up -d --no-build --no-deps --force-recreate --wait --wait-timeout 240 platform-api
   ```

For a source checkout, `npm run release:sidecar:enable` may update the switch before the equivalent command using `-f infra/docker/compose.yml`.

The Sidecar mounts the Docker socket, workspace, production environment file, and protected state volume. Docker Socket access is effectively host-administrator access even for a non-root process in the socket group, so the Sidecar remains isolated on the internal network, accepts only its bearer token, validates repository Digests, and never serves browser traffic.

The release page checks for newer verified builds every minute and offers `一键更新` when one or more of the eight product components differ from the latest successful build. The deployment runner itself is deliberately excluded from this button: update the privileged infrastructure image explicitly with Compose so the executor never replaces itself mid-job.

To return an image-only deployment to read-only mode without changing running application images, set `PLATFORM_RELEASE_ACTIONS_ENABLED=false` and clear `PLATFORM_DEPLOY_HOOK_URL` in `.env`, then run:

```bash
docker compose --env-file .env -f docker-compose.yaml --profile release up -d --no-build --no-deps --force-recreate --wait --wait-timeout 240 platform-api
docker compose --env-file .env -f docker-compose.yaml --profile release stop deployment-runner
```

For a source checkout, the equivalent managed commands are:

```bash
npm run release:sidecar:disable
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --no-deps --force-recreate --wait --wait-timeout 240 platform-api
docker compose --env-file .env -f infra/docker/compose.yml --profile release stop deployment-runner
```

Remove the `deployment_runner_state` volume only when persisted runner reconciliation history is no longer required.

## Host runner installation (alternative)

For environments that prohibit Docker Socket mounts, the same runner can instead be installed on the Docker host. It must never run inside `platform-api`.

1. Create a dedicated `my-platform-deploy` account and grant only the Docker access required for this host.
2. Install [my-platform-deployment-runner.service](../infra/systemd/my-platform-deployment-runner.service) as `/etc/systemd/system/my-platform-deployment-runner.service`.
3. Create `/etc/my-platform/deployment-runner.env` from [deployment-runner.env.example](../infra/systemd/deployment-runner.env.example).
4. Create `/var/lib/my-platform-deployment-runner`, owned by the deployment account with mode `0700`.
5. Set `DEPLOY_RUNNER_ENABLED=true` only after all paths, tokens, and smoke URLs are correct.
6. Run `systemctl daemon-reload`, enable the service, and inspect its status and journal.

The default runner bind address is loopback. When `platform-api` reaches the host through `host.docker.internal`, bind the runner to a host or Docker-bridge address reachable from that container and restrict port `22104` with the host firewall. Never expose the runner directly to the public internet.

The runner performs these checks before accepting a deployment:

- runner configuration and explicit enablement;
- Docker Engine availability;
- Compose configuration validation;
- minimum free disk capacity;
- a trustworthy current Digest for every rollback point;
- explicit MongoDB policy enablement when MongoDB is selected.

It serializes deployment jobs with an exclusive lock, updates only allowlisted image keys in `.env`, recreates only selected services, waits for Compose health, runs configured smoke URLs, and restores the captured runtime Digests if any step fails. Jobs are persisted in the protected runner state directory and use idempotent request IDs.

## Activation sequence

Use this order for the first activation:

1. Deploy the new platform and deployment-runner images with release actions still disabled.
2. Configure the protected `production` GitHub Environment, callback variables, secret, required reviewers, and `main` branch restriction.
3. Start the deployment Sidecar and confirm `/status` and `/preflight` through the internal bearer-authenticated endpoint.
4. Confirm the release center shows the runner as connected and reports actual component state.
5. Trigger a manual GitHub build while the platform remains read-only and confirm its artifact manifest appears.
6. Set `PLATFORM_RELEASE_ACTIONS_ENABLED=true` and recreate `platform-api`.
7. Start with a non-database component and verify deployment, smoke checks, audit, notification, and rollback records.

Do not enable the switch merely to remove the read-only label. A missing callback or runner is a deployment blocker by design.

## Normal release

1. Select a successful build with immutable artifacts.
2. Select the components to deploy.
3. Run preflight checks.
4. Enter the administrator password, TOTP when enabled, and the displayed confirmation phrase.
5. Submit the deployment and monitor its persisted status.

The runner reports `succeeded`, `failed`, or `rolled_back`. Callback loss is reconciled from the runner's persisted job status when the release page refreshes.

## Rollback

Rollback targets are selected from historical successful deployments. The UI never accepts a manually typed image reference. Rollback is itself a new audited deployment job, and the runner still captures the currently running Digests before changing services.

MongoDB releases and rollbacks additionally require:

- a restorable backup inside the configured RPO;
- an active `mongodb` or `all` maintenance window in operations settings;
- explicit maintenance confirmation in the release center;
- `DEPLOY_RUNNER_ALLOW_MONGODB=true` on the active runner.

A schema or data migration may require restoring the complete pre-migration Compose bundle and data volumes. Image rollback alone is not a substitute for a database rollback plan.

## Break-glass operation

If the console or callback path is unavailable, keep the release switch disabled and use the documented server procedure with an exact Digest. Preserve the current runtime Digests and deployment files before changing Compose. Run readiness and application smoke checks before declaring success, and record the action in the incident or audit process.
