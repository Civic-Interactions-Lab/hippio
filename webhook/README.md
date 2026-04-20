# Hippio – GitHub Webhook Auto-Deploy

A lightweight, self-hosted webhook receiver that listens for GitHub `push` events and rebuilds the application from source on the server. No Portainer, no Watchtower, no inbound SSH deployment.

## How it works

1. GitHub sends a `push` event to `http://YOUR_SERVER:9000/github-webhook`
2. The webhook server validates the `X-Hub-Signature-256` header
3. If the repo and branch match, it runs `deploy.sh` which:
   - marks the configured mounted repo as a Git `safe.directory`
   - fetches and checks out the configured branch in the mounted repo directory
   - pulls the latest code from GitHub
   - `docker compose up -d --build --remove-orphans` to rebuild & restart

Because `docker compose up --build` only recreates containers whose images or config changed, an explicit `docker compose down` is **not** needed and would cause unnecessary downtime.

## Prerequisites

- The application repo must already be cloned on the server (e.g. `/opt/hippio`)
- The cloned repo must be able to pull from GitHub from inside this container, using HTTPS or outbound SSH Git auth
- Docker and Docker Compose must be installed on the host
- The webhook container needs access to the Docker socket
- The app repo is mounted at the same absolute path inside the webhook container as it has on the host

## Quick start

```bash
# On your server
cd /opt/hippio-webhook   # or wherever you place this directory

# 1. Create your .env
cp .env.example .env
# Edit .env:
# - set WEBHOOK_SECRET to a strong random value
# - set HOST_REPO_DIR to your app repo path, such as /opt/hippio
# - set HOST_SSH_DIR if private GitHub repos need SSH keys for git pull
# - set REPO_FULL_NAME to your GitHub owner/repo
# - set REPO_BRANCH to the branch you deploy, such as main

# 2. Build & start
docker compose up -d --build
```

## Configure the GitHub webhook

1. Go to **Settings → Webhooks → Add webhook** in your GitHub repo
2. **Payload URL:** `http://YOUR_SERVER_IP:9000/github-webhook`
3. **Content type:** `application/json`
4. **Secret:** paste the same value as `WEBHOOK_SECRET` in your `.env`
5. **Events:** select **Just the push event**
6. Save

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the webhook listens on | `9000` |
| `WEBHOOK_SECRET` | GitHub webhook secret (required) | – |
| `REPO_FULL_NAME` | GitHub `owner/repo` to accept | `owner/repo` |
| `REPO_BRANCH` | Branch to deploy on push | `main` |
| `HOST_REPO_DIR` | Repo path **on the host** (for volume mount) | `/opt/hippio` |
| `HOST_SSH_DIR` | Optional host SSH directory mounted read-only for outbound Git pulls | `~/.ssh` |

## Docker socket path behavior

The webhook container talks to the host Docker daemon through `/var/run/docker.sock`. That means any bind mount paths in the app's `docker-compose.yml` must be valid paths on the host.

For example, if the app compose contains:

```yaml
volumes:
  - ./frontend-nginx.conf:/etc/nginx/nginx.conf:ro
```

Compose resolves that relative path against the project directory and sends the absolute source path to Docker. If the webhook runs Compose from `/workspace`, Docker receives `/workspace/frontend-nginx.conf`, but the host usually does not have `/workspace`. The deployment will fail with a "Mounts denied" error.

To avoid that, this webhook mounts the app repo at the same absolute path inside the webhook container as it has on the host, such as `/opt/hippio:/opt/hippio`, and sets `APP_REPO_DIR` to that same path.

## Git safe.directory

Because the repo is bind-mounted from the host, Git inside the webhook container may see that the repository is owned by a different user. Recent Git versions protect against that and can fail with:

```text
fatal: detected dubious ownership in repository
```

The deploy script handles this by adding the configured `APP_REPO_DIR` to Git's global `safe.directory` list before running `git fetch`.

## Troubleshooting GitHub DNS

If deployment fails with:

```text
Could not resolve host: github.com
```

the webhook is receiving requests correctly, but the container cannot resolve or reach GitHub for outbound Git operations. Check DNS from inside the webhook container:

```bash
docker compose exec webhook getent hosts github.com
docker compose exec webhook git ls-remote origin
```

If DNS fails only inside containers, configure Docker's DNS on the host or add a `dns:` section to the webhook service, for example:

```yaml
dns:
  - 1.1.1.1
  - 8.8.8.8
```

Also make sure the server allows outbound DNS and HTTPS traffic.

## Git access

The deployment is based on the checked-out repo, not registry images. The repo at `HOST_REPO_DIR` must already exist on the server and be a valid Git checkout. If the repository is private, configure the checkout so `git pull origin main` works inside the webhook container.

For private repos, you can use either an HTTPS remote with a suitable token or an SSH remote using the read-only `HOST_SSH_DIR` mount. That SSH access is only for outbound Git operations from the webhook container to GitHub. The deployment is still triggered by GitHub's HTTPS webhook and does not require SSHing into the server.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/github-webhook` | Receives GitHub webhook events |
| `GET` | `/health` | Returns deploy status (idle/deploying, last result, timestamp) |

## Security notes

- The webhook secret is validated via HMAC SHA-256 on every request
- All subprocess calls use argument arrays (no shell injection)
- Secrets are only read from environment variables, never hardcoded
- A lock prevents concurrent deployments
- Repo and branch mismatches are ignored without running deployment
