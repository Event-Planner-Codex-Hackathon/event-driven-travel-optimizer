# Pookie API contract — v1.4.0

v1.4 adds `POST /api/routes/{routeId}/events` for grounded preference-based discovery. Its request and response types are `recommendEventsBodySchema` and `EventRecommendationsResponse` in the source of truth below. It never modifies route feasibility or budget. Event candidates may carry real descriptions, raw date text, observation/cache provenance and listed price notes; `web` means an unconfirmed public discovery page, not a verified ticket offer. The live frontend chains price-check after optimize/reoptimize, and OpenAI uses the configured model with explicit spend authorization and bounded requests. See [current handoff](integration-handoff.md) for exact wiring and limitations.

Source of truth: [`src/contract/trip.ts`](../src/contract/trip.ts) (types + request validation). A typed browser client is in [`src/contract/client.ts`](../src/contract/client.ts); sample requests are in [`src/contract/demo.ts`](../src/contract/demo.ts). Change fields, nullability or status values only after both owners agree, and bump `CONTRACT_VERSION`.

All money is `{ amountMinor: integer, currency: "TRY" }` (kuruş). All dates are local calendar dates `YYYY-MM-DD`; `checkOut` and `departureDate` are exclusive of the night.

## POST /api/trips/optimize

```json
{ "text": "I'm leaving from Istanbul, need to attend SWITCH Singapore October 28–30, have a 70,000 TRY total budget, and would like to add Bangkok if possible.",
  "overrides": { "budget": { "amountMinor": 7000000, "currency": "TRY" } } }
```

`text` and/or `overrides` (form fields that win over parsed text). Returns `TripResponse`:

- `status: "ready"` → exactly three `options` (labels A/B/C in rank order), `normalizedRequest`, `recommendedOptionId` (best option with `feasibility.feasible`, or `null` when nothing fits the budget).
- `status: "needs_input"` → `clarificationQuestions`, no options. Used when origin, event city, event dates or budget are missing, a city is outside the estimate catalog, a foreign budget cannot be converted, or no route can protect every event day inside the travel window.

## POST /api/trips/{requestId}/reoptimize

```json
{ "changes": { "budget": { "amountMinor": 6500000, "currency": "TRY" }, "optionalCities": [{ "city": "Taipei" }] },
  "baseRequest": { "...previous normalizedRequest (optional)..." } }
```

Applies `changes` to the previous request and **reruns the whole planner** — city order, dates, stays, costs, feasibility, scores and ranking can all change. The response has a new `requestId`, `previousRequestId`, and `requirementsVersion + 1`; the UI should ignore any response older than the latest version it has shown. Send `baseRequest` so the call still works after a server restart (memory store). Also send optional `baseRequirementsVersion` (the latest version shown) to continue the version sequence; legacy clients that omit it restart from version 1 when memory is lost. Changes to the locked event identity, city or dates return `400 invalid_body`; choose a new event via a new optimize request. `404 request_not_found` if neither is available.

## POST /api/routes/{routeId}/hero

Body optional: `{ "route": { "title", "cities": [...], "eventName" } }` (fallback context after restart). Generates a decorative banner with Fal.ai (`fal-ai/flux/schnell`, 16:9, 1 image) **only when called**. Cached by city sequence + event, so repeat calls and reoptimized-but-identical routes cost nothing. Returns `{ routeId, heroImage: { status: "ready", url }, cached }`.

Errors: `503 hero_disabled` (no `FAL_KEY`), `429 hero_limit_reached` (`FAL_MAX_GENERATIONS` reached), `429 rate_limited` (guest limit), `502 hero_failed` (retryable), `404 route_not_found`.

## POST /api/trips/{requestId}/price-check

