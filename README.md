# coolify-test

Disposable Coolify smoke test. It serves one landing page and a liveness response so a new public repository can be built and started on its own. It is independent of any existing application.

The process uses Node.js built-ins only. It has no npm dependencies, database, secrets, migrations, or outbound requests.

## Runtime

Node.js 26 (codename Lithium) is the Active LTS line. Version 26.13.0 entered LTS on 2026-10-28 and is supported through April 2029.

- Release: [Node.js 26.13.0 (LTS)](https://nodejs.org/en/blog/release/v26.13.0)
- Schedule: [nodejs/Release](https://github.com/nodejs/release)
- Version table: [Node.js releases](https://nodejs.org/en/about/previous-releases)

`package.json` accepts Node.js `>=26.13.0 <27`. `.node-version` and the Docker image are pinned to **26.13.0**. The image is the official `node:26.13.0-bookworm-slim` index digest recorded in the Dockerfile, so the build does not float to another tag. The container runs as the image user `node`.

## What it serves

| Request | Response |
| --- | --- |
| `GET /` | HTTP 200 HTML page titled Coolify smoke test |
| `GET /health` | HTTP 200 JSON. `status` is `ok` and `check` is `liveness` |
| anything else | HTTP 404 |

`GET /health` means this process is running. It does not check a database, another container, or the network. The body also includes `service` (`coolify-test`), `uptimeSeconds`, and `timestamp`.

The process listens on `0.0.0.0` and `PORT`. `PORT` defaults to **3000**.

## Run locally

Install Node.js 26.13.0 or a later 26.x release, then from this directory:

```sh
node server.js
```

Open http://127.0.0.1:3000/ and request liveness:

```sh
curl -fsS http://127.0.0.1:3000/health
```

Stop the process with Ctrl+C. It closes the server on `SIGINT` and `SIGTERM`.

To use another port:

```sh
PORT=3000 node server.js
```

`.env.example` documents that optional variable. Nothing in it is a secret, and the app does not load a dotenv file. Export `PORT` yourself if you want a value other than 3000.

Run the tests:

```sh
node --test
```

The tests cover `/`, `/health`, a 404, the default port, a custom `PORT`, the `0.0.0.0` bind, and a `SIGTERM` shutdown.

## Run with Docker

Build and run:

```sh
docker build -t coolify-test .
docker run --rm -p 3000:3000 coolify-test
```

The image listens on container port 3000. Open http://127.0.0.1:3000/ on the machine running Docker.

The image health check calls `GET /health` with Node's built-in `fetch` against `127.0.0.1` and the container's `PORT`. It does not use `curl` or `wget`.

Container smoke test, after the build:

```sh
sh scripts/container-smoke.sh coolify-test
```

That script publishes a local port, checks `/`, `/health`, and a 404, waits until Docker reports the container healthy, checks that the runtime user is `node`, and checks that `docker stop` ends with exit code 0.

## Coolify

Initial deployment is manual, from the public Git repository, after this change is merged to `main`. These steps do not install a GitHub App, do not create a webhook, and do not mean automatic deployment already works. A public-repository source in Coolify does not receive GitHub push events by itself. Watch Paths is not available for that source. The GitHub App and webhooks can be configured later, as a separate step.

Instance used for this smoke test:

- Coolify v4.6.0
- Dashboard, LAN only: http://192.168.1.215:8000
- Host: VM112, Ubuntu 24.04.3

Create a new application in its own project or environment. Do not attach it to an existing production application.

1. Open http://192.168.1.215:8000 and select the target project and environment.
2. Select **+ New**.
3. Choose a **public repository**. Do not choose the GitHub App source for this first deployment.
4. Paste `https://github.com/simbrr/coolify-test` and select **Check Repository**.
5. Set the branch to `main`. Do this only after the pull request has been merged. `main` will not contain this app before that merge.
6. During creation, set the build pack to **Dockerfile**. After creation, the same choice is **Build strategy** under **General > Build pipeline**.
7. Set **Base Directory** to `/`.
8. Set **Dockerfile Location** to `/Dockerfile`. Coolify resolves that pair to `/Dockerfile` at the repository root. Leave **Docker Build Stage Target** empty.
9. Set **Ports Exposes** to `3000`. That is the port inside the container. The process binds `0.0.0.0:3000` unless `PORT` is changed.
10. Do not add a domain. Do not add a tunnel. Leave **Domains** empty.
11. Under **Network**, set **Port Mappings** so the LAN can open the app without a domain. Use `3000:3000` when host port 3000 is free. If it is taken, pick another host port and keep the container port at 3000, for example `3010:3000`. A host port mapping bypasses the proxy and disables rolling replacement for this application, which is acceptable for this smoke test.
12. Leave environment variables empty. `PORT` defaults to 3000 inside the image. If you set `PORT`, keep it at `3000` so it matches **Ports Exposes**. Do not add secrets.
13. Leave pre-deployment and post-deployment commands empty. There are no migrations.
14. Leave the dashboard **Healthcheck** HTTP probe unset. Coolify's HTTP probe runs `curl` or `wget` inside the container. The pinned `node:26.13.0-bookworm-slim` image does not include either command. The Dockerfile `HEALTHCHECK` is the check Coolify uses for a non-Compose Dockerfile application. It requests `http://127.0.0.1:3000/health` with Node's built-in `fetch` and expects HTTP 200. The JSON field `status` is `ok` and `check` is `liveness`.
15. Select **Deploy** and read the build log. A successful start logs `listening host=0.0.0.0 port=3000`.

From the LAN, open `http://192.168.1.215:<host-port>/` and `http://192.168.1.215:<host-port>/health`, using the host port from **Port Mappings**. No public DNS name is required.

Deploy again from the Coolify dashboard when you want a newer `main` commit. Pushing to GitHub does not deploy this application until a GitHub App or webhook is configured on purpose.

## Checks

GitHub Actions runs `node --test` on Node.js 26.13.0 and, in a second job, `docker build` plus `scripts/container-smoke.sh`. The Docker job does not log in to a registry and does not push an image.
