# Frontend/backend integration handoff — 12 October 2026

## Current Pookie integration

The Product Lead authorized integration of the pushed work at about 14:43 Istanbul time. This cycle combines the latest backend `b1fa4db` through main `9836495` with frontend `e67344c` in an isolated checkout on `codex/pookie-integration`. Contract **1.3.0** is the source of truth. Server code, API handlers, contract schemas and package manifests are unchanged from that backend/main revision. The preceding v1.2.1 integration checkpoint is preserved in `040a025`.

The Pookie name, blue palette, logo, comparison cards, retained travel brief and poster/export UI are preserved. New frontend connections:

- `/api/session` supplies supported cities, provider feature flags and guest allowances. The browser profile remains separate from the anonymous server session.
- City replacement and price checks send `baseRequest` plus `baseRequirementsVersion`. A response must be newer, belong to the displayed request and preserve the fixed event before it is saved. Concurrent price-check/city-change actions are disabled; unmounted requests are aborted.
- `/price-check` is an explicit action for all three options. The UI displays backend notes, call/cache counts, replay state, and per-flight/per-hotel provenance: original observation time, retrieval time where different, cached/replayed status, description and public search link. Estimated allowances remain explicit even when every flight/hotel is provider-priced. Failed/missing observations remain estimates; there is no synthetic fallback.
- Backend `comparison` summaries and non-comparable pricing warnings appear on the cards. `convertedTotals` use the backend's dated FX note; no conversion or ranking is performed in the frontend.
- Fixed-event discovery calls `/api/events/search`; Eventbrite import calls `/api/events/import`. Only a plannable result with explicit city/dates can be confirmed into the form. Confirmation does not itself start planning or buy a ticket.
- Local events/weather calls the existing endpoints on user action. The event browser excludes the fixed event and listings with known dates outside the visit, keeps partial/unmapped results visibly unconfirmed, and never inserts them into the itinerary. Ticket prices remain unknown. Search receipt time is distinct from unavailable provider observation age.
- Weather displays the original fetch time, Open-Meteo attribution, forecast horizon and explicit unavailable/beyond-horizon days. It does not change routes, schedules or ranking. These independent responses are displayed separately from the unimplemented proposed day-plan enrichment schema.
- The poster uses the existing hero endpoint and server feature/allowance flags. Generation is explicit; selected-route facts and PNG export remain frontend-owned. Real generation was not exercised.
- The v1.3.0 text result shows whether OpenAI interpreted the requirements, a cached interpretation was reused, or the deterministic parser was used because AI was disabled/unavailable. It does not claim AI-derived routes, prices or interest matching. Spending authorization remains server-owned and was disabled during this rehearsal.
- `/api/routes/{id}/places` supplies sights for the selected route, with its fallback city order after restart. The new sights panel preserves Geoapify/OpenStreetMap attribution, per-city status, original cache timestamps, search radius and centre scope; fees/hours stay unknown. Responses for other route ids are ignored. No map or frontend geocoding was added.

Verification in this cycle:

- TypeScript, production build and **127 tests across 14 files** passed after the v1.3.0 merge. Twelve new integration tests cover the client wire contract, stale/unrelated/event-changing update rejection, replay/cache labels, estimated allowances, public links, event browsing scope and selected-route sights.
- Browser: fixed-event catalog search and confirmation → structured form with interests → three options → Bangkok-to-Taipei recalculation passed. SWITCH remained Singapore October 27–29, requirements advanced 1→2, and exact interests were retained.
- Browser: production server restarted with replay mode and an empty observation directory; price-check fallback advanced requirements 2→3, retained the event/brief, reported zero provider calls and missing recordings, and kept estimates honestly labelled.
- Browser: the v1.3.0 free-text example returned three options and explicitly identified disabled OpenAI interpretation. Unconfigured Geoapify sights were disabled. Enter in fixed-event search stayed in the form and returned the curated catalog result without submitting the trip.
- Open-Meteo and Frankfurter were exercised with free endpoints. Weather beyond October 27 stayed unknown. No OpenAI, Geoapify, SerpApi, Ticketmaster, Eventbrite or fal.ai external calls, paid calls, bookings, or observation recordings were made.
- Phone viewport 390×844 showed no horizontal overflow; normal viewport restored. Poster PNG layout/export was checked in the preceding frontend cycle with explicit synthetic artwork, not a fal.ai result.

Remaining before claiming a live demo:

1. Confirm free-plan/credit budgets and run one controlled real-adapter check with Onur: flight, hotel, event source/import, Geoapify sights, funded OpenAI interpretation and fal.ai artwork plus CDN export. Configuration flags alone do not verify those adapters or the configured OpenAI model. Runtime OpenAI remains behind the explicit spending gate.
2. Vietnam is not in the backend catalog and the parser accepts at most two optional city candidates. The expanded three-destination prompt still exceeds that scope. Preference parsing can interpret "comfortable" as comfort lodging despite "standard hotels"; this remains backend-owned.
3. Interest scoring, fixed-event session times, ticket prices and source observation timestamps are absent from the event contract. Keyword browsing is available; automated personalized event matching is not implemented.
4. `/prices` and `/dev` remain backend diagnostic pages rather than the primary Pookie journey. Final 120-second rehearsal, submission and any deployment remain separate tasks.

The previous handoff below is historical; its frontend/API-wiring gaps and browser-verification status describe the earlier `0314388` integration.

## Previous integration

