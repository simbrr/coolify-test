import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, resolvePort } from "../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("GET / identifies the Coolify smoke test", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(body, /Coolify smoke test/);
    assert.match(body, /GET \/health/);
    assert.doesNotMatch(body, /https?:\/\//);
  });
});

test("GET /health returns liveness JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "coolify-test");
    assert.equal(body.check, "liveness");
    assert.equal(typeof body.uptimeSeconds, "number");
    assert.ok(body.uptimeSeconds >= 0);
    assert.equal(Number.isNaN(Date.parse(body.timestamp)), false);
  });
});

test("unknown paths return 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.text();
    assert.equal(response.status, 404);
    assert.match(body, /Not found/);

    const wrongMethod = await fetch(`${baseUrl}/health`, { method: "POST" });
    assert.equal(wrongMethod.status, 404);
  });
});

test("PORT defaults to 3000 and rejects values that are not a port", () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort(""), 3000);
  assert.equal(resolvePort("0"), 0);
  assert.equal(resolvePort("3000"), 3000);
  assert.equal(resolvePort("65535"), 65535);
  assert.throws(() => resolvePort("nope"), /Invalid PORT/);
  assert.throws(() => resolvePort("65536"), /Invalid PORT/);
  assert.throws(() => resolvePort("-1"), /Invalid PORT/);
  assert.throws(() => resolvePort("03000"), /Invalid PORT/);
});

test("the process binds the PORT from the environment on 0.0.0.0 and stops on SIGTERM", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const listening = await waitForListen(child, () => stdout);
    assert.equal(listening.host, "0.0.0.0");
    assert.ok(listening.port > 0);

    const response = await fetch(`http://127.0.0.1:${listening.port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");

    child.kill("SIGTERM");
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
    assert.match(stdout, /shutting down signal=SIGTERM/);
    assert.equal(stderr, "");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
});

test("an invalid PORT exits before listening", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "nope" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  assert.match(stderr, /Invalid PORT "nope"/);
});

test("the image health check is pinned to Node 26 and does not call curl or wget", () => {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /FROM node:26\.13\.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68/,
  );
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^EXPOSE 3000$/m);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\["node", "-e"/);
  assert.match(dockerfile, /127\.0\.0\.1/);
  assert.doesNotMatch(dockerfile, /\b(curl|wget)\b/);
});

async function withServer(callback) {
  const server = createServer();
  await listen(server, 0, "127.0.0.1");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeIdleConnections();
    server.close();
    await once(server, "close");
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
}

async function waitForListen(child, readStdout) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const match = readStdout().match(/listening host=(\S+) port=(\d+)/);
    if (match) {
      return { host: match[1], port: Number(match[2]) };
    }
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the server to listen");
}
