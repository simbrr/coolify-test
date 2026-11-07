#!/bin/sh
# Build is separate. This runs a built image, checks HTTP, Docker health, and SIGTERM.
set -eu

IMAGE=${1:?image name required}
NAME="coolify-test-smoke-$$"
HOST_PORT=""

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$NAME" -p "127.0.0.1::3000" "$IMAGE" >/dev/null
HOST_PORT=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}' "$NAME")

python3 - "$HOST_PORT" <<'PY'
import json, sys, time, urllib.error, urllib.request

port = sys.argv[1]
base = f"http://127.0.0.1:{port}"
deadline = time.time() + 20
last_error = "no response"

def get(path):
    with urllib.request.urlopen(base + path, timeout=2) as response:
        return response.status, response.read().decode()

while time.time() < deadline:
    try:
        status, body = get("/health")
        payload = json.loads(body)
        if status == 200 and payload.get("status") == "ok" and payload.get("check") == "liveness":
            break
        last_error = f"unexpected health payload {status} {body}"
    except Exception as error:
        last_error = str(error)
    time.sleep(0.4)
else:
    print(last_error, file=sys.stderr)
    sys.exit(1)

status, body = get("/")
if status != 200 or "Coolify smoke test" not in body:
    print(f"landing page failed: {status}", file=sys.stderr)
    sys.exit(1)

try:
    get("/missing")
    print("expected 404", file=sys.stderr)
    sys.exit(1)
except urllib.error.HTTPError as error:
    if error.code != 404:
        print(f"expected 404, got {error.code}", file=sys.stderr)
        sys.exit(1)

print(json.dumps({"health": payload, "port": int(port)}))
PY

deadline=$(( $(date +%s) + 25 ))
status="starting"
while [ "$(date +%s)" -lt "$deadline" ]; do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME")
  if [ "$status" = "healthy" ]; then
    break
  fi
  sleep 1
done

if [ "$status" != "healthy" ]; then
  echo "container health status is ${status}" >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi

user=$(docker inspect --format '{{.Config.User}}' "$NAME")
if [ "$user" != "node" ]; then
  echo "expected runtime user node, got ${user}" >&2
  exit 1
fi

docker stop --time 10 "$NAME" >/dev/null
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$NAME")
if [ "$exit_code" != "0" ]; then
  echo "expected graceful exit 0, got ${exit_code}" >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi

echo "container smoke passed on 127.0.0.1:${HOST_PORT}"
