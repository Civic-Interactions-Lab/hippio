# Hippio – GitHub Webhook Auto-Deploy

A lightweight, self-hosted webhook receiver that listens for GitHub `push` events and rebuilds the application from source on the server. No Portainer, no Watchtower, no SSH deployment.

## How it works

1. GitHub sends a `push` event to `http://YOUR_SERVER:9000/github-webhook`
2. The webhook server validates the `X-Hub-Signature-256` header
3. If the repo and branch match, it runs `deploy.sh` which:
   - `git pull` the latest code in the mounted repo directory
   - `docker compose up -d --build --remove-orphans` to rebuild & restart

Because `docker compose up --build` only recreates containers whose images or config changed, an explicit `docker compose down` is **not** needed and would cause unnecessary downtime.

## Prerequisites

- The application repo must already be cloned on the server (e.g. `/opt/hippio`)
- Docker and Docker Compose must be installed on the host
- The webhook container needs access to the Docker socket

## Quick start

```bash
# On your server
cd /opt/hippio-webhook   # or wherever you place this directory

# 1. Create your .env
cp .env.example .env
# Edit .env – set WEBHOOK_SECRET to a strong random value
#            – set HOST_REPO_DIR to your app repo path
#            – set REPO_FULL_NAME to your GitHub owner/repo

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
| `APP_REPO_DIR` | Repo path **inside the container** | `/workspace` |
| `HOST_REPO_DIR` | Repo path **on the host** (for volume mount) | `/opt/hippio` |

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

