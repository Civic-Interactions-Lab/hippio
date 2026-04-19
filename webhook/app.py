"""
GitHub Webhook Receiver for self-hosted redeployment.
Listens for push events, validates the signature, and triggers a local rebuild.
"""

import hashlib
import hmac
import json
import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]
REPO_FULL_NAME = os.environ.get("REPO_FULL_NAME", "owner/repo")
REPO_BRANCH = os.environ.get("REPO_BRANCH", "main")
APP_REPO_DIR = os.environ.get("APP_REPO_DIR", "/workspace")
DEPLOY_SCRIPT = os.environ.get("DEPLOY_SCRIPT", "/app/deploy.sh")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("webhook")

# ---------------------------------------------------------------------------
# Deployment state (in-memory)
# ---------------------------------------------------------------------------
deploy_lock = threading.Lock()
deploy_state = {
    "status": "idle",  # idle | deploying
    "last_result": None,  # success | failure
    "last_timestamp": None,
    "last_commit": None,
}

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)


def verify_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """Validate X-Hub-Signature-256 using HMAC SHA-256."""
    if not signature_header:
        return False
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def run_deploy(commit_sha: str) -> None:
    """Execute the deploy script in a background thread."""
    try:
        deploy_state["status"] = "deploying"
        deploy_state["last_commit"] = commit_sha
        log.info("Starting deployment for commit %s …", commit_sha[:8])

        result = subprocess.run(
            ["/bin/bash", DEPLOY_SCRIPT],
            env={**os.environ, "APP_REPO_DIR": APP_REPO_DIR, "REPO_BRANCH": REPO_BRANCH},
            capture_output=True,
            text=True,
            timeout=600,  # 10 min hard limit
        )

        if result.stdout:
            log.info("deploy stdout:\n%s", result.stdout)
        if result.stderr:
            log.warning("deploy stderr:\n%s", result.stderr)

        if result.returncode == 0:
            deploy_state["last_result"] = "success"
            log.info("Deployment succeeded.")
        else:
            deploy_state["last_result"] = "failure"
            log.error("Deployment failed (exit %d).", result.returncode)

    except subprocess.TimeoutExpired:
        deploy_state["last_result"] = "failure"
        log.error("Deployment timed out.")
    except Exception:
        deploy_state["last_result"] = "failure"
        log.exception("Deployment error.")
    finally:
        deploy_state["status"] = "idle"
        deploy_state["last_timestamp"] = datetime.now(timezone.utc).isoformat()
        deploy_lock.release()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, **deploy_state}), 200


@app.route("/github-webhook", methods=["POST"])
def github_webhook():
    # --- Signature verification -------------------------------------------
    payload = request.get_data()
    sig = request.headers.get("X-Hub-Signature-256")
    if not verify_signature(payload, sig):
        log.warning("Invalid or missing signature.")
        return jsonify({"error": "invalid signature"}), 401

    # --- Parse payload ----------------------------------------------------
    try:
        data = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return jsonify({"error": "malformed JSON"}), 400

    # --- Check event type -------------------------------------------------
    event = request.headers.get("X-GitHub-Event", "")
    if event == "ping":
        log.info("Received ping event – webhook configured correctly.")
        return jsonify({"message": "pong"}), 200
    if event != "push":
        log.info("Ignoring event: %s", event)
        return jsonify({"message": "ignored", "event": event}), 200

    # --- Validate repo & branch -------------------------------------------
    repo = data.get("repository", {}).get("full_name", "")
    ref = data.get("ref", "")
    if repo != REPO_FULL_NAME:
        log.info("Ignoring push for repo %s (expected %s).", repo, REPO_FULL_NAME)
        return jsonify({"message": "ignored", "reason": "repo mismatch"}), 200
    if ref != f"refs/heads/{REPO_BRANCH}":
        log.info("Ignoring push to %s (expected refs/heads/%s).", ref, REPO_BRANCH)
        return jsonify({"message": "ignored", "reason": "branch mismatch"}), 200

    # --- Trigger deploy ---------------------------------------------------
    acquired = deploy_lock.acquire(blocking=False)
    if not acquired:
        log.warning("Deploy already in progress – rejecting.")
        return jsonify({"error": "deployment already in progress"}), 409

    commit_sha = data.get("after", "unknown")
    thread = threading.Thread(target=run_deploy, args=(commit_sha,), daemon=True)
    thread.start()

    return jsonify({"message": "deployment started", "commit": commit_sha}), 202


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9000))
    log.info("Webhook server starting on port %d", port)
    # Use threaded=True so health checks work during deployment
    app.run(host="0.0.0.0", port=port)

