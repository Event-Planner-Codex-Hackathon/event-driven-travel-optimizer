# Frontend/backend integration handoff — 12 October 2026

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