Body optional: `{ "baseRequest": { ...normalizedRequest }, "baseRequirementsVersion": 8 }` (fallback after restart). Prices the legs and stays of the **current three options** with Google Flights / Google Hotels via SerpApi — no new routes are generated. Queries are deduplicated, cached for 15 minutes, capped per check (`SERPAPI_MAX_CALLS_PER_CHECK`, default 12) and per hour (`SERPAPI_MAX_CALLS_PER_HOUR`, default 40). A restart fallback increments the supplied base version exactly once. The three options are then re-scored and re-ranked; the response is a new `TripResponse` with `requirementsVersion + 1`.

- A fare is used only if it departs and lands on exactly the planned days; otherwise the estimate stays and a warning says so. The event lock is re-checked. Responses not echoing `TRY` are rejected.
- Provider-priced lines have `estimateSource: "provider"` and `source` (`product`, `fetchedAt`, `fromCache`, `description`, optional public `searchUrl`). Other lines keep `heuristic`/`mock`.
- `pricing.mode` is `estimates`, `mixed` or `provider` (all flights and stays provider-priced). Food, local transport and contingency are always estimates, so a total is never fully live.

Errors: `503 provider_unavailable` (no `SERPAPI_API_KEY`), `429 rate_limited` (guest limit; `Retry-After` header), `404 request_not_found`.

## POST /api/prices/quote (guest price lookup)

```json
{ "kind": "flight", "from": "Istanbul", "to": "Singapore", "date": "2026-10-25" }
{ "kind": "hotel", "city": "Bangkok", "checkIn": "2026-10-23", "checkOut": "2026-10-25", "style": "standard" }
```

Returns `QuoteResponse`: the planning `estimate` (always) and `provider` — `{ status: "ok", offers[≤3], fetchedAt, fromCache, searchUrl? }` or `{ status: "unavailable", reason, message }`. Works without a key (estimate only). `400 invalid_body` for unknown cities, past dates, or stays outside 1–30 nights. A new outbound provider attempt counts against the guest allowance even if it fails; a local cache hit or local quota block does not.

## GET /api/session (guest)

No accounts. Issues an anonymous `eh_guest` httpOnly cookie and returns `{ guest: { id, isNew }, features: { livePrices, banners, priceMode, eventSearch, eventImport }, limits: { priceCheck, quote, hero, eventSearch: { remaining, max, windowMinutes } }, cities: [...] }`. The UI can hide live-price/banner buttons when a feature is off and show remaining allowance. Guest limits (per hour, per guest id and per client IP at 3×): 5 trip price checks, 10 quotes, 3 new banners, 10 event searches/imports. New outbound provider attempts count even when they fail; cache hits, local quota blocks, and invalid input are refunded. Process-wide caps still apply.

## Pricing summary

Every `TripResponse` has `pricing: { mode, checkedAt?, providerCalls, cacheHits, notes[] }`. Show `notes` near totals whenever `mode` is not `estimates`.

## Option comparison and currencies (v1.3.0)

- `options[].comparison`: this option vs the baseline (recommended option, else option A): `delta.total/transport/lodging` (Money, negative = cheaper), `delta.nights/flights/connections/travelMinutes`, `addedCities`, `droppedCities`, `comparablePricing` (false when the two are priced from different sources) and a ready-to-show `summary`, e.g. `"8,208 TRY cheaper · 1 flight fewer · 2 nights less · skips Bangkok"`. Empty summary for the baseline.
- Budgets may be given in TRY, EUR, USD or GBP (text or `overrides.budget.currency`). Non-TRY budgets are converted to TRY with Frankfurter reference rates and an assumption records the rate and its date; if no rate is available the API asks for a TRY budget. `normalizedRequest.budget` is always TRY.
- `fx` (when rates are available): `{ base: "TRY", rates: { EUR, USD, GBP }, date, source: "frankfurter", note }`, and `options[].convertedTotals`: the TRY total converted for display only.

## Recorded observations (replay)

