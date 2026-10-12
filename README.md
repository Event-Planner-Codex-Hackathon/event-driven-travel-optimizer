# Event Driven Travel Optimizer

Preparation workspace for the OpenAI × Istanbul Slush'D Codex Hackathon on October 12, 2026.

The planned product compares trips around a fixed event, combining flights, accommodation, ticket costs when known, and optional cities. Deterministic code will check schedules and calculate costs; AI will interpret requests and explain the results.

**Current status: preparation only. No application has been implemented.** The official build window is 09:30–16:00 Europe/Istanbul. Implementation requires the user's explicit start instruction after the event opens.

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

Repository access is managed by the owner through GitHub collaborator invitations. After access is granted, clone the repository and read the preparation documents. There are no application install or run commands yet.

Each collaborator keeps credentials in their own ignored `.env.local`. Never add keys to Git, issues, pull requests, or shared documents. The local credential file is deliberately absent from this repository.

Do not present estimates, sandbox responses, or cached observations as live prices. Preserve source timestamps and price scope, and keep missing costs explicit.
