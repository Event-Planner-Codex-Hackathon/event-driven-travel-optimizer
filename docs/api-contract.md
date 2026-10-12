# EventHopper API contract — v1.0.0

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

Errors: `503 hero_disabled` (no `FAL_KEY`), `429 hero_limit_reached` (`FAL_MAX_GENERATIONS` reached), `502 hero_failed` (retryable), `404 route_not_found`.

## Errors

Every non-2xx response: `{ "error": { "code", "message", "details?" } }`. Codes: `invalid_body`, `request_not_found`, `route_not_found`, `hero_disabled`, `hero_limit_reached`, `hero_failed`, `internal`.

## Field notes

| Field | Meaning |
| --- | --- |
| `feasibility.hardConstraintsSatisfied` | Route connects origin → … → origin, chronology holds, inside the travel window, and the traveler is in the event city for the **whole** of every event day. Options that fail this are never returned. |
| `feasibility.withinBudget` | `total <= budget`. |
| `feasibility.feasible` | Both of the above. Over-budget options are still returned, with a warning, so the user can compare. |
| `estimateSource` | `heuristic` (distance-based flight model) or `mock` (lodging table). `provider` is reserved for real adapters. |
| `score` | 0–100. `total = 0.5·budgetFit + 0.2·travelEfficiency + 0.3·preferenceFit`. |
| `highlights` | Deterministic "why this option" bullets built from computed facts. |
| `pattern` | `event-focus`, `pre-event-stop`, `post-event-stop`, `lean`, `early-arrival`. |
| `assumptions` (top level) | Applies to every option: estimate disclaimer, traveler scope, event buffers, contingency, defaults. |
