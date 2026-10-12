# Backend: planner, estimates and integrations

Owner: Backend & AI Engineering (see [AGENTS.md](../AGENTS.md#team-roles-and-development-coordination)).

## Layout

| Path | Purpose |
| --- | --- |
| `src/contract/` | Shared contract (types, Zod schemas), typed client, demo requests. Coordinate changes. |
| `src/app/api/**/route.ts` | Thin HTTP handlers: validate, call a service, map errors. |
| `src/server/parser.ts` | Deterministic natural-language parser (English + common Turkish forms). Missing fields become questions, never guesses. |
| `src/server/trips.ts` | Merge text + overrides → `NormalizedRequest`, run the planner, build `TripResponse`, reoptimize. |
| `src/server/planner.ts` | Candidate enumeration, costing, scoring, selection of three options, explanations. |
| `src/server/constraints.ts` | Independent hard-constraint checker run on every candidate. |
| `src/server/estimates.ts` | `Estimator` interface + heuristic implementation. Provider adapters plug in here. |
| `src/server/catalog.ts` | City table, known events, flight model, planning rules, score weights. |
| `src/server/hero.ts` | Fal.ai banner generation with caching and a hard cap. |
| `src/server/store.ts` | In-memory store (demo only; not durable). |
| `src/app/dev/page.tsx` | Backend console to exercise every endpoint. Not the product UI. |

## Planning heuristic

1. **Hard constraints:** arrive in the event city the day before the first event day, leave the day after the last; every event day must be a full day in the event city. Chronology and the travel window are checked independently in `constraints.ts`.
2. **Families:** with optional cities → `event-focus`, plus `pre-event-stop` and `post-event-stop` for up to two optional cities. Without → `event-focus`, `lean` (budget lodging), `early-arrival` (1–2 extra nights).
3. **Variants:** each family × lodging style (budget/standard/comfort) × stopover nights (1–5).
4. **Costs:** flights from a distance model (2.25 TRY/km, min 1,500 TRY; >5,000 km arrives the next day; >11,000 km adds a connection), lodging/food/local transport from the city table, plus an 8% contingency. One adult, economy, one room.
5. **Score:** budget fit (80–100 within budget, −10 when <5% is left, steep drop when over), travel efficiency (hours, legs, connections), preference fit (optional city, stopover length vs pace, lodging style, max stops).
6. **Selection:** best variant per family (within budget first; if nothing fits, the cheapest), always keep the stop-free option, fill to three distinct families, rank feasible first.
7. **Reoptimize:** apply changes to the stored request and rerun steps 1–6.

## Demo behavior (heuristic numbers)

| Request | Result |
| --- | --- |
| Demo 1: 100k TRY, Bangkok or Taipei, Oct 27–29 | A: Bangkok 2n → Singapore, standard lodging ≈ 86.4k |
| Same, budget → 85k | Lodging drops to budget; Bangkok ≈ 72.8k still recommended |
| Same, budget → 65k | No option fits; cheapest event-safe route shown (≈ 67k, 1,960 over) |
| Demo 2: 70k TRY, Bangkok, Oct 28–30 as typed | A: direct, budget lodging ≈ 67k (tight); Bangkok options 578 TRY over. Also warns the official SWITCH dates are Oct 27–29 |

## Fal.ai credit protection

Banners are generated only on an explicit request, one 16:9 image per call with `fal-ai/flux/schnell` (4 steps), cached by city sequence + event name, deduplicated while in flight, and capped per server process by `FAL_MAX_GENERATIONS` (default 25). Failed calls are not cached and can be retried. `FAL_KEY` is read only on the server.

## Provider adapters (next)

The planner only calls `Estimator`. A provider adapter should implement the same methods, return `estimateSource: "provider"`, and fall back to the heuristic visibly (never silently). Candidates, in priority order for this demo:

- **Frankfurter** (FX, no key): accept USD/EUR budgets and show converted totals with rate date.
- **SerpApi** Google Flights / Hotels (free quota): replace flight and stay estimates for the three chosen options only, to stay within quota.
- **Ticketmaster** / SerpApi Events: optional event lookup; manual event entry stays the main path.
- **Geoapify**, **Open-Meteo**: decorative context (map, weather) for the selected route.
- **Amadeus Self-Service**: the preparation notes record its developer portal as deprecated (repository archived July 2026); verify before investing time.
- **LiteAPI**: sandbox hotel data — must be labeled sandbox, never as live prices.
