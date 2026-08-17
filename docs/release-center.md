# Release Build Center

The release build center has two responsibilities:

| Responsibility | Owner | Trust boundary |
| --- | --- | --- |
| Build and candidate verification | GitHub Actions | Repository workflow and GitHub secrets |
| Build history and manual build trigger | Admin console | MongoDB-backed platform application |

The admin console does not access the Docker socket, execute Compose commands, deploy images, inspect running containers, or provide rollback controls. Verified build records are stored in the `release_builds` collection so every administrator sees the same history.

## Safety model

Manual build triggers remain disabled unless all required controls are present:

- `PLATFORM_RELEASE_ACTIONS_ENABLED=true`;
- a GitHub token that can read and dispatch the configured Actions workflow;
- a dedicated release callback token of at least 32 random characters;
- an allowlisted ACR repository.

Only `super_admin` can trigger a build. The operation rechecks the administrator password and TOTP when configured. Build callbacks accept artifacts only from the configured repository, and immutable references must have the form `repository@sha256:<64 hex characters>`.

## GitHub configuration

Create a protected GitHub Environment named `production`, enable required reviewers, and restrict it to the `main` branch. Configure these Environment secrets:

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

`PLATFORM_RELEASE_CALLBACK_TOKEN` must match the platform environment. The workflow does not accept a callback URL input. Its callback client requires HTTPS, an exact match with `PLATFORM_RELEASE_CALLBACK_ORIGIN`, the fixed `/api/releases/callback` path, no query string, and no redirects.

The ACR workflow waits for the exact commit's `ci.yml` run to pass. It then:

1. builds SHA-suffixed candidate images;
2. records each candidate manifest Digest;
3. starts the complete Compose smoke stack with those exact candidates;
4. runs platform session, readiness, and metrics smoke checks;
5. promotes the verified candidates to the normal image tags;
6. sends the immutable artifact manifest to the build center.

If the callback is temporarily unavailable, GitHub history remains visible. Callback-verified artifacts are restored from the workflow artifact manifest when available.

## Platform environment

Configure the platform without enabling manual build triggers first:

```text
PLATFORM_GITHUB_REPOSITORY=mufenxu/MY
PLATFORM_GITHUB_TOKEN=<GitHub token>
PLATFORM_GITHUB_WORKFLOW=aliyun-acr.yml
PLATFORM_GITHUB_REF=main
PLATFORM_RELEASE_ACTIONS_ENABLED=false
PLATFORM_RELEASE_ENVIRONMENT=production
PLATFORM_RELEASE_CALLBACK_TOKEN=<random callback token>
PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY=crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my
```

Recreate `platform-api` after changing these values. Confirm that GitHub workflow history and callback artifacts appear, then set `PLATFORM_RELEASE_ACTIONS_ENABLED=true` only when administrators need the manual build button.

## Building images

Pushes to `main` build affected images automatically. In the admin console, a `super_admin` can also select image targets and trigger the configured GitHub Actions workflow. The page shows GitHub workflow state, callback-verified artifacts, timestamps, and errors; it does not change production containers.

## Updating production

Production updates remain an explicit server operation. After a build succeeds, preserve the current image references, update `.env` when pinning an immutable Digest, then pull and recreate the selected services:

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull platform-api backup-runner
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate --wait platform-api backup-runner
```

Run readiness and application smoke checks before considering the server update complete. Do not use a mutable `latest` reference as a rollback point. For MongoDB image updates, take a restorable backup first and confirm the data migration rollback plan.
