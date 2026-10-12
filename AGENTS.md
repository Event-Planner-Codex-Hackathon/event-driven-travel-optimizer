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

**Role: Backend & AI Engineering Lead.** Onur owns backend architecture and implementation, natural-language request interpretation, deterministic route planning, server-side integrations, and technical integration readiness. This technical lead role covers engineering decisions and backend delivery; product direction, user experience, frontend, and pitch remain with the Product Lead.

- Own backend services and API behavior for parsing and validating trip requests, generating up to three route alternatives, calculating authoritative totals and feasibility, and fully reoptimizing when requirements change.
- Treat event city and inclusive event dates as hard constraints. Keep chronology, travel-window limits, and the agreed v1 scope enforced by deterministic backend logic; never let a language model override them.
- Use AI to interpret natural language into the agreed validated request schema and to explain computed results. Keep route feasibility, dates, money, ranking, and authoritative calculations deterministic and grounded in backend outputs.
- Own backend-side estimate provenance, assumptions, unknown-cost handling, and explicit synthetic/demo data labeling. Never present mock or heuristic prices as live offers.
- Own server-side provider adapters and secret handling. Keep credentials out of frontend code and Git. Add optional Fal.ai hero generation only after the core planning flow works and within the project's funding rules; it must not affect route feasibility or ranking.
- Coordinate API schemas, shared setup, and integration checkpoints with the Product Lead before changing shared contracts or files. Backend ownership does not include frontend UX or presentation materials.
- Keep the implementation small, replaceable, and reviewable. Report changed files, contract version, verification performed, provenance limitations, and blockers at handoff. Record completed contributions accurately rather than treating role ownership as completed work.

Equal GitHub Owner access does not override development ownership.

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

## Event-day build log (backend track)

Implementation was authorized by Onur on October 12, 2026 after the official start; the "Current phase" section above describes the preparation period only. Onur directed the backend work with Codex (OpenAI). Each entry names the tool that did the work. Source code comments do not name tools. The Product Lead builds the frontend separately in their own Codex session.

| Time (Istanbul) | Tool | Work | Commit |
| --- | --- | --- | --- |
| 11:33–12:00 | Codex | Next.js/TypeScript scaffold; shared contract v1.0 (`src/contract`); deterministic parser, planner, independent event-lock checker, heuristic estimates, three-option selection, full reoptimization; Fal.ai banner endpoint; backend console `/dev`; tests; API and backend docs | 4ee634e |
| 12:00–12:10 | Codex | Branch and upstream cleanup (`main` reset to `origin/main`, `onur/backend-planner` tracking); commit and push of the first slice | 4ee634e |
| 12:10–12:25 | Codex | Contract v1.1: on-demand SerpApi price check for the three options (dedupe, cache, call caps), provider provenance per line, guest session with per-guest limits, single price lookup `/prices` | f4090ef |
| 12:25–12:35 | Codex | Review of v1.1: 10 findings (guest quota refunds, early-arrival costing, currency fail-closed, body size, stale assumptions, Fal timeout double-spend, Istanbul date, cookie parsing, `baseRequest` validation) | — |
| 12:35–12:50 | Codex | Fixes for those findings (IP limit, exact-day fares, TRY echo required, 32 KB body cap, mode-aware assumptions, Fal queue resume, full `normalizedRequestSchema`) | f4090ef |
| 12:50–13:11 | Codex | Second, deeper review and fixes: shared in-flight results marked as cache hits, refund reservations safe under concurrency, failed provider calls counted, Fal parallel requests as one generation, stricter provider validation, fixed Google search URLs, safe-integer budgets; commit | f4090ef |
| 13:15–13:20 | Codex | Improvement proposals (event search, comparison deltas, replay, FX, weather, Geoapify, storage, LLM parsing) | — |
| 13:20–13:36 | Codex | Contract v1.2: option comparison deltas, Frankfurter FX (foreign budgets, converted totals), Open-Meteo weather, record/replay of price observations, event search (catalog, Google Events, Ticketmaster), Eventbrite import, `.env.local` template | included in review commit |
| 14:01–14:13 | Codex | Review of v1.2 and fixes: event immutability, mode/directory cache isolation, honest repricing fallback, validated replay/atomic records, event dates/countries, shared search calls, Ticketmaster/Eventbrite caps, restart version preservation, FX provenance and bounded weather; contract v1.2.1; 87 tests, typecheck and production build | 2b277f3 |
| 14:14–14:19 | Codex | Integrated reviewed backend 2b277f3 with Product Lead frontend 0314388 in an isolated checkout; kept frontend landing exactly; 87 tests, typecheck, combined production build (13 static pages); estimates-only local server; API wiring gaps documented; browser check denied by permissions | a7db23c |
| 14:28–14:44 | Codex | Contract v1.3.0: OpenAI Responses interpretation in optimize text flow (configured model, low reasoning, standard tier, strict schema, quoted grounding, spend gate, 1800 output-token cap); Geoapify selected-route nearby sights endpoint and client; guest/process total and hourly caps, shared in-flight/cache, explicit fallback and attribution; blank/commented env settings; 107 tests, typecheck and production build; no real-key provider calls | b1fa4db |
| 14:45–14:50 | Codex | Integrated backend v1.3.0 into main with frontend files/manifests unchanged; resolved build-log-only merge conflict; 107 tests, typecheck and combined production build; local demo restarted using ignored credential-file symlink; GET /api/session 200 (nearbyPlaces true, aiParsing false); no real-key provider validation | this merge commit |

