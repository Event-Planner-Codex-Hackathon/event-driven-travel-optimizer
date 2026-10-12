# Demo script and rehearsal checklist

The demonstration should prove one behavior: changing the optional city updates the itinerary while the event remains protected. This is a script for tomorrow's working product, not a claim that these features exist today.

## Example and assumptions

Use Istanbul departure around October 21, 2026; return arrival by November 1; SWITCH Singapore October 27–29; Bangkok or Taipei; budget 100,000 TRY. The [official SWITCH site](https://www.switchsg.org/) is the event reference already checked in preparation.

The frontend's description example also asks for live jazz, house/techno, small music nights, art/design events, street food, night markets, temples and architecture, at a moderate pace. The jury story is that the fixed event anchors the trip while the traveller's interests shape the free time. Once matching is implemented, show one sourced suggestion and explain which stated interest it matches; then replace the optional city and demonstrate that those interests are retained. Until then, describe personalization as planned and do not present synthetic previews as matched real events.

The expanded example requests three distinct alternatives considering Bangkok, Taipei, and Vietnam (Ho Chi Minh City), with one optional stop per trip. Vietnam support and three-candidate route selection are backend dependencies, not completed capabilities. Rehearse this variety only once the returned results actually support it; otherwise disclose the supported search scope. Use route summaries to explain real differences in the returned options.

Proposed defaults must appear as assumptions for confirmation: one adult, economy, one room; October 20–22 departure window; return by November 1 at 23:59 Istanbul time; Singapore arrival by October 26 and onward departure no earlier than October 30. Hotel quality, baggage, food and ground allowances remain editable and unconfirmed. Never turn an unspecified cost into zero.

## Two minute script

| Time | Screen action | Spoken script |
| --- | --- | --- |
| 0:00–0:15 | Show the example request | “Planning around an event starts with dates you cannot move. I need to attend SWITCH in Singapore, but I can change the rest of the trip.” |
| 0:15–0:30 | Confirm editable requirements and event block | “Here are the dates, budget and assumptions. The event is fixed, including an arrival buffer.” |
| 0:30–0:55 | Compare actual returned alternatives | “These are the feasible options we searched. This one costs [displayed amount]; this one trades [displayed difference] for [displayed schedule difference].” |
| 0:55–1:20 | Replace Bangkok with Taipei and recalculate | “Now I can replace Bangkok with Taipei. The routes and costs change, while the Singapore dates stay protected.” |
| 1:20–1:40 | Show timeline and breakdown | “Each total has a breakdown. We show which prices are fresh, cached, or estimated, and any missing costs.” |
| 1:40–1:50 | Open one returned public link | “You can inspect the source or booking option with the provider. We do not make a reservation.” |
| 1:50–2:00 | Finish on the result | “AI helps interpret and explain the request. Deterministic code checks schedules and calculates the comparison.” |

Replace bracketed phrases only with facts actually visible in the completed app. If AI is disabled, say the current build uses the structured form and deterministic explanations. Describe Codex's contribution using actual event-day work, in the demo or the Q&A; no invented build history.

## Rehearsal checks after implementation

- [ ] Run the full sequence twice with a timer; finish within 120 seconds.
- [ ] Keep the request entered and ready; do not spend the pitch typing a paragraph.
- [ ] Confirm the chosen scenario has actual usable observations for both city choices, or explicitly choose labelled replay.
- [ ] Keep event dates, cost scope, source age and city selector visible at readable browser zoom.
- [ ] Use one source link already checked during rehearsal; avoid login/payment screens.
- [ ] Prepare a clean app tab; close secret-bearing terminals or dashboards before screen sharing.
- [ ] Keep the local server running and charger connected. Confirm the hotspot separately if available.
- [ ] Reserve provider quota for judging; repeated rehearsals use labelled cache/replay.
- [ ] Capture a short recording or screenshots during the event if the submission accepts them.
- [ ] Return to the initial city and requirements after each rehearsal.

## Honest fallback wording

| Situation | What to say and show |
| --- | --- |
| Provider outage but real saved observations exist | “The provider is unavailable, so this is a replay of observations captured at [time]. These are not current quotes.” Show the timestamp and recomputed constraints. |
| No offers for the scenario | “No feasible priced option was found within the searched scope.” Show which constraint or data gap prevented a result. |
| Incomplete budget | “This is the known subtotal. These items still need pricing.” Avoid a green within-budget claim. |
| No runtime AI access | Use the editable form and explain that interpretation is unavailable; demonstrate the deterministic planner. |
| Recalculation exceeds 15 seconds during pitch | Show the loading/error state, switch only to an already verified and clearly labelled replay if available, and continue explaining the event constraint. |

Never invent a successful route or savings figure to keep the script on schedule.

## Likely judge questions

| Question | Answer to substantiate with the actual build |
| --- | --- |
| Why not a general chatbot? | The event, flight chronology and totals are checked in deterministic code; natural language alone does not establish feasibility. |
| Is it finding the cheapest trip worldwide? | No. It ranks a bounded, disclosed set of dates, airports and routes. |
| Are prices live? | Point to the actual provenance and timestamps. Fresh search observations still need provider rechecking at booking. |
| What happens when I change a city? | Dependent flights and hotel intervals are invalidated, then feasibility, totals and ranking are recomputed. |
| What did Codex do? | Name only the concrete scaffolding, adapter, engine, debugging or testing work performed during the event. |
| What is the next product step? | Broader verified inventory and event coverage, stronger quote revalidation, and measured user demand. Booking remains outside this prototype. |

## Submission checks

- [ ] Organizer-required fields, team information and artifact formats are confirmed.
- [ ] Repository/demo links work for the intended judge audience.
- [ ] README states setup, scope, data limitations and preparation versus event-day work.
- [ ] Demo link and any recording show source freshness accurately.
- [ ] Submitted before 16:00 Istanbul time; receipt or confirmation recorded.
