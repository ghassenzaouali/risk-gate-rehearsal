# Transaction Risk Gate

A small web app that scores a card transaction with simple risk rules and answers
`APPROVED`, `REVIEW` or `REJECTED`.

**Public URL:** https://risk-gate.yellowmushroom-2391c6a4.swedencentral.azurecontainerapps.io

```text
Browser ──HTTPS──> Azure Container Apps
                       └── risk-gate (Node 22 + Express, 0 → 5 replicas)
                             ├── GET  /               web page (public/)
                             ├── POST /api/decisions  scores a transaction
                             └── GET  /health         { status, version }
                       Logs (stdout) ──> Log Analytics
GitHub (push to main) ──> Actions: tests → build → push to ghcr.io → az containerapp update → smoke test (OIDC)
```

## How to run locally

Requirements: Node.js 22 or later.

```bash
npm ci                              # install the exact versions from package-lock.json
npm start                           # start the server on http://localhost:3000
curl http://localhost:3000/health   # in another terminal: {"status":"ok"}
```

The port can be changed with the `PORT` environment variable (default: `3000`).

## How it is built and deployed

**Build.** The [Dockerfile](Dockerfile) starts from `node:22-alpine`, installs the production
dependencies with `npm ci --omit=dev`, copies `src/` and runs the server as the unprivileged `node`
user. To build and run the image locally:

```bash
docker build -t risk-gate .
docker run --rm -p 3000:3000 risk-gate
```

**Pipeline.** Every push to `main` runs [deploy.yml](.github/workflows/deploy.yml) on GitHub Actions:

1. build the image and push it to ghcr.io, tagged with the commit SHA;
2. log in to Azure with OIDC: no password or secret is stored in GitHub;
3. `az containerapp update` with the new image and `APP_VERSION=<commit SHA>`;
4. smoke test: `GET /health` on the public URL, with retries for the cold start.

**Infrastructure.** [infra/setup.sh](infra/setup.sh) is run once from Git Bash, after `az login` and
`gh auth login`. It creates the resource group `rg-risk-gate`, a Consumption Container Apps
environment (logs in Log Analytics), the app (0.25 vCPU, 0 to 5 replicas, HTTP scale rule at 10
concurrent requests) and a managed identity that GitHub Actions can use through OIDC, for the `main`
branch only (Contributor on the resource group). It stores the three Azure ids as GitHub variables.

### Stop, start and delete

- **Idle:** with `min-replicas 0`, no replica runs after a few minutes without traffic.
- **Stop / start** (the configuration is kept): Azure portal, the app, *Overview*, *Stop* or *Start*.
  From Git Bash:
  ```bash
  ID=$(az containerapp show -n risk-gate -g rg-risk-gate --query id -o tsv)
  az rest --method post --url "https://management.azure.com${ID}/stop?api-version=2025-07-01"
  az rest --method post --url "https://management.azure.com${ID}/start?api-version=2025-07-01"
  ```
  A stopped app makes the smoke test fail: start it before pushing.
- **Restart without stopping:**
  ```bash
  REVISION=$(az containerapp revision list -n risk-gate -g rg-risk-gate --query "[?properties.active].name" -o tsv)
  az containerapp revision restart -n risk-gate -g rg-risk-gate --revision "$REVISION"
  ```
- **Delete everything:** `az group delete -n rg-risk-gate --yes --no-wait` (the managed identity is
  deleted with the group). To recreate it, run `infra/setup.sh` again.

## Key technical decisions

Guiding rule: the simplest option that meets the requirement, with a single production dependency
(Express).

| Decision | Why | Not chosen |
|---|---|---|
| Node.js 22 (LTS) and Express 5 | one language for the page and the server; little code to master | Spring Boot or Flask (a second language), NestJS (classes and layers) |
| Rules as pure functions in `src/rules.js` | tested without a server; each answer lists the rules that fired, so every decision is explainable | a machine learning model (needs training data, hard to explain) |
| Hand-written validation, tests with `node:test` | no extra dependency | Joi or Zod, Jest |
| One HTML page and one script, served by Express | no framework, no build; same origin, so no CORS; text shown with `textContent`, so no HTML injection | React and a separate front-end |
| `node:22-alpine`, `npm ci --omit=dev`, `USER node` | small image, exact versions from `package-lock.json`, not run as root | `node:22` (Debian, much bigger) |
| GitHub Actions: tests, then deployment (`needs: test`) from `main` only, one at a time | next to the code on GitHub, free for a public repository; a failing test blocks the deployment | Jenkins (a server to run), Azure DevOps (a second platform) |
| ghcr.io, images tagged with the commit SHA | free for public images, login with the temporary `GITHUB_TOKEN`; any version can be traced and redeployed | Docker Hub (a token to store), Azure Container Registry (paid), the `latest` tag |
| OIDC with a managed identity (`main` only, Contributor on one resource group); port and version in environment variables | no password or secret to store or rotate; the Azure ids are GitHub variables, as they are not secrets; the same image runs on a PC and on Azure | a client secret stored in GitHub |
| Azure Container Apps (Consumption), 0 to 5 replicas, HTTP scale rule | HTTPS, scaling, logs and metrics included; no compute cost at rest (0 replicas) | App Service (billed even when idle), AKS (a cluster to operate), Container Instances (no autoscaling) |
| No state kept in memory between requests | any replica can answer any request, so scaling needs no code change | in-memory counters (wrong as soon as there are 2 replicas) |
| JSON errors (`400`, `500`) without crashing; graceful stop on SIGTERM; smoke test on `/health` | bad input does not break the service; requests in progress finish before a replica stops (tested); the pipeline fails if the app does not answer | — |
| One JSON log line per decision on stdout, card masked; `X-Instance-Id` header; version in `/health` | searchable in Log Analytics with KQL; shows which replica answered and which version runs; the full card number is never returned, logged or stored (PCI DSS) | a logging library (pino, winston) |
| k6 for the load test | scripted in JavaScript, a single binary, pass/fail thresholds | JMeter, Locust, Azure Load Testing (paid) |
| One `az` script for the infrastructure, run once | short and readable | Bicep or Terraform (see the limitations) |

