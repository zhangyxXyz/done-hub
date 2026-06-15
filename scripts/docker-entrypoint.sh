#!/bin/sh
set -e

NEXTCHAT_WORKTREE="${NEXTCHAT_WORKTREE:-/opt/nextchat}"
MJCHAT_WORKTREE="${MJCHAT_WORKTREE:-/opt/mjchat}"
NEXTCHAT_URL="${NEXTCHAT_URL:-http://127.0.0.1:3001}"
MJCHAT_URL="${MJCHAT_URL:-http://127.0.0.1:3002}"

export NEXTCHAT_WORKTREE
export MJCHAT_WORKTREE
export NEXTCHAT_URL
export MJCHAT_URL
export NEXTCHAT_BASE_PATH="${NEXTCHAT_BASE_PATH:-/nextchat}"
export NEXTCHAT_PORT="${NEXTCHAT_PORT:-3001}"
export NEXTCHAT_VERSION="${NEXTCHAT_VERSION:-v2.16.1}"
export MJCHAT_BASE_PATH="${MJCHAT_BASE_PATH:-/mjchat/}"
export MJCHAT_PORT="${MJCHAT_PORT:-3002}"
export MJCHAT_VERSION="${MJCHAT_VERSION:-v2.26.5}"

node /app/scripts/start-nextchat.mjs &
nextchat_pid="$!"

node /app/scripts/start-midjourney-proxy.mjs &
mjchat_pid="$!"

cleanup() {
  kill "$nextchat_pid" "$mjchat_pid" "${done_hub_pid:-}" 2>/dev/null || true
}

trap cleanup INT TERM

wait_for_http() {
  name="$1"
  url="$2"
  pid="$3"
  attempts="${4:-60}"
  i=1

  while [ "$i" -le "$attempts" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name exited before becoming ready" >&2
      return 1
    fi

    if node -e '
      const target = process.argv[1];
      const client = target.startsWith("https:") ? require("https") : require("http");
      const req = client.get(target, { timeout: 2000 }, (res) => {
        res.resume();
        process.exit(res.statusCode >= 200 && res.statusCode < 500 ? 0 : 1);
      });
      req.on("timeout", () => {
        req.destroy();
        process.exit(1);
      });
      req.on("error", () => process.exit(1));
    ' "$url"; then
      echo "$name is ready at $url"
      return 0
    fi

    sleep 1
    i=$((i + 1))
  done

  echo "$name did not become ready at $url within ${attempts}s" >&2
  return 1
}

wait_for_http "ChatGPT Next" "http://127.0.0.1:${NEXTCHAT_PORT}${NEXTCHAT_BASE_PATH}" "$nextchat_pid"
wait_for_http "chatgpt-web-midjourney-proxy" "http://127.0.0.1:${MJCHAT_PORT}${MJCHAT_BASE_PATH}" "$mjchat_pid"

/done-hub "$@" &
done_hub_pid="$!"

wait "$done_hub_pid"
status="$?"
cleanup
exit "$status"
