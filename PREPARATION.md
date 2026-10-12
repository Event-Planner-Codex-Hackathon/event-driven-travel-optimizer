# Event driven travel optimizer preparation

Prepared October 11, 2026 for the October 12 hackathon in Istanbul. Build a single-page trip comparison tool that protects a fixed event, compares realistic route options, and recalculates when an optional destination changes. The proposed implementation uses Next.js, TypeScript, SerpApi travel search, and a deterministic optimizer. All material below is a plan; no application has been implemented.

## Event facts and working window

The [organizer's current event page](https://luma.com/2muyi4f3) confirms October 12 at DotsHub, check-in 08:30–09:00, hacking 09:30–16:00, and lunch available while building continues. Preliminary judging allows a two-minute pitch/demo and one minute of questions. Five criteria each carry 20%: problem/value, execution/quality, use of Codex/tools, potential/impact, and pitch quality. The page requires a product built from scratch during the day. It advertises day-of ChatGPT Pro access for Codex; it does not establish runtime OpenAI API credits for this application. Registration is closed; use the participant confirmation for attendance details. Older aggregator agendas differ, so use the organizer's page.

Plan six hours of development, 09:30–15:30, then reserve 30 minutes for submission. Tonight's research, credentials guidance, and planning remain separate from the application build. Check any additional rules announced at the opening before using prepared materials.

The [official SWITCH site](https://www.switchsg.org/) confirms October 27–29, 2026 at Marina Bay Sands Expo & Convention Centre, Singapore. The attendee pass is advertised as free to register; that does not mean every associated programme or paid activity is included. Daily attendance hours have not been established here. The demo should protect all three local calendar days and require arrival in Singapore by October 26, with onward departure no earlier than October 30. Those buffers are conservative product assumptions, not published event hours.

## Verified environment

Checks performed in this workspace on October 11:

| Check | Observed result |
| --- | --- |
| Starting workspace | Empty; no application or Git repository |
| Codex CLI | 0.154.0; `codex login status` reports ChatGPT authentication |
| Node | v24.18.0 |
| npm / pnpm | 11.16.0 / 10.29.3 |
| Git | 2.54.0, Apple Git-157 |
| Python | 3.9.6; not needed for the proposed app |
| Workspace access | Read/write access passed |
| Local web serving | Temporary in-memory Node server returned HTTP 200 over loopback; closed afterward |
| Package registry | HTTPS npm registry request passed; Next.js 16.4.0 metadata requires Node >=20.9.0 |
| Timezone support | Istanbul, Singapore, Bangkok, and Taipei recognized |
| Runtime credentials | OPENAI_API_KEY, SERPAPI_API_KEY, TICKETMASTER_API_KEY, DUFFEL_ACCESS_TOKEN, AMADEUS_API_KEY, AMADEUS_API_SECRET absent from this shell |

The active Codex conversation and tool execution work. The [official authentication guide](https://learn.chatgpt.com/docs/auth) documents the status command. No inference call, travel search, deployment, package installation, project build, or browser rendering of an application was performed. Credential absence in this shell does not prove absence in a password manager or another session. Authenticated provider access and runtime OpenAI model access remain unverified.

## Architecture

Use one Next.js application with TypeScript and React, server route handlers, Zod validation, and Luxon for timezone conversion. Use npm and pin dependencies in the lockfile created tomorrow. Keep UI, adapters, and optimizer in one repository. No database, account system, queue, vector search, agent framework, or separate backend is needed.

The request flow is: text or form input → validated TripRequirements → bounded route templates → server-side provider adapters → normalized offers → deterministic feasibility and ranking → comparison cards and timeline. A separate explanation request receives only computed facts and source IDs. Reject malformed AI output; retain an editable form and template-based explanations when AI is unavailable. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) supports schema-constrained responses, but business validation remains application code.

Proposed routes are POST /api/interpret, POST /api/optimize, and POST /api/explain. Event search is optional. There should be no booking or payment endpoint. Provider methods conceptually include searchFlights(query), searchHotels(query), and searchEvents(query). Return normalized data and explicit status: success, empty, timeout, quota, or authentication failure. Do not disguise a provider error as zero inventory.

Use an in-memory cache for the running demo and browser localStorage for the user's requirements. An explicitly labelled replay dataset can be captured during the event from real successful responses, if the provider's terms permit retention; strip secrets and save original observation times. Hosting is optional until the first end-to-end flow works. If using a host, keep API secrets in its server environment and do not rely on persistent serverless memory or disk. Localhost remains the demonstration fallback, subject to the organizer's submission requirements.

A process-local request counter cannot enforce an account-wide allowance across serverless instances. Prefer live queries in the local demo and a clearly labelled permitted replay or unavailable-data view in any public deployment until shared quota protection is verified. This avoids adding infrastructure solely for the hackathon. Further preparation and observed deployment-tool status are indexed in START-HERE.md.

## Provider decision

| Provider | Access and credentials | Data and free testing | Decision |
| --- | --- | --- | --- |
| SerpApi Google Flights and Google Hotels | Self-service account and API key; account activation still needs checking | Public search-result observations; not a booking-system guarantee. Free plan: 250 searches/month, 50/hour | Primary for both travel categories |
| Ticketmaster Discovery | Instant Discovery access after registration/key issuance | Real event listings; default 5,000 calls/day. Documentation differs on 2 vs 5 requests/sec; throttle to 2 | Optional event discovery, not required for SWITCH |
| Duffel Flights | Self-service test token; live account activation requires billing/funding steps | Free sandbox; sandbox prices are not live and Duffel Airways schedules are synthetic. Live search can incur excess-search fees | Possible sandbox integration fallback, not a credible live-price fallback |
| Booking.com Demand | Managed Affiliate partnership, contract, account manager, token and affiliate ID | Sandbox and production exist behind partner access; no open self-service free tier established | Exclude from the hackathon critical path |
| Skyscanner Travel APIs | Partnerships application and approval; x-api-key | Live and indicative products exist; no immediate public testing entitlement established | Exclude unless already approved |
| Amadeus Self-Service | Legacy access path deprecated; portal announces decommissioning | Old free-quota tutorials remain indexed and should not guide new onboarding | Exclude; Enterprise onboarding is not tomorrow's plan |

Sources: [SerpApi pricing](https://serpapi.com/pricing), [Flights reference](https://serpapi.com/google-flights-api), [Hotels reference](https://serpapi.com/google-hotels-api), [Ticketmaster onboarding](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/), [Ticketmaster FAQ](https://developer.ticketmaster.com/support/faq/), [Duffel test mode](https://duffel.com/docs/api/overview/test-mode), [Duffel activation](https://help.duffel.com/hc/en-gb/articles/360019685579-How-do-I-go-live-once-I-ve-built-my-integration), [Duffel pricing](https://duffel.com/pricing), [Booking.com prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites), [Skyscanner authentication](https://developers.skyscanner.net/docs/getting-started/authentication), [Amadeus portal notice](https://admin.developers.amadeus.com/), and [official Amadeus developer organization](https://github.com/amadeus4dev), marked deprecated and archived July 17, 2026.

SerpApi is an independent service that extracts Google travel results, not an official Google booking API. Flight searches expose a source search URL and may expose a booking token for a follow-up options request. Hotels expose stay totals and links when available. Use only returned public links; do not manufacture offer-specific links. A search-page link must say “Search this route”; a verified returned offer link may say “View booking option.” Never promise the quoted price remains available at click-through.

Event discovery is a convenience. Ticketmaster's inventory does not establish coverage of SWITCH or every Asian business conference. The must-have path is manual event name, city, date interval, and official URL, with user confirmation. Arbitrary website scraping and automatic event-page parsing are outside the first version.

## Credentials and preparation actions

1. Create or confirm a SerpApi free account and obtain SERPAPI_API_KEY. Check the account dashboard for the active plan, remaining searches, and hourly throughput. No paid upgrade or overage authorization is implied. The [Account API](https://serpapi.com/account-api) is documented as free and reports quota, but its raw response contains credentials and must never be logged.
2. Obtain OPENAI_API_KEY for an OpenAI Platform project and set OPENAI_MODEL to a structured-output-capable model actually available to that project. Check funding or event-provided API credits separately. Do not infer runtime API access from Codex's ChatGPT login. Do not make paid inference calls tonight; tomorrow use runtime inference only within an explicitly authorized budget or confirmed credits. The manual form remains functional without it.
3. Optionally obtain TICKETMASTER_API_KEY after the core flow works. No event key is necessary for manual fixed-event entry.
4. No flight-booking, card-processing, affiliate, or payment credentials are required. Hosting/GitHub account access is only needed if the submission requires a hosted URL or repository.
5. Tomorrow, place secrets in an ignored .env.local and create a value-free .env.example. Never use NEXT_PUBLIC_ for provider keys. Do not paste keys into chat.

No accounts were created and no keys were collected during this preparation.

## Data contracts to implement tomorrow

These are schema designs, not code. Use stable identifiers and explicit nullable fields. Unknown money is null, never zero. Store monetary amounts in integer minor units with ISO currency codes; never sum formatted strings. Convert only with an explicit FX source and timestamp. Prefer requesting TRY for the MVP, and validate the returned currency rather than assuming the request was honored.

| Entity | Required fields and meaning |
| --- | --- |
| TripRequirements | id, originCityId, permittedOriginAirportIds, departureDateWindow, returnArrivalDeadline with origin timezone, travelerCount, cabin, baggage requirement, budget Money, requiredEventIds, optionalCityIds, optionalCityRequired flag, minimumNights, hotel preferences and hard/soft flags, allowances, rankingWeights, assumptions awaiting confirmation |
| FixedEvent | id, title, cityId, venue, timezone, startLocalDate, endLocalDateInclusive, optional exact attendance intervals, requiredArrivalBy, earliestDepartureAt, sourceUrl, verifiedAt, verificationStatus, admissionCost or unknown, attendanceRequired |
| City | id, name, countryCode, IANA timezone, airportIds, airport-to-city buffer assumption, optional event-venue buffer; restrict launch list to Istanbul, Singapore, Bangkok, Taipei |
| FlightOffer | id, providerOfferId, segment list, passenger/cabin/baggage scope, totalFare Money, tax/baggage coverage, ticketGroupId, separateTicket flag, provenanceId, publicLink with linkType |
| FlightSegment | departureAirportId, arrivalAirportId, local date-times, both IANA zones, resolved UTC instants, carrier/flight number if supplied, arrival date explicitly retained; never infer same-day arrival |
| HotelOffer | id, hotel/provider IDs, cityId, name, checkInLocalDate, checkOutLocalDateExclusive, roomCount, adultCount, room/rate description, stayTotal Money, tax/fee coverage, meal/cancellation facts if supplied, preference matches, provenanceId, publicLink |
| TravelLeg | id, fromCityId, toCityId, selected FlightOffer ID, departAtUTC, arriveAtUTC, door-to-door buffer minutes, ticketGroupId; each selected offer charged once |
| CityStay | cityId, arrivalAtUTC, departureAtUTC, hotel check-in/out dates, nights, chosen HotelOffer ID, explicit uncovered overnight intervals |
| ItineraryAlternative | id, requirementsVersion, ordered legs/stays, event coverage, cost line items, observed subtotal, estimated allowances, unknown items, planningTotal or null, budgetStatus, feasibilityStatus and reasons, cost/duration/preference score components, source mix, warnings, comparison deltas |
| PricingProvenance | id, provider, upstreamSource, sourceKind (observed/estimated/sandbox), retrievalKind (fresh/cached/manual), quoteObservedAt, fetchedAt, providerExpiresAt nullable, appFreshUntil, queryFingerprint, currency, passenger/room/date scope, tax inclusion, estimate method if applicable, safe evidence reference |
| CostLineItem | category, entityId, Money or null, quantity basis, coverage, provenanceId; distinguish flight total, hotel stay total, admission, ground transport, daily allowance, baggage, and contingency |
| FxQuote if needed | baseCurrency, quoteCurrency, decimal rate, source, observedAt, rounding rule; no silent fallback rate |

Separate data origin from retrieval mode: a cached sandbox result remains sandbox; a recently fetched estimate remains an estimate. Persist original quote time on replay. “Live” means a successful fresh provider observation during this search, with its time shown; it is not a bookability guarantee. If upstream cache age is uncertain, label it “Provider result; freshness unverified.” Mark reused observed prices “Cached.” Expired observations can be shown as historical but do not certify current feasibility or price.

An itinerary's total must disclose the mix. With user-approved transport/food allowances, display “Planning total including estimates.” If required costs or taxes are unknown, display “Known subtotal; budget not verified.” A result containing sandbox offers is a simulation and must be excluded from real-trip recommendations.

## Deterministic optimization

Use bounded enumeration, not an LLM route planner or a solver service. The MVP accepts one event and at most one optional stop. Report “best among the options searched,” not a global optimum.

1. Normalize and confirm requirements. Interpret “around October 21” as a proposed October 20–22 departure window and “return November 1” as arrival back in Istanbul by November 1, 23:59 local; show these for confirmation. Default traveler/room assumptions must be visible. Protect October 27–29 in Singapore as full local days. Arrival by October 26, 23:59 and departure no earlier than October 30 are demo assumptions.
2. Generate at most five route templates: Istanbul–Singapore–Istanbul, Istanbul–Bangkok–Singapore–Istanbul, Istanbul–Taipei–Singapore–Istanbul, Istanbul–Singapore–Bangkok–Istanbul, and Istanbul–Singapore–Taipei–Istanbul. The direct template is only eligible when the optional stop is truly optional. Both optional cities together are out of scope. Prefer IST, SIN, BKK, TPE for the initial demo; expose the limited airport search scope instead of claiming city-wide coverage.
3. Generate a bounded set of date allocations around the event. Search the preferred departure day first, then earlier/later departures if quota permits; use October 25/26 as candidate inbound-to-Singapore travel days before the event and October 30 as the earliest outbound day after it. Return flights may depart October 31 or November 1, but must actually arrive by the deadline. Flight departures are search inputs; feasibility uses returned arrival instants. Order allocations deterministically by preferred-date deviation, minimum-night satisfaction, then date.
4. Deduplicate provider requests by airports, departure date, traveler/cabin/baggage scope, currency, locale, and filters. Query flights first. Keep up to three diverse offers per leg (cheapest, fastest, best event buffer), excluding known infeasible times. This is deliberate pruning; completeness is not guaranteed. Avoid airport-changing connections and self-transfer connections in the MVP. Whole provider-returned connecting offers are allowed if their connections are explicit and compatible; do not splice unrelated segments into a protected ticket.
5. Enumerate at most 3^3 = 27 flight combinations per three-leg date allocation. Check chronology in UTC, event-city presence, local arrival deadline, minimum nights, and buffers. For full-day events no flight may remove the traveler from the event city during the protected days. Reject missing/ambiguous times from the feasible set. If an event interval has no valid route, show a reason rather than relaxing it.
6. Derive actual hotel intervals from arrival/departure local dates before querying hotels. Count checkout-exclusive calendar nights, not elapsed hours divided by 24. Overnight flights consume no hotel night in a city while airborne. Require explicit handling of late check-in or pre-dawn arrival; an extra previous-night stay changes the search interval and total. Merge identical stay queries. Retain up to two hotels meeting hard preferences, with soft preferences reflected in scoring.
7. Sum each selected flight offer once and each full hotel-stay quote once. Never multiply a stay total by the number of nights. If only a nightly estimate exists, multiply by nights and label it estimated. Add confirmed event costs and explicit user-approved allowances for ground transport, food, baggage, and contingency, avoiding double-counting included taxes and ancillaries. All compared candidates use the same traveler scope and allowance rules. Unknown required costs prevent a verified under-budget badge.
8. Reject schedule-infeasible candidates. Separate complete real observations, planning totals with estimates, historical/cached candidates, and simulations. Within comparable evidence classes, filter by the user's budget; optionally show an explicit over-budget option if none fit. Do not claim full coverage when inventory or searches are missing.
9. Rank eligible candidates with an explainable score, lower being better: 0.60 × (planningTotal/budget) + 0.25 × min(totalTravelHours/48, 1) + 0.15 × preferencePenalty. This is a proposed product default, not a learned model. preferencePenalty is the weighted share of unmet soft preferences between 0 and 1; hard preferences already filtered. Break ties by lower total, fewer travel hours, then stable itinerary ID. Offer Cheapest, Recommended, and Most convenient labels only when distinct options support them.
10. Replacing Bangkok with Taipei creates a new requirements version. Invalidate affected routes, flight queries, hotel dates, and totals; reuse only cache entries with exactly matching query scopes. Revalidate every event constraint and recompute ranking and deltas. AI receives the new computed facts only; old responses cannot overwrite the newest result.

## Search budget and resilience

Set an application ceiling of 30 uncached travel requests for an initial optimization and 10 for a destination replacement, subject to the account's remaining allowance. Count all calls, retries, hotel detail lookups, and optional booking-option lookups. Maintain a shared rolling-hour ceiling of 40 to leave headroom under the published 50/hour plan; other clients using the same account also consume quota. A repeated request is coalesced, and changing ranking weights should make no provider calls.

Use concurrency 2 and approximately a 10-second request timeout as initial engineering settings, with at most one transient retry inside the same budget. Stop on authentication failure; handle 429 without uncontrolled retrying. A 30-call cap cannot cover every combination of flexible dates, directions, and hotel intervals: show the searched scope and partial-coverage status. A result is useful even when only three templates are evaluated. Rehearse from clearly labelled cached observations and reserve fresh requests for the final demo.

Read provider response timestamps. A proposed application freshness window is 15 minutes, but it is a display/cache policy, not a provider validity promise. Any shorter provider expiry wins. Provider cache behavior must remain visible. If no real observations are available, show unavailable prices or an explicitly labelled estimate workflow; do not invent a cache or silently swap sandbox prices into the live view.

## Minimum viable interface

One desktop-first page is enough:

- A short trip text box and “Use SWITCH example,” followed by editable structured fields: origin, departure window, return deadline, budget, hotel preference, optional city.
- A visibly locked event card with Singapore dates, official source, and arrival/departure buffer assumptions. Event dates are edited only through an explicit event edit action.
- Up to three comparable itinerary cards with route, local dates, hotel nights, planning total, budget status, provenance badge/time, and one concise trade-off explanation. Do not force three cards when fewer are feasible.
- A selected itinerary timeline highlighting the event and a cost breakdown showing flights, hotels, allowances, and missing items.
- A Bangkok/Taipei selector and “Recalculate,” preserving the event while updating route and price differences.
- Public search/booking-option links, loading state, partial results, provider errors, and no-feasible-result explanations.

P0: form, fixed event, route comparison, flight/hotel normalization, deterministic totals, source labels, replacement/recalculation, failure states. P1 after P0 works: AI interpretation/explanation, optional discovery, departure-date expansion, deployment polish. AI interpretation is desirable for the pitch but must not block the functional path if runtime access is unavailable. P2/cut: maps, accounts, saved trips in a backend, multiple travelers, multiple events, arbitrary cities, daily activity scheduling, affiliate attribution, bookings, payments, notifications, and mobile polish.

## Three greatest technical risks

| Risk | Why it can break the demo | Mitigation and decision point |
| --- | --- | --- |
| Provider access, quota, latency, or thin inventory | No authentic offers for the requested dates; repeated searches exhaust the free plan | Confirm free access during the first 20 minutes tomorrow; cap/deduplicate requests; capture permitted real observations during the event; visibly use replay or unavailable state if needed |
| Schedule and cost errors | Overnight travel misses the event; hotel nights or currencies are wrong; incomplete prices appear under budget | UTC comparisons plus city-local dates, integer money, explicit scope and unknowns, conservative event buffers, focused invariant tests |
| Scope and integration time | A polished chat UI hides an unfinished planner; AI/deployment adds blockers | Working form-to-results path by 11:30, provider adapter timeboxes, no extra infrastructure, freeze features at 14:30, local demo backup |

## Six hour milestone plan

All times are October 12, 2026, Europe/Istanbul. The last 30 minutes are outside the six-hour development allocation.

| Time | Milestone | Exit criterion |
| --- | --- | --- |
| 09:30–09:50 | Start from scratch; initialize repository/app; check free provider access and runtime AI funding separately | App serves; secrets remain server-side; one flight and one hotel query either succeed or produce a clearly diagnosed limitation |
| 09:50–10:35 | Contracts, forms, city/timezone catalogue, provider normalization and cache | Validated requirements and correctly scoped normalized flight/hotel observations with timestamps |
| 10:35–11:30 | Route/date enumeration, hard event checks, hotel nights, totals and ranking | Form → at least two feasible alternatives when data permits; otherwise explicit reason; source labels survive the entire path |
| 11:30–12:20 | Comparison cards, event timeline, city replacement | Bangkok → Taipei recalculates affected searches and all totals while preserving attendance |
| 12:20–13:00 | Add AI interpretation and grounded explanation if funded; retain form fallback | Parsed inputs are editable; explanations use computed facts; malformed/refused AI output handled |
| 13:00–13:45 | Test schedule/money invariants; quota/timeouts; deployment if required | Tests and production build pass; demonstrable failure/replay state; optional deployed URL loads |
| 13:45–14:30 | Usability fixes, source links, capture permitted event-day replay, rehearse | End-to-end demo completes in two minutes; links checked; no fake-live or incomplete-budget claims |
| 14:30–15:00 | Feature freeze, bug fixes, final integration smoke test | Same event remains protected across both cities; clean build and no secret exposure |
| 15:00–15:30 | Demo rehearsal and submission package | README with setup/limitations, event-day commit history, screenshots/video if needed, repo/demo URLs ready |
| 15:30–16:00 | Submission buffer | Submit before lock; verify receipt; no last-minute feature work |

Meaningful tests: overnight Istanbul–Asia flight; arrival after the event cutoff rejected; final return arrival on November 2 rejected; local hotel date arithmetic; full stay totals charged once; unknown tax/cost cannot yield verified budget; sandbox excluded from real recommendation; cache preserves observation date; identical data gives stable ranking; destination change invalidates dependent hotel intervals; failed provider does not become fabricated inventory. Synthetic test inputs can be created tomorrow and remain isolated from demonstration offers.

## Two minute demonstration

0:00–0:20: State the problem: the event dates cannot move, but the holiday route can. Enter the SWITCH example and confirm the structured requirements.

0:20–0:50: Show alternatives and the protected October 27–29 block. Point out the actual source/freshness status, total scope, and one cost-versus-travel-time difference.

0:50–1:20: Replace Bangkok with Taipei. Recalculate. Show the numeric delta and the unchanged event coverage.

1:20–1:45: Open the cost breakdown and a public provider link. Explain that the app compares options and hands off; it does not sell bookings.

1:45–2:00: Describe Codex's concrete contribution during the event: scaffolding, adapters, deterministic engine, debugging, and verification. Close with the working behavior and one next step. Never narrate an invented savings figure or claim availability that the data does not establish.

The first authorized implementation prompt is in TOMORROW-PROMPT.md. Do not run it tonight.
