# Pookie

Preparation workspace for the OpenAI × Istanbul Slush'D Codex Hackathon on October 12, 2026.

The planned product compares trips around a fixed event, combining flights, accommodation, ticket costs when known, and optional cities. Deterministic code will check schedules and calculate costs; AI will interpret requests and explain the results.

**Current status (event day):** a Next.js app with the backend vertical slice — request parsing, deterministic route planning, full reoptimization, and optional Fal.ai route banners — plus a backend console at `/dev`. The product UI is being built by the frontend track. All prices are heuristic/mock estimates, not live offers.

## Run locally

Requires Node 22.12+.

```bash
npm install
cp .env.example .env.local   # optional: add FAL_KEY for route banners
npm run dev                  # http://localhost:3000/dev
npm test                     # planner, parser and constraint tests
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `FAL_KEY` | No | Server-side Fal.ai key for `POST /api/routes/{routeId}/hero`. Without it the endpoint returns `hero_disabled`. |
| `FAL_MAX_GENERATIONS` | No | Per-process cap on banner generations (default 25). |

API contract: [docs/api-contract.md](docs/api-contract.md). Backend design and limitations: [docs/backend.md](docs/backend.md).

## Preparation documents

- [Start here](START-HERE.md)
- [Architecture, data contracts, and development plan](PREPARATION.md)
- [Credential setup](CREDENTIAL-SETUP.md)
- [Tooling readiness](TOOLING-READINESS.md)
- [Demo script and submission checklist](DEMO-CHECKLIST.md)
- [Acceptance criteria](ACCEPTANCE-CHECKLIST.md)
- [First implementation prompt](TOMORROW-PROMPT.md)
- [Agent instructions and preparation boundary](AGENTS.md)

## Collaboration

M4G1W0W and OnurSamett are organization Owners. Development ownership is separate from GitHub permissions: M4G1W0W is the Product Lead and owns product direction, frontend, user experience, and pitch; OnurSamett is the Backend & AI Engineering Lead and owns backend architecture, request interpretation, deterministic route planning, and server-side integrations. See [AGENTS.md](AGENTS.md#team-roles-and-development-coordination) for detailed boundaries.

Read those coordination rules before editing. Agree the API contract and ownership of shared setup files, work on separate branches/checkouts, and integrate in small increments. During the authorized build, the frontend can use explicitly labeled synthetic mock API responses until backend endpoints are ready. Mock UI checks do not verify live provider integration.

Each collaborator keeps credentials in their own ignored `.env.local`. Never add keys to Git, issues, pull requests, or shared documents. The local credential file is deliberately absent from this repository.

Do not present estimates, sandbox responses, or cached observations as live prices. Preserve source timestamps and price scope, and keep missing costs explicit.
