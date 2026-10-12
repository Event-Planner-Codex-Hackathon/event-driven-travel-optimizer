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
| `src/server/comparison.ts` | Option-vs-baseline deltas and summaries. |
| `src/server/events.ts` | Event search (catalog, Google Events, Ticketmaster) and Eventbrite import. |
| `src/server/providers/fx.ts` | Frankfurter reference rates (budget conversion, display totals). |
| `src/server/providers/weather.ts` | Open-Meteo daily forecast. |
| `src/server/providers/observations.ts` | Record / replay of provider price observations. |
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

## Integrations added after v1.1

| Integration | Key | Used for | Notes |
| --- | --- | --- | --- |
| Frankfurter | none | EUR/USD/GBP budgets → TRY; display totals | Daily reference rates, 6 h cache; the rate and date are recorded in assumptions. |
| Open-Meteo | none | `GET /api/weather` | ~16-day horizon; later days are `beyond_forecast`. Free for non-commercial use with attribution. |
| SerpApi Google Events | `SERPAPI_API_KEY` | `GET /api/events/search` | Shares the SerpApi hourly cap; 1 h cache. Dates as listed. |
| Ticketmaster Discovery | `TICKETMASTER_API_KEY` | `GET /api/events/search` | Coverage of business conferences outside its markets is limited. |
| Eventbrite | `EVENTBRITE_TOKEN` | `POST /api/events/import` | Keyword search was shut down in 2019; import by event link/id only. Token sent as a Bearer header. |
| Recorded observations | — | `PRICE_MODE=record` / `replay` | See `data/observations/README.md`. |

Not verified against live responses yet: SerpApi (flights, hotels, events), Ticketmaster, Eventbrite, Fal.ai — no keys were configured during development; adapters are unit-tested against documented shapes. Frankfurter and Open-Meteo were called live.

## Other provider candidates

- **Geoapify**: map and nearby places for the selected route.
- **Amadeus Self-Service**: portal closed July 2026; not pursued.
- **LiteAPI**: sandbox hotel data — must be labeled sandbox, never as live prices.


## v1.2.1 review safeguards

Review findings and concrete regressions: [backend-review-2026-10-12.md](backend-review-2026-10-12.md).

The locked event cannot change through reoptimization. Restart fallbacks accept optional `baseRequirementsVersion`; clients should pass the latest displayed version. Live, record and replay caches are separated; recording directories are isolated. A failed second price check rebuilds heuristic costs rather than relabeling old provider prices. Replay files require matching queries, valid TRY money, valid observation timestamps and supported offers. Writes use atomic rename, and recordings are Git-ignored until sharing is approved.

Event discovery does not infer a missing year or end date into a plannable hard constraint. Ticketmaster and Eventbrite country conflicts prevent city matching. Concurrent identical event searches share calls. Ticketmaster and Eventbrite attempts each have an hourly process cap of 40; failures count. These in-memory caps reset on restart and supplement, rather than replace, the provider account's actual free-plan allowance. Confirm the account allowance and disable paid overage before real-key tests.

Weather ranges are checked before daily arrays are allocated, and missing forecast values stay unavailable. FX responses must contain one common valid reference date. Budget conversion assumptions survive destination-only reoptimization.


## OpenAI and Geoapify (v1.3.0)

- `src/server/providers/openai.ts`: Responses API structured extraction with quoted evidence and local validation. Runtime model comes from `OPENAI_MODEL`; default `gpt-6.1-sol`. The key alone never authorizes spending: `OPENAI_SPEND_AUTHORIZED=true` is separately required after confirming spend or event credits. No SDK installation, tools, automatic retries or model-priced routes.
- `src/server/interpretation.ts`: attaches interpretation to the existing optimize text flow, with deterministic fallback explicitly labeled. Form overrides remain authoritative; structured forms do not call the model.
- `src/server/providers/geoapify.ts` and `/api/routes/{routeId}/places`: optional sights around up to two catalog city centres, not venue-specific recommendations. Attribution and unknown fees/hours are explicit.
- `src/server/providers/limited.ts`: bounded cache, in-flight sharing, hourly and total attempt ceilings. Failures count. Configurable limits are clamped to the safe defaults; process restart clears all limits. Provider dashboard limits/no-paid-overage settings and a single-process demo remain required.

No real-key OpenAI or Geoapify call has been made during this implementation. Tests use synthetic responses and verify grounding, event precedence, form precedence, no-spend gating, failed-attempt accounting, quota refunds, cache sharing and secret-safe output. Main product UI wiring for nearby places remains with Product Lead; the existing text form can use OpenAI through its existing optimize endpoint when authorized/configured.

Primary implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [reasoning token limits](https://developers.openai.com/api/docs/guides/reasoning), [Geoapify Places](https://apidocs.geoapify.com/docs/places/). Model/price documentation was checked on 12 October 2026; the application does not estimate API dollar charges from outdated hardcoded prices.
