# Transaction Risk Gate

A small web app that scores a card transaction with simple risk rules and answers
`APPROVED`, `REVIEW` or `REJECTED`.

**Public URL:** _added after the first deployment_

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

_To be completed._

## Key technical decisions

_To be completed._

## System behavior under load

_To be completed._

## Known limitations and possible improvements

_To be completed._
