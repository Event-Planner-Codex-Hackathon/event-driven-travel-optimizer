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
| `src/server/pricing.ts` | Live price check for the three returned options; re-scores and re-ranks them. |
| `src/server/quote.ts` | Single flight/hotel price lookup for guests. |
| `src/server/providers/` | `PriceProvider` interface, SerpApi adapter, cache/quota runtime. |
| `src/server/guest.ts` | Anonymous guest cookie and per-guest limits (no accounts). |
| `src/server/store.ts` | In-memory store (demo only; not durable). |
| `src/app/dev/page.tsx` | Backend console to exercise every endpoint. Not the product UI. |
| `src/app/prices/page.tsx` | Functional guest price lookup page; the frontend track may restyle it. |

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

Banners are generated only on an explicit request, one 16:9 image per call with `fal-ai/flux/schnell` (4 steps), cached by city sequence + event name, deduplicated while in flight, resumed after a timeout or transient status error, and capped per server process by `FAL_MAX_GENERATIONS` (default 25). An unresolved job id is retained for the life of that process so a retry does not submit a duplicate. This state is in memory: a cold start or another instance can lose the job id and cannot guarantee cross-instance deduplication. `FAL_KEY` is read only on the server.

## Live prices (SerpApi)

Planning stays synchronous and estimate-based. Live prices are an explicit second step (`price-check`) so the demo stays fast and the free quota is spent only on request:

1. Collect the unique flight/hotel queries of the three options (recommended option first, so the cap covers it).
2. Run them through `PricingRuntime`: 15-minute cache, shared in-flight calls, per-check cap (12), rolling hourly cap (40), concurrency 3, 10 s timeout. Budget-only reoptimizations reuse the cache.
3. Flights: one-way, TRY, 1 adult, economy; airports from the city catalog (e.g. `IST,SAW`). Use the cheapest fare that departs **and lands on exactly the planned days**. A later landing would break the plan; an earlier one would leave a night and a day of costs unpriced — both keep the estimate with a warning.
4. Hotels: 1 adult, TRY; budget = cheapest (sorted by price), standard = 3–4★, comfort = 4–5★, taking the lower median. `total_rate` is used when present, else nightly × nights (flagged in `source.notes`).
5. Responses whose `search_parameters.currency` is not `TRY` are rejected (the provider defaults to USD).
6. Re-evaluate the three options with the same cost/score code (`evaluateCandidate`), re-check the event lock, re-rank.

Not verified against the live API in this repo yet (no key was configured during development). The adapter is unit-tested against the documented response shapes.

## Guest access

No accounts (per the engineering rules). `GET /api/session` issues an anonymous `eh_guest` cookie. Quota-bound actions are limited per hour per guest id **and** per client IP (3× the guest allowance, to tolerate shared networks): 5 price checks, 10 quotes, 3 new banners per guest. New outbound price-provider attempts count even if the provider returns an error; cache hits, locally blocked/not-configured lookups, and invalid input are refunded. A banner counts when a new Fal job submission is attempted.

Limits:
- The cookie id is unsigned; dropping it yields a new id, which is why the IP limit and process-wide caps exist.
- `x-forwarded-for` is trusted for the IP. That is correct behind a platform proxy (e.g. Vercel) but spoofable when the server is exposed directly.
- Store, caches and all limits are in process memory. On a multi-instance host they apply per instance, so total spend is not globally capped. For the demo, run a single instance (localhost or one server). A shared store (e.g. Redis/KV) would be needed for global caps.

## Request hardening

Bodies are capped at 32 KB before parsing (413). `baseRequest` fallbacks are validated with the full `normalizedRequestSchema`; banner context is limited to 4 cities and short strings. "Today" is computed in Europe/Istanbul.

## Fal.ai jobs

Banners use the Fal queue (`submit` → `status` → `result`). One HTTP request waits up to 50 s; if the job is still running or status polling fails transiently, the request id is kept and a retry in the same process resumes the job instead of submitting a second one. A process restart loses that in-memory id; no cross-instance guarantee is made.

## Other provider candidates

- **Frankfurter** (FX, no key): accept USD/EUR budgets and show converted totals with rate date.
- **Ticketmaster** / SerpApi Events: optional event lookup; manual event entry stays the main path.
- **Geoapify**, **Open-Meteo**: decorative context (map, weather) for the selected route.
- **Amadeus Self-Service**: the preparation notes record its developer portal as deprecated (repository archived July 2026); verify before investing time.
- **LiteAPI**: sandbox hotel data — must be labeled sandbox, never as live prices.
