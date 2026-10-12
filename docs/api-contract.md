# EventHopper API contract — v1.1.0

Source of truth: [`src/contract/trip.ts`](../src/contract/trip.ts) (types + request validation). A typed browser client is in [`src/contract/client.ts`](../src/contract/client.ts); sample requests are in [`src/contract/demo.ts`](../src/contract/demo.ts). Change fields, nullability or status values only after both owners agree, and bump `CONTRACT_VERSION`.

All money is `{ amountMinor: integer, currency: "TRY" }` (kuruş). All dates are local calendar dates `YYYY-MM-DD`; `checkOut` and `departureDate` are exclusive of the night.

## POST /api/trips/optimize

```json
{ "text": "I'm leaving from Istanbul, need to attend SWITCH Singapore October 28–30, have a 70,000 TRY total budget, and would like to add Bangkok if possible.",
  "overrides": { "budget": { "amountMinor": 7000000, "currency": "TRY" } } }
```

`text` and/or `overrides` (form fields that win over parsed text). Returns `TripResponse`:

- `status: "ready"` → exactly three `options` (labels A/B/C in rank order), `normalizedRequest`, `recommendedOptionId` (best option with `feasibility.feasible`, or `null` when nothing fits the budget).
- `status: "needs_input"` → `clarificationQuestions`, no options. Used when origin, event city, event dates or budget are missing, a city is outside the estimate catalog, the budget is not in TRY, or no route can protect every event day inside the travel window.

## POST /api/trips/{requestId}/reoptimize

```json
{ "changes": { "budget": { "amountMinor": 6500000, "currency": "TRY" }, "optionalCities": [{ "city": "Taipei" }] },
  "baseRequest": { "...previous normalizedRequest (optional)..." } }
```

Applies `changes` to the previous request and **reruns the whole planner** — city order, dates, stays, costs, feasibility, scores and ranking can all change. The response has a new `requestId`, `previousRequestId`, and `requirementsVersion + 1`; the UI should ignore any response older than the latest version it has shown. Send `baseRequest` so the call still works after a server restart (memory store). `404 request_not_found` if neither is available.

## POST /api/routes/{routeId}/hero

Body optional: `{ "route": { "title", "cities": [...], "eventName" } }` (fallback context after restart). Generates a decorative banner with Fal.ai (`fal-ai/flux/schnell`, 16:9, 1 image) **only when called**. Cached by city sequence + event, so repeat calls and reoptimized-but-identical routes cost nothing. Returns `{ routeId, heroImage: { status: "ready", url }, cached }`.

Errors: `503 hero_disabled` (no `FAL_KEY`), `429 hero_limit_reached` (`FAL_MAX_GENERATIONS` reached), `429 rate_limited` (guest limit), `502 hero_failed` (retryable), `404 route_not_found`.

## POST /api/trips/{requestId}/price-check

Body optional: `{ "baseRequest": { ...normalizedRequest } }` (fallback after restart). Prices the legs and stays of the **current three options** with Google Flights / Google Hotels via SerpApi — no new routes are generated. Queries are deduplicated, cached for 15 minutes, capped per check (`SERPAPI_MAX_CALLS_PER_CHECK`, default 12) and per hour (`SERPAPI_MAX_CALLS_PER_HOUR`, default 40). The three options are then re-scored and re-ranked; the response is a new `TripResponse` with `requirementsVersion + 1`.

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

No accounts. Issues an anonymous `eh_guest` httpOnly cookie and returns `{ guest: { id, isNew }, features: { livePrices, banners }, limits: { priceCheck, quote, hero: { remaining, max, windowMinutes } }, cities: [...] }`. The UI can hide live-price/banner buttons when a feature is off and show remaining allowance. Guest limits (per hour, per guest id and per client IP at 3×): 5 trip price checks, 10 quotes, 3 new banners. New outbound provider attempts count even when they fail; cache hits, local quota blocks, and invalid input are refunded. Process-wide caps still apply.

## Pricing summary

Every `TripResponse` has `pricing: { mode, checkedAt?, providerCalls, cacheHits, notes[] }`. Show `notes` near totals whenever `mode` is not `estimates`.

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
