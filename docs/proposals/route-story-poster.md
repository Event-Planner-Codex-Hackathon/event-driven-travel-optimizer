# Route story poster — proposed extension, 12 October 2026

Onur requested a poster that explains the whole selected journey: route order, event attendance, sightseeing suggestions and accommodation. This is a concrete handoff for the Product Lead; it does not change the product UI or the shared contract. Current frontend `da88e63` already generates Fal artwork and exports a PNG with cities, trip dates and the fixed event. It does not yet export transfers, stays or nearby sights.

## References and proposed layout

- [TripSet](https://tripset.io/) shows route infographics combining route, trip length, budget and top places. Useful reference for a single overview poster.
- [Deer Track examples](https://www.deertrack.net/examples) show editorial day-by-day itineraries and structured hotel/transfer cards. Useful reference for a readable schedule beside the artwork.
- [Fal Ideogram V3 documentation](https://fal.ai/models/fal-ai/ideogram/v3/api) offers a design/typography model if a later artistic variant needs image text. No model change or generation was made for this proposal.

Recommended version: one 1080×1920 overview poster. Use Fal for an illustrated journey background; compose every factual label, date and route connection with the existing browser Canvas exporter. A tall poster can show the whole sequence without cropping the factual content. Keep the Product Lead's branding and visual design.

```text
POOKIE · selected option and travel dates
[Fal illustration of the destination cities]

1  DEPARTURE CITY → FIRST DESTINATION
   Departure date → arrival date · transport mode

2  FIRST DESTINATION · arrival → departure
   Stay: check-in → check-out · N nights · lodging style
   Explore: names from already retrieved Geoapify results
            Optional suggestions · hours/fees unknown

3  EVENT CITY · inclusive event dates · FIXED EVENT
   Event name · event attendance takes priority
   Stay: check-in → check-out · N nights

4  RETURN JOURNEY · departure → arrival date

Estimated/mixed total only if its complete source label fits
AI artwork · planned itinerary, not a booking
Geoapify / OpenStreetMap attribution when sights are included
```

This is a layout example, not a generated itinerary or a live offer. The actual number and order of sections must come from the selected route, including post-event stopovers when present. Use arrows as a schematic sequence rather than claiming a navigable or geographically accurate map.

## Available data and truthful wording

| Poster section | Authoritative input | Constraint |
| --- | --- | --- |
| City order | `RouteOption.citySequence` and `legs` | Preserve chronology, return origin and overnight arrival dates. |
| Event | `RouteOption.event` | Render its city and inclusive dates exactly. Do not schedule sightseeing during locked attendance days. |
| Travel | `legs[].fromCity/toCity/departureDate/arrivalDate/mode` | No invented departure hours, flight numbers or confirmed tickets. |
| Stay | `stays[].city/checkIn/checkOut/nights/style` | Current contract has no separately selected/booked hotel. Say planned stay in the city; no confirmed hotel name/address. |
| Sights | Successful, explicitly retrieved selected-route Geoapify response | Suggestions around the catalog city centre, not an assigned visit schedule or hotel/venue proximity guarantee. Preserve source and original timestamp; hours, fees and availability unknown. |
| Prices | Per-line `estimateSource` and `source`, plus totals | A mixed/estimated total cannot be labelled fully live. Replay must remain recorded, not current. Omit price if the full provenance would be unreadable. |

Hotel provider descriptions may mention a search-result property, but that is not a booking or a user-confirmed hotel. A future selected-hotel field would require a coordinated optional contract extension. Likewise, an exact order/time for visiting sights needs a separate validated day plan; Geoapify currently provides a list of suggestions only.

## Fal and integration boundaries

- Reuse the existing explicit `requestHero(option)` action and single-image Fal queue. Current backend uses `fal-ai/flux/schnell`, cached by destination city order and event; that artwork is decorative and does not carry itinerary facts.
- Do not ask the image model to invent hotels, activities, routes, prices or long factual text. Canvas renders these from the selected response after the image loads.
- Keep sightseeing retrieval as the existing explicit action. Pass its accepted response to the exporter; export itself must not start new Geoapify, price or Fal calls. Include only results belonging to the selected route ID.
- Generate the same artwork once, then recompose dates/stays/text without a second paid generation. Existing image and quota caches remain applicable.
- If a model-generated route diagram becomes a later requirement, its cache key must include the illustrated route context; schematic geometry must not be used for navigation. That is a separate backend change.
- No new endpoint or contract version is needed for this deterministic overlay using current route fields and the existing nearby-places response. Product Lead owns edits to `TripPoster.tsx`, `exportPoster.ts`, `NearbySights.tsx` and layout styles.

## Acceptance checks for the extension

1. Export contains every travel leg in order, each stay and the exact locked event dates; overnight flights retain their arrival day.
2. No chosen/booked hotel is implied from a city stay or a search-result description. Missing sights show as not retrieved, not synthetic recommendations.
3. Switching/reoptimizing routes discards unrelated sights and uses current route facts. Cached decorative artwork cannot overwrite current dates or stays.
4. Sight names are optional suggestions with attribution; no fabricated visit time, admission fee or opening hours.
5. Long names and the full route remain readable and inside the PNG at the supported route limit. No labels are clipped.
6. Repeat export uses zero provider calls; generation remains one explicit image within guest/process credit caps.

Status: researched proposal only. No frontend change, paid generation, new route calculation or contract change was performed for this extension.
