# Acceptance checklist for tomorrow

All items below are planned checks and are currently NOT RUN. They are specifications for tomorrow's implementation, not executable tests or demonstration inventory. Numeric examples below are synthetic arithmetic cases only.

## Gate 1 by 09:50

- [ ] Application created after the official start; preparation documents remain distinguishable from implementation.
- [ ] App opens locally; actual browser rendering and a production build are checked during the build window.
- [ ] Secrets are server-side and ignored by Git before entry.
- [ ] One flight and hotel smoke check completed, or an explicit missing-credential/provider failure recorded.
- [ ] Any runtime inference has confirmed credits or authorized spending; no paid provider overages enabled.

## Gate 2 by 11:30

| ID | Scenario | Required result |
| --- | --- | --- |
| R1 | Load the SWITCH example | Correct year, budget and event dates; departure/return/traveler assumptions editable before search |
| R2 | Input cannot be parsed or model refuses | Structured form remains usable; no fabricated defaults silently committed |
| E1 | A candidate reaches Singapore October 27 | Rejected by the proposed October 26 arrival cutoff |
| E2 | A candidate leaves Singapore during October 27–29 | Rejected, even when it is the cheapest option |
| E3 | Flight crosses midnight or timezone | Compare resolved UTC instants; retain destination local arrival date |
| E4 | Return departs November 1 but arrives Istanbul November 2 | Rejected by the return-arrival deadline |
| E5 | Event or flight time is ambiguous | Do not mark the route schedule-feasible until resolved |
| E6 | Changing airports or self-transfer is required | Reject under MVP rules or explicitly exclude the offer before ranking |
| H1 | Check-in October 26, checkout October 30 | Four local calendar nights; no elapsed-hours shortcut |
| H2 | A night is spent airborne | Do not add a hotel night in a city for that same airborne interval |
| H3 | Pre-dawn arrival needs previous-night accommodation | Flag the assumption and requery the adjusted stay; no free room assumption |
| C1 | Full stay quote is 12,000 TRY for four nights | Charge 12,000 TRY once, not 48,000 TRY |
| C2 | 40,000 TRY flights + 12,000 TRY hotels + 5,000 TRY confirmed estimated allowances | 57,000 TRY planning total; estimates visible; synthetic test only |
| C3 | A required tax, bag or admission charge is unknown | Preserve null/unknown; budget unverified, not a zero-cost assumption |
| C4 | Price currency differs from requested TRY | Require sourced FX with timestamp or exclude from TRY total; never mix currencies |
| C5 | Multi-segment offer has one total fare | Charge once per offer/ticket group, not once per segment |
| C6 | A hard preference cannot be met | Exclude the candidate or show infeasibility; do not let a lower score override it |
| O1 | Same requirements and normalized observations are run twice | Same ranking and tie-breaking order |
| O2 | Only one feasible option exists | Show one; do not manufacture alternatives |
| O3 | Search budget limits coverage | Show searched scope and partial coverage; avoid global-optimum language |

## Gate 3 by 12:20

- [ ] Bangkok can be replaced with Taipei without modifying the event dates.
- [ ] Affected flights, hotel intervals and totals are recalculated; cached data is reused only for exact matching scopes.
- [ ] Displayed cost and duration deltas match recomputed values; no stale city names or source links.
- [ ] Two quick replacements cannot allow an older response to overwrite the newest requirements.
- [ ] Changing ranking weights alone performs no travel-provider calls.
- [ ] At least two credible alternatives are demonstrated when inventory permits, with timeline and itemized cost scope visible.

## Gate 4 before feature freeze

| ID | Failure or integrity case | Required result |
| --- | --- | --- |
| P1 | Cached real quote replayed | Original observation time retained and cached label visible |
| P2 | Upstream freshness cannot be established | Freshness unverified label; fetching now does not imply newly observed price |
| P3 | Sandbox or synthetic offer present in tests | Excluded from real-trip recommendations |
| P4 | Any total includes estimates | Label planning total with estimates; no fully-live claim |
| P5 | Provider 401, 429, timeout or empty result | Distinct intelligible status; bounded retry only; no fabricated inventory |
| P6 | Quota budget reached | Stop further provider calls, including detail lookups and retries; show partial results |
| P7 | Repeated identical requests arrive together | Coalesce requests and reuse matching cache; preserve provenance |
| P8 | Deployment runs multiple server instances | Do not claim process-local counters enforce account-wide quota; disable public live queries unless protection is verified |
| P9 | Public source/booking link opened | Correct destination; no API key or internal authenticated endpoint in URL |
| A1 | AI explanation describes results | All numeric facts, dates, availability and recommendations agree with computed facts; unsupported claims omitted |
| A2 | AI unavailable | Deterministic explanations and editable form work |
| S1 | Inspect browser responses, logs and staged files | No provider keys, raw account responses or secret-bearing URLs exposed |

## Release gate by 15:30

- [ ] Relevant invariant tests and production build pass; record actual commands and results tomorrow.
- [ ] One full browser run covers input, comparison, city replacement, timeline, totals and source link.
- [ ] The no-results and provider-failure views are understandable.
- [ ] Hosted URL, if used, works for judges; otherwise local-only status is explicit and submission format accepted.
- [ ] Two timed rehearsals finish within 120 seconds.
- [ ] Screenshots/replay/recording, if used, originate during the event and retain honest labels.
- [ ] README, commit history and submission materials accurately distinguish preparation from implementation.

Hard failures to fix before presenting a recommendation: event conflict, arithmetic error, stale replacement result, leaked secret, synthetic data labelled real, or incomplete costs labelled verified under budget. If a feature cannot meet these criteria, disable it and demonstrate the smaller truthful flow.