Backend source: `2b277f3` (contract **1.2.1**). Frontend source: Product Lead branch `origin/codex-project-lead` at `0314388`. The only merge conflict was the temporary backend home page versus the completed frontend landing page; the frontend file was retained exactly. Product Lead's components, UI pages and browser libraries are byte-for-byte identical to that source branch. Backend/API/contract files are identical to the reviewed backend commit. Shared manifests contain the frontend's existing Three.js additions.

## Verified

- Backend: `npm test` — **8 files, 87 tests passed**; `npm run typecheck` — exit 0; `npm run build` — exit 0.
- Combined checkout: the same commands all exited 0; **87 tests passed**, and production build generated **13 static pages** including the frontend searching/trips flows.
- HTTP handler tests cover event-mutation rejection, fallback price-check version 8→9, and guest refunds for locally capped imports. They use synthetic local adapters and make no external requests.
- Production server started on `http://127.0.0.1:3001`. This rehearsal process has provider keys disabled and an external-fetch guard; it is an estimates-only local preview. It does not validate live prices or provider compatibility.
- Browser automation permission for that localhost page was denied. Visual, click-through, hydration and actual browser form-to-results behavior remain **unverified**. No alternate browser or HTTP workaround was used after the denial.

## API connections and remaining differences

| Product Lead frontend | Backend v1.2.1 | Handoff |
| --- | --- | --- |
| `SearchingView` → typed `optimizeTrip` | `POST /api/trips/optimize` | Request/response types compile together; structured TRY form and text requests supported. Real browser flow still needs rehearsal. |
| `ChangeStop` → typed `reoptimizeTrip` | `POST /api/trips/{id}/reoptimize` | Optional city replacement supported; original event stays locked. Frontend can pass its current `trip.requirementsVersion` as the optional fifth client argument for restart continuity. |
| Other options and costs | Server-authoritative totals, ranking and optional `comparison` | Existing rendering compiles. The new comparison payload is not yet used by product components. |
| No product price-check/session action yet | `/api/session`, `/price-check`, `/api/prices/quote` | Provider controls and per-line source/replay labels need Product Lead integration. `/dev` and `/prices` remain backend diagnostic entry points. Product costs currently use estimate-only wording. |
| TRY-only structured form | EUR/USD/GBP text/override budgets, dated FX and display totals | Foreign text budget conversion is available; converted display totals need frontend wiring. |
| Day plan reads optional `RouteOption.enrichment` | Separate `GET /api/weather`; event search/import endpoints | No agreed enrichment payload is implemented. Source strip correctly remains not connected. Do not represent weather or nearby events as live in the product demo. |
| Enrichment proposal suggests weather ranking/climate | Weather is decorative, forecasts outside the horizon are explicit unknowns | Proposal remains unagreed. Current deterministic ranking does not use weather; no climate data is invented. |
| Banner has no product client action | `POST /api/routes/{id}/hero` | Fal generation is still explicit and credit-capped; not exercised with a real key. |
| Device-only sign-in/session | Anonymous backend guest cookie | Browser preview identity is not authentication; no real account system was added. |

Frontend fixes are intentionally left to Product Lead. No messages were sent to their chat.

## Next live rehearsal

When Onur confirms credentials are ready, first inspect **only `GET /api/session`**, then run one minimal authorized request per real adapter, accounting for quota (SerpApi flights/hotels/events, Ticketmaster, Eventbrite import, one Fal banner). Never inspect `.env.local` contents. The local preview process deliberately has keys/fetches disabled and must be restarted normally for that stage; it has no copied credential file.

Then perform the two demo requests' record/replay rehearsal once, retain original timestamps and replay labels, and review SerpApi terms plus obtain Onur's sharing approval before committing recordings. Observation JSON is Git-ignored. Geoapify remains pending separate approval.


## v1.3.0 update

Backend `b1fa4db` adds OpenAI requirement interpretation to the **existing** optimize text endpoint, enabled only by a server key plus `OPENAI_SPEND_AUTHORIZED=true`. Model is configurable (`gpt-6.1-sol` default); standard tier, low reasoning, 1,800 output tokens maximum, no retries/tools, 10/hour and 20 total attempts per process. Structured forms remain deterministic. Failures/disabled mode are explicitly labeled. Deterministically parsed event fields and explicit form fields retain precedence.

Geoapify nearby sights are available through `POST /api/routes/{routeId}/places` and typed `getNearbyPlaces(route)`. Results are around catalog city centres with attribution, unknown fees/hours and original cache timestamps. They never affect event feasibility, ranking or costs. Product Lead still owns displaying this optional response; no product UI files were changed. `GET /api/session` reports the new `aiParsing` / `nearbyPlaces` flags without external calls.

Combined verification: 10 test files, **107 tests passed**; typecheck and production build passed. No real-key OpenAI/Geoapify call has been made. Browser interaction remains unverified due to the earlier denied permission. The refreshed production preview uses an ignored `.env.local` symlink to Onur's existing local credential file; no credential contents were inspected, copied or committed. Previous all-provider-disabled smoke-process overrides are removed on restart. Real adapter validation still begins with session feature inspection when Onur signals that keys are ready.

Session-only runtime inspection after restart: **HTTP 200**, `features.nearbyPlaces=true`, `features.aiParsing=false`; guest allowances `nearby=10/hour`, `interpret=5/hour`. This confirms configuration flags only. No provider request was made by that endpoint. OpenAI needs both a server key and explicit API spending authorization before it can become enabled.