## System behavior under load

Measured on 22 October 2026 against the public URL with [load/load-test.js](load/load-test.js): k6,
run from one PC, ramps up to 50 virtual users without pause and holds for 2 minutes. Its thresholds
are less than 1 % errors and p95 under 500 ms. Replica counts come from Azure Monitor and
`az containerapp replica list`; decisions per replica come from the JSON logs in Log Analytics.

| Scenario | Requests | Errors | p95 | Max | What happened |
|---|---|---|---|---|---|
| Load, starting from 0 replicas | 134,630 (816/s) | 0 % | 95 ms | 25 s | 0 → 5 replicas in under a minute; the 25 s is the cold start of the first replica |
| Deployment during the load | 152,406 (923/s) | 0 % | 88 ms | 0.8 s | the new revision started 5 replicas, then got the traffic; the old replicas stopped gracefully (SIGTERM) 30 s later |
| Restart during the load | 157,886 (957/s) | 0 % | 61 ms | 1.6 s | replicas were replaced a few at a time, each old one stopping gracefully |

- **Scaling**: the HTTP rule (10 concurrent requests per replica) added replicas up to the limit
  of 5, and they shared the work (from 22,879 to 33,307 decisions each in the first scenario).
- **Beyond 5 replicas**: 10 is when the HTTP rule adds a replica, not what a replica can handle. In
  a local check, one container limited to 0.25 vCPU served 100 virtual users: about 500 requests/s,
  0 % errors, p95 315 ms (96 ms with 10 users). Slower, but no failure. The app keeps no state, so it
  can scale further by raising `--max-replicas` (5 is a cost limit).
- **No request lost**: the number of decisions logged equals the number of requests counted by k6
  (134,630 in the first scenario; 310,292 in the deployment and restart scenarios together).
- **Invalid input**: a broken JSON body and a missing field both get a `400` with a message, and
  `/health` still answers `200` right after.
- **Cold start**: with 0 replicas at rest, the first request waits for a container to start.
- **Limit of the test**: k6 ran on one PC with 50 virtual users, each waiting for its answer before
  sending the next one (under 1,000 requests per second); p95 stayed under 100 ms, so the limit of
  the system was not reached.

## Known limitations and possible improvements

Ordered by what I would do first for a real production service.

| Limitation | Possible improvement |
|---|---|
| No authentication: anyone with the URL can call the API | API keys or Entra ID (OAuth 2.0), and rate limiting |
| The full card number reaches the server (never stored, but in PCI DSS scope) | receive a token from the payment provider instead of the card number |
| 0 replicas at rest: about 25 s of cold start, and a single replica when traffic is low | at least 2 replicas at all times |
| One environment in one region: each push to `main` goes straight to production | a staging environment with a manual approval; a second region |
| No alerts: logs and metrics are read by hand | Azure Monitor alerts on errors and response time |
| The smoke test checks that `/health` answers, not which version: if the new revision does not start, Azure keeps serving the old one | compare the version returned by `/health` with the commit SHA |
| Default health probes (TCP on the port) | HTTP probes on `/health` |
| The rules are illustrative: weights and thresholds chosen by hand | calibrate them on real fraud data |
| No shared state, so no velocity rule ("3 payments in 1 minute with the same card"): an in-memory counter would be wrong with 2 replicas | a shared store such as Redis |
| Decisions are only logged, not stored | a database for the history and the audit trail |
| Infrastructure as an `az` script: it creates, it does not compare | Bicep or Terraform, applied by the pipeline |
| Unit tests cover the rules only | API tests against a started server, and a test of the page |
| Load test from one PC (under 1,000 requests/s): the limit was not found; 5 replicas is a cost limit | a distributed load test, then a higher `--max-replicas` |
| No security scan of the image or the dependencies | Trivy and `npm audit` in the pipeline |
| Actions pinned by major version (such as `@v7`); one `permissions` block for both jobs | pin each action by commit SHA; give each job only the permissions it needs |
| The `X-Powered-By: Express` header reveals the framework | `app.disable("x-powered-by")` |
| Every push runs the whole pipeline, even for documentation; no npm cache, so a slow registry slows it down (once, `npm ci` took 7 minutes) | `paths-ignore` for Markdown files; the npm cache of `actions/setup-node` |
| The page is served by the backend | static hosting or a CDN for the page |
