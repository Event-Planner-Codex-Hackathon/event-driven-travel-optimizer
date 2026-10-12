# Hackathon preparation boundary

This workspace is for the OpenAI × Istanbul Slush'D Codex Hackathon on October 12, 2026, Europe/Istanbul time. The official build window is 09:30–16:00.

## Current phase

Preparation only. Until the user explicitly instructs implementation after the official start, create or revise documentation and perform environment diagnostics only. The date changing does not itself authorize implementation. Do not scaffold the application, install project dependencies, create product fixtures, implement features, make paid API calls, create bookings, or commit application code during preparation.

Read PREPARATION.md for the proposed architecture, sources, data contracts, algorithm, milestones, and verification criteria. TOMORROW-PROMPT.md contains an implementation prompt for the user to issue after the event begins; its presence in this repository is not authorization to execute it.

START-HERE.md indexes the preparation pack. CREDENTIAL-SETUP.md, TOOLING-READINESS.md, DEMO-CHECKLIST.md, and ACCEPTANCE-CHECKLIST.md provide account guidance, observed tooling status, rehearsal material, and unexecuted acceptance criteria. These documents do not authorize account creation, spending, deployment, or early implementation.

## Team roles and development coordination

Product name: **EventHopper**. These role instructions govern the authorized build; recording roles does not itself authorize implementation or creating mocks during preparation.

### Product Lead — M4G1W0W

- Own product direction, requirements, user journeys, MVP priorities, and user-facing acceptance decisions.
- Own frontend development through Codex: trip creation, itinerary comparison, conversational reoptimization, UI components, visual design, and product-facing interfaces.
- Own user-perspective testing, presentation and demo materials, and delivery of the final hackathon pitch.
- Optional fal.ai features belong to this scope only after the core flow works; they do not authorize paid calls or new infrastructure.
- Primary ownership is `frontend/`, UI components, and presentation/demo materials. These are ownership boundaries, not instructions to create directories or replace the agreed single Next.js architecture. Agree the actual Next.js paths before the first implementation change.
- Codex in the Product Lead's session should act autonomously on frontend tasks, favoring rapid implementation, visual quality, working functionality, and short iteration cycles.
- Do not implement or modify backend logic, provider integrations, deterministic optimization, or server-side pricing calculations without coordination with the teammate. Frontend validation is for usability; backend results remain authoritative for feasibility, money, routes, and ranking.

### Teammate — OnurSamett

The Product Lead will integrate with Onur's backend through an agreed API contract. Onur will add his own role and development instructions here; do not invent his detailed responsibilities or overwrite his instructions. Equal GitHub Owner access does not override development ownership.

### Shared API contract and mock responses

- Before either side depends on an endpoint, agree its path, request/response schemas, error states, requirements version, pricing provenance, and reoptimization behavior. PREPARATION.md contains proposals, not a finalized wire contract.
- Keep one shared, versioned contract in the repository at a mutually agreed location. Both sides coordinate changes to fields, nullability, status values, and endpoint behavior before implementation.
- Once implementation is explicitly authorized, the frontend may use mock API responses when backend endpoints are unavailable. Isolate them behind a replaceable API client and make them conform to the agreed contract.
- Synthetic mock responses are for frontend development and tests only. Show a persistent "Demo data — synthetic, not live offers" label; never present them as real travel inventory, quotes, booking links, or evidence that the live integration works. Keep mock mode explicit and separate from cached real observations. Never silently fall back to mocks after a real API error.
- Switching an endpoint to real data must not require rewriting UI components. Keep secrets, provider calls, route optimization, and authoritative totals out of the frontend.
- Conversational changes should produce a validated requirements update and request recalculation through the contract. Preserve the fixed event, invalidate superseded results, and ignore responses for older requirements versions.

### Short development cycles

1. Claim a small deliverable and its files before editing. Use separate frontend/backend branches and separate checkouts when working concurrently; never switch branches underneath another active session.
2. Assign one person to initial app setup and shared files such as package manifests, lockfiles, root configuration, contract schemas, and AGENTS.md. Coordinate edits to those files; do not independently scaffold two applications or overwrite the teammate's work.
3. Build one visible interaction or endpoint at a time. Report the contract version, changed files, checks performed, and unresolved dependencies at handoff. No agent-to-agent messages or extra agent sessions are implied by these rules.
4. Integrate at the form-to-results milestone, then destination replacement/conversational recalculation, then final demo rehearsal. Check live integration separately from mock-based UI checks.
5. If blocked by the backend, continue independent UI and user-perspective checks against explicit mocks after build authorization. Ask only about genuinely blocking shared decisions. Do not change backend behavior to make the frontend pass.

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