`PRICE_MODE=record` saves each successful SerpApi result; `PRICE_MODE=replay` serves them without provider calls. Provider-priced lines then carry `source.retrieval: "replay"` and the original `source.observedAt`; `pricing.retrieval` is `"replay"` and the first pricing note and assumption say these are recorded observations, not current prices. Quotes carry the same `retrieval` / `observedAt`. Live, record and replay use separate caches (also isolated by recording directory). Invalid modes disable pricing. Replay validates the original query, TRY money, offer shapes and observation time; invalid or missing files keep estimates with an explicit warning. Recordings are ignored by Git pending terms review and approval.

## GET /api/weather

`?city=Singapore&start=2026-10-26&end=2026-10-30` (catalog city, at most 21 days). Returns `{ city, days[], forecastHorizon, source: "open-meteo", attribution, note }`. Each day is `forecast` (temperatures °C, precipitation probability %, precipitation mm, WMO `weatherCode` and `summary`), `beyond_forecast` (past the ~16-day horizon; no values) or `unavailable` (service error). Show the attribution. Weather never affects planning.

## GET /api/events/search

`?q=SWITCH&city=Singapore` (city optional). Returns `{ query, results: EventCandidate[], sources[], note }`. Sources: the curated catalog (always, `dateConfidence: "verified"`), Google event results via SerpApi Google Search (`engine=google`, `events_results`) and Ticketmaster when their keys are set (`"listed"`, or `"partial"` when a date could not be read). Each candidate has `plannable` (city in our catalog and both dates known), `warnings`, and — only when plannable — `overrides.event` to send to `/api/trips/optimize` **after the user confirms**; that event then becomes the locked constraint. Rate-limited per guest (`eventSearch`) when a provider is configured. Google results without an explicit year or readable range end are partial and cannot be planned directly. Ticketmaster results with no end date are also partial. Country conflicts prevent mapping a venue to a catalog city. Identical concurrent searches share one outbound call; only the initiating caller spends quota.

## POST /api/events/import

`{ "url": "https://www.eventbrite.com/e/...-tickets-123456789" }` or a bare id. Imports one Eventbrite event (Eventbrite shut down keyword search in 2019). Returns `{ candidate, sources }`. `503 provider_unavailable` without `EVENTBRITE_TOKEN`; `400` for links that are not HTTPS Eventbrite event links or unknown ids. Ticketmaster and Eventbrite each have a per-process rolling hourly cap of 40 (`TICKETMASTER_MAX_CALLS_PER_HOUR`, `EVENTBRITE_MAX_CALLS_PER_HOUR`); failures count, local cap blocks do not. These process caps supplement provider account limits; they are not durable or account-wide quota guarantees.

## Errors

Every non-2xx response: `{ "error": { "code", "message", "details?" } }`. Bodies over 32 KB get `413 invalid_body`. `baseRequest` must match the full `NormalizedRequest` shape (`normalizedRequestSchema`). Codes: `invalid_body`, `request_not_found`, `route_not_found`, `hero_disabled`, `hero_limit_reached`, `hero_failed`, `rate_limited`, `provider_unavailable`, `internal`.

## Field notes

| Field | Meaning |
| --- | --- |
| `feasibility.hardConstraintsSatisfied` | Route connects origin → … → origin, chronology holds, inside the travel window, and the traveler is in the event city for the **whole** of every event day. Options that fail this are never returned. |
| `feasibility.withinBudget` | `total <= budget`. |
| `feasibility.feasible` | Both of the above. Over-budget options are still returned, with a warning, so the user can compare. |
| `estimateSource` | `heuristic` (distance-based flight model), `mock` (lodging table) or `provider` (after a live price check; see `source`). |
| `score` | 0–100. `total = 0.5·budgetFit + 0.2·travelEfficiency + 0.3·preferenceFit`. |
| `highlights` | Deterministic "why this option" bullets built from computed facts. |
| `pattern` | `event-focus`, `pre-event-stop`, `post-event-stop`, `lean`, `early-arrival`. |
| `assumptions` (top level) | Applies to every option: estimate disclaimer, traveler scope, event buffers, contingency, defaults. |


