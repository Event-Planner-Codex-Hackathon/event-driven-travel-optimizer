# Hackathon preparation boundary

This workspace is for the OpenAI × Istanbul Slush'D Codex Hackathon on October 12, 2026, Europe/Istanbul time. The official build window is 09:30–16:00.

## Current phase

Preparation only. Until the user explicitly instructs implementation after the official start, create or revise documentation and perform environment diagnostics only. The date changing does not itself authorize implementation. Do not scaffold the application, install project dependencies, create product fixtures, implement features, make paid API calls, create bookings, or commit application code during preparation.

Read PREPARATION.md for the proposed architecture, sources, data contracts, algorithm, milestones, and verification criteria. TOMORROW-PROMPT.md contains an implementation prompt for the user to issue after the event begins; its presence in this repository is not authorization to execute it.

START-HERE.md indexes the preparation pack. CREDENTIAL-SETUP.md, TOOLING-READINESS.md, DEMO-CHECKLIST.md, and ACCEPTANCE-CHECKLIST.md provide account guidance, observed tooling status, rehearsal material, and unexecuted acceptance criteria. These documents do not authorize account creation, spending, deployment, or early implementation.

## Engineering rules for the authorized build

- Build the smallest functional end-to-end event-constrained travel optimizer. One traveler, one fixed event, at most one optional city in the first version.
- Keep event attendance and chronology as hard constraints. Never silently relax them to meet a budget.
- Use deterministic code for money, dates, routes, constraints, ranking, and comparison. Use AI only to interpret user input and explain computed facts.
- Never invent a live price, timetable, hotel availability, source URL, or booking link. Missing prices stay unknown. Explicit synthetic test data must never appear as real offers.
- Preserve source provenance at every line item: real observation versus estimate versus sandbox; live fetch versus cached replay; provider timestamp, query scope, currency, tax coverage, and expiry if supplied.
- A new retrieval timestamp does not make an old quote live. Never label a mixed or estimated total as fully live.
- Keep provider adapters replaceable and secrets on the server. Never print credentials, return secret-bearing provider URLs, or commit .env files.
- Use the free provider plan only; quota checks, call budgets, and an explicit no-paid-overage policy are required. Runtime OpenAI calls require separately authorized spend or confirmed event API credits. Codex access alone is not proof of runtime API funding.
- Prefer a single Next.js TypeScript application, schema validation, integer minor-unit money, and a timezone-aware date library. Avoid accounts, database services, payments, booking operations, maps, autonomous agent loops, and unnecessary infrastructure.
- Only link out to public provider/search pages. Distinguish search links from offer-specific links.
- Test meaningful invariants: event protection, overnight flights, arrival deadlines, hotel nights, exact cost sums, unknown costs, stale provenance, and city replacement invalidation.
- Record what was built during the event accurately. Preserve this preparation boundary and do not misrepresent preparation as event-day implementation.