| 14:56 | Codex | Configuration diagnostics without reading `.env.local`: template and ignore checked; GET /api/session reports live prices, banners, events/import and nearby enabled, AI parsing disabled; remote main confirmed at 9836495; no provider calls or new push | this log commit |
| 14:59 | Codex | Onur authorized runtime OpenAI spend; appended authorization to ignored local env without reading credentials, restarted demo server; GET /api/session 200 confirms all provider feature flags enabled; backend HEAD has no commits outside origin/main 9836495; only AGENTS.md log remains uncommitted; no external provider calls or push | this log commit |
| 15:10 | Codex | Live pricing validation after session-only check: one SerpApi flight query (Istanbul–Singapore, Oct 21) and one hotel query (Singapore, Oct 27–30); both HTTP 200, provider ok, retrieval live, fromCache false, 3 parsed offers each; 2 outbound searches, no retries; frontend served at that time calls optimize only and does not invoke price-check; no credentials read or recorded | this log commit |
| 15:12–15:17 | Codex | Onur requested work on main: preserved local log, fast-forwarded local main to Product Lead integration da88e63; reviewed explicit pricing/source labels, sights and poster wiring without editing frontend/API/contract; npm ci installed locked dependencies after missing Three.js, sandbox build initially blocked Google Fonts, subsequent 127 tests/typecheck/network-enabled production build passed; main demo restarted on 3001, session 200/all feature flags true; researched full itinerary poster references and documented proposal only | this log commit |
| 15:41–15:45 | Codex | Fetched main 39451f6 / contract v1.4.0 and merged locally as d94417f; preserved unfinished Fal scrapbook draft in a scoped Git stash, no frontend edits; Onur explicitly removed the new OpenAI dollar-ledger/model gate and retained gpt-6.1-sol for both interpretation and interests; existing key/spend gate, request/token/hourly/total caps and SerpApi free-plan guard remain; 133 tests, typecheck, production build pass; restarted main on 3001 with Sol; one real interpretation HTTP 200, mode openai/status used, 703 input and 217 output tokens, three routes, event Singapore Oct 27–29 unchanged; no push | this commit |

Verification status at 13:36: 67 unit tests, typecheck and production build pass. Frankfurter and Open-Meteo were called live. SerpApi, Ticketmaster, Eventbrite and Fal.ai have not been called with real keys yet; their adapters are tested against documented response shapes only.

Updated verification at 15:17: 127 tests across 14 files, typecheck and production build pass on local main with frontend da88e63 and backend contract v1.3.0. SerpApi flights and hotels passed one real query each at 15:10. Other real-key adapters remain unverified in this backend session. Frontend click-through for the new integration was not performed in this session; the Product Lead's earlier rehearsal is documented separately in docs/integration-handoff.md. Remote main remained 9836495 during the pull/review; this cycle does not push.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
