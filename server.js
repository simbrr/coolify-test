import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SERVICE_NAME = "coolify-test";
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "0.0.0.0";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const CSS = `
  :root {
    color-scheme: light;
    --ink: #1c1915;
    --muted: #5c564c;
    --line: #e3d9cc;
    --paper: #f7f3ec;
    --card: #fffdf9;
    --accent: #0f6e56;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 1.05rem;
    line-height: 1.5;
  }
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 4.5rem 1.25rem 3rem;
  }
  .mark {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 0 1.25rem;
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .mark span {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    background: var(--accent);
  }
  h1 {
    margin: 0 0 0.75rem;
    font-size: 2.35rem;
    line-height: 1.15;
    letter-spacing: -0.03em;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
  }
  p { margin: 0; }
  .lead { color: var(--muted); max-width: 36rem; }
  section {
    margin-top: 1.75rem;
    padding: 1.1rem 1.15rem 1.15rem;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  dl { margin: 0.85rem 0 0; }
  div + div { margin-top: 0.7rem; }
  dt {
    font-size: 0.78rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dd { margin: 0.1rem 0 0; }
  a {
    color: var(--accent);
    text-decoration-thickness: 1px;
    text-underline-offset: 0.18em;
  }
  code {
    font-family: ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace;
    font-size: 0.92em;
  }
  footer {
    margin-top: 1.5rem;
    color: var(--muted);
    font-size: 0.92rem;
  }
`;

export function resolvePort(value = process.env.PORT) {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  if (!/^(0|[1-9]\d*)$/.test(String(value))) {
    throw new Error(`Invalid PORT "${value}". Use an integer from 0 to 65535.`);
  }
  const port = Number(value);
  if (port > 65535) {
    throw new Error(`Invalid PORT "${value}". Use an integer from 0 to 65535.`);
  }
  return port;
}

export function createServer() {
  return http.createServer((request, response) => {
    const pathname = requestPath(request);
    if (request.method === "GET" && pathname === "/") {
      sendHtml(response, 200, landingPage());
      return;
    }
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: SERVICE_NAME,
        check: "liveness",
        uptimeSeconds: Math.round(process.uptime() * 1000) / 1000,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    sendHtml(response, 404, notFoundPage());
  });
}

function requestPath(request) {
  try {
    return new URL(request.url || "/", "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

function landingPage() {
  return document({
    title: "Coolify smoke test",
    body: `
      <p class="mark"><span></span>Disposable check</p>
      <h1>Coolify smoke test</h1>
      <p class="lead">This page is served by a small Node.js process. A successful response means the image built, the container started, and HTTP reached this app.</p>
      <section>
        <h2>Liveness</h2>
        <p><a href="/health">GET /health</a> returns HTTP 200 and JSON. <code>status</code> is <code>ok</code> while this process is running.</p>
        <dl>
          <div>
            <dt>What it checks</dt>
            <dd>This process only. It does not check a database or any other application.</dd>
          </div>
          <div>
            <dt>What it does not use</dt>
            <dd>No dependencies, secrets, migrations, or outbound requests.</dd>
          </div>
        </dl>
      </section>
      <footer>Independent smoke test. It is not part of another deployed application.</footer>
    `,
  });
}

function notFoundPage() {
  return document({
    title: "Not found — Coolify smoke test",
    body: `
      <p class="mark"><span></span>Coolify smoke test</p>
      <h1>Not found</h1>
      <p class="lead">That path is not served. The landing page is <a href="/">/</a> and liveness is <a href="/health">GET /health</a>.</p>
    `,
  });
}

function document({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>
`;
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(html);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

function main() {
  let port;
  try {
    port = resolvePort();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const server = createServer();
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`shutting down signal=${signal}`);
    server.close((error) => {
      if (error) {
        console.error(error.message);
        process.exit(1);
      }
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => {
      console.error("shutdown timed out");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  server.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, DEFAULT_HOST, () => {
    const address = server.address();
    const boundPort = address && typeof address === "object" ? address.port : port;
    console.log(`listening host=${DEFAULT_HOST} port=${boundPort}`);
  });
}

if (isDirectRun()) {
  main();
}
