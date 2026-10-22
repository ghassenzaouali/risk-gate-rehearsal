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

_To be completed._

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

_To be completed._
