# Proposal: day-by-day plan with events and weather (contract v1.1.0)

Status: **proposed by the frontend, not agreed yet.** Nothing here changes `src/contract/trip.ts` until both owners agree. The frontend already reads these fields when they are present and works without them.

## Why

The trip page now shows the route as a day-by-day plan. To make it an end-to-end plan it needs three things the planner doesn't send today:

1. The fixed event's own schedule (sessions, times, venue).
2. Other events near each stop and the event city (Eventbrite, Ticketmaster, the web).
3. Weather for every city and day, which the planner also uses when it ranks and explains routes.

## Proposed fields

### Personal interests — Product Lead requirement

The frontend's "Use the SWITCH example" now includes live jazz, house/techno, small music nights, art/design events, street food, night markets, temples, architecture, and a moderate pace. These are the sample traveller's editable preferences, not statements about events that exist. They are submitted through the existing `text` field; the current rule-based parser does not yet extract or match these interests.

For the jury demonstration, personalize suggestions from real retrieved listings around these interests and show a short, evidence-based "Why this matches you" explanation. A music-genre or category match must come from source metadata or a grounded description; do not claim a match solely because an event is in the same city.

Backend coordination with Onur is required before changing the shared contract. Proposed preference fields are music genres, event categories, sightseeing/activity interests, exclusions, and preferred pace. Preserve those preferences through destination replacement and reoptimization. Suggested event responses should include the matching preferences and a reason grounded in the listing, alongside the existing provenance and nullable price information. Unknown ticket prices remain unknown and cannot certify budget fit. All extras must fit around the fixed event and travel/rest buffers.

Until this is implemented and verified, the frontend can collect the description but must not claim the displayed listings were personalized. Explicit synthetic preview data remains a layout preview.

### Route enrichment

The Product Lead's example now requests three meaningfully different alternatives across Bangkok, Taipei, and Vietnam (Ho Chi Minh City as the proposed city), with at most one optional stop per itinerary. Three candidate cities are choices to compare, not three stops in one trip. Compare schedule, cost and sourced interest matches; do not substitute superficial hotel-style changes for route variety.

Backend dependency: the current catalog has no Vietnam city, and parsing, normalization, planner enumeration and the override schema currently cap candidate cities at two. Onur needs to coordinate support for the third candidate, Vietnam city data/provenance, and selection of up to three distinct event-safe routes. If a requested city cannot fit the hard constraints, return an explicit reason and an eligible alternative; never force three countries by relaxing event dates, hiding unknown costs, or inventing inventory. The frontend continues to show only the alternatives actually returned.

Add one optional field to `RouteOption`, and bump `CONTRACT_VERSION` to `1.1.0`:

```ts
enrichment?: {
  events: PlanEvent[];
  weather: WeatherDay[];
  considerations: PlanConsideration[];
  sources: SourceStatus[];
};
```

The exact TypeScript types are in [`src/components/trip/dayPlan.ts`](../../src/components/trip/dayPlan.ts). If we agree, they move into the shared contract.

| Type | Fields | Notes |
| --- | --- | --- |
| `PlanEvent` | `id, title, city, date, startTime?, endTime?, venue?, url?, source, fetchedAt, role, priceNote?` | `role` is `"main-event"` for the fixed event's sessions and `"nearby"` for optional things to do. `source` is `eventbrite`, `ticketmaster`, `web` or `official`. `url` must be the public page the source returned. |
| `WeatherDay` | `city, date, kind, condition, summary, highC, lowC, precipChance?, source, fetchedAt` | `kind` is `"forecast"` only for a real forecast for that date. Use `"climate"` for typical conditions when the date is beyond the forecast range. |
| `PlanConsideration` | `kind, text, date?, city?` | A short explanation built from computed facts, e.g. "Rain is likely in Bangkok on 24 Oct, so the free afternoon is kept indoors." |
| `SourceStatus` | `name, status, fetchedAt?` | One entry each for Eventbrite, Ticketmaster, Web search and Weather. `status` is `ok`, `unavailable` or `not-connected`, so the page can say exactly which source failed. |

## Rules both sides keep

- **Events never move the fixed event.** Nearby events are optional suggestions and never change route feasibility.
- **Weather can change ranking and explanations, never attendance.** A rainy forecast may lower a stopover's preference score or change a suggestion. It may not relax the event days, the arrival buffer or the return deadline.
- **Provenance on every item:** where it came from, when it was fetched, and forecast versus climate for weather. A cached item keeps its original `fetchedAt`.
- **No invented items.** If a source fails, return its status as `unavailable` and send no made-up listings. Unknown price notes are `null`.
- **Secrets stay on the server.** The Eventbrite token, Ticketmaster key and any search or weather keys are used only in route handlers.

## Source notes to verify

- **Eventbrite:** the public "search events by location" endpoint was retired some time ago. Check what the private token can actually query (for example, events by organizer or venue) before relying on it for city-wide listings.
- **Ticketmaster Discovery API:** supports search by city or coordinates and date range. Free tier is 5,000 calls a day; keep about 2 requests a second.
- **Web:** scope it to known event pages or a search API whose terms allow it. Return the source page as `url`.
- **Weather:** a free forecast API such as Open-Meteo covers about 16 days. Dates further out (this trip starts 9–20 days from today) should come back as `kind: "climate"` and be labelled as typical conditions, not a forecast.

## Frontend behaviour today

- Without `enrichment`, the day plan shows flights, hotel nights and the locked event days. A "Sources" strip marks Eventbrite, Ticketmaster, Web search and Weather as "Not connected yet".
- With `enrichment`, each day shows weather, the event's sessions, nearby events, and the planner's notes. Event links are shown only to signed-in travellers.
- `?preview=synthetic` on a trip page renders clearly labelled sample data ("Demo data — synthetic, not live offers") for layout review. It is never used as a fallback.