## OpenAI interpretation (v1.3.0, optional)

The existing `POST /api/trips/optimize` text flow uses OpenAI when **both** `OPENAI_API_KEY` and `OPENAI_SPEND_AUTHORIZED=true` are configured. Structured forms with no text never call OpenAI. `OPENAI_MODEL` selects the model (default `gpt-6.1-sol`); reasoning effort is low for GPT-5/6, standard service tier, `store:false`, at most 1,800 output tokens including reasoning, no tools and no automatic retries.

OpenAI returns only a strict requirements schema. Non-null critical fields need supporting quotes that occur in the input; cities/dates/budgets are grounded and validated locally. Deterministically parsed event fields take precedence, then explicit form overrides win. The existing planner checks attendance, chronology, budget and ranking. Reoptimization never asks a model to change a locked event.

Optional `TripResponse.interpretation`: `{ mode: "deterministic" | "openai", status: "disabled" | "used" | "fallback", model?, fromCache?, note, usage?: { inputTokens, outputTokens } }`. Disabled, failed and capped interpretation is explicit in this metadata and assumptions; fallback uses the deterministic parser, never synthetic results. Missing fields still become clarification questions. Successful responses may expose token counts, never prompts, raw provider errors or credentials.

Process limits default to **10 attempts/hour and 20 attempts total**, configured with `OPENAI_MAX_CALLS_PER_HOUR` / `OPENAI_MAX_CALLS_TOTAL`. Environment limits can lower, not raise, those ceilings. Per guest: 5 attempts/hour, also IP-limited; failed outbound attempts count. Successful identical text/model/date requests share in-flight calls and a 15-minute cache. A cache hit or local block refunds the guest reservation. These process limits reset on restart and do not enforce a durable dollar budget or provider-account spending limit.

## POST /api/routes/{routeId}/places

Body optional: `{ "route": { "cities": ["Bangkok", "Singapore"] } }`, used only if the route is absent from the in-memory store. Stored route cities are authoritative. At most two distinct catalog cities; no arbitrary coordinates or provider URL is accepted.

Returns `NearbyPlacesResponse`: `{ routeId, source: "geoapify", cities: NearbyCityPlaces[], providerCalls, attribution, note }`. Each city includes `status: "ok" | "not_configured" | "quota" | "unavailable"`, `places`, the catalog city `centre`, `radiusMeters`, original `fetchedAt?`, `fromCache` and `note`. Each place includes `id, name, latitude, longitude, categories, distanceMeters`, optional `address` and sanitized public `website`. Show attribution. These are sights within 5 km of the city centre, **not verified hotel/event-venue proximity**. Fees, hours and availability are unknown; they never change route cost, event lock, feasibility or ranking.

One Geoapify Places request per city, `tourism.sights`, at most 5 results; no geocoding or follow-up calls. Successful city searches share in-flight calls and a 6-hour cache. `GEOAPIFY_MAX_CALLS_PER_HOUR` / `GEOAPIFY_MAX_CALLS_TOTAL` default to 20/hour and 100 total per process; configurable downward only. Per guest: 10 lookups/hour, also IP-limited. Failed attempts count; cache/local-block-only requests are refunded. Without a server key the endpoint returns `503 provider_unavailable`; unsupported fallback cities return `400 invalid_body`; absent route/context returns `404 route_not_found`.

`RouteOption.nearbyPlaces?` reserves an optional additive attachment for frontend integration; this endpoint returns decorative context separately and does not mutate a priced/stored route. `getNearbyPlaces(route)` is in the typed client. Product Lead owns wiring the new nearby-place result into the UI.

`GET /api/session` adds optional `features.aiParsing`, `features.nearbyPlaces` and optional `limits.interpret` / `limits.nearby`. Feature inspection makes no external calls and does not expose keys.
