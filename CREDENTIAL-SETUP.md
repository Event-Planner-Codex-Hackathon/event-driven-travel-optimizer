# Credential setup for the travel optimizer

The intended demo needs a SerpApi key and, for runtime AI, a separately funded OpenAI API project. GitHub and Vercel CLI authentication already passed locally. Account creation and funding remain with the user; no account or key was created during preparation.

## Account checklist for later

| Service | Action | Done when |
| --- | --- | --- |
| SerpApi | [Create a free account](https://serpapi.com/users/sign_up), complete verification, open [API key settings](https://serpapi.com/manage-api-key) | Key stored privately; free plan and remaining monthly/hourly quota visible |
| OpenAI API | Open the [API Platform](https://platform.openai.com/), select or create the intended project, and create a project API key | Key stored privately; project has usable funding/credits and an accessible model |
| GitHub | Use the existing authenticated account | Intended repository owner/visibility confirmed tomorrow; no new login currently needed |
| Vercel | Use the existing authenticated account if hosting is needed | Intended team/project scope and plan confirmed tomorrow |
| Ticketmaster | Optional: follow [Discovery onboarding](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/) | Key available only if event discovery survives the scope cutoff |

SerpApi's published free plan currently allows 250 searches per month and 50 per hour. Check actual remaining allowance; free-plan limits do not mean every account has unused quota. Do not upgrade or buy additional searches for this plan. [SerpApi pricing](https://serpapi.com/pricing)

For OpenAI, Codex's ChatGPT authentication is already working, but the application will use its own API credentials. Follow the [official API quickstart](https://developers.openai.com/api/docs/quickstart). Do not run its sample inference call tonight. Use an ordinary project key, not an organization admin key.

Confirm who pays for runtime inference before enabling it. The [current spend-control guide](https://developers.openai.com/api/docs/guides/spend-limits) distinguishes alerts from enforced hard limits: alerts do not stop traffic, and hard-limit enforcement can lag slightly. If available to the account, configure the agreed project cap and an earlier alert; a dashboard threshold is not itself user authorization to spend. No budget amount is assumed here.

## Values the application will need

| Name | Secret | Purpose |
| --- | --- | --- |
| SERPAPI_API_KEY | Yes | Flight and hotel search |
| OPENAI_API_KEY | Yes | Server-side interpretation and explanation |
| OPENAI_MODEL | No | An API model actually available to the project and supporting the required structured output |
| TICKETMASTER_API_KEY | Yes | Optional event search |

There is no need for booking credentials, airline ticketing access, payment keys, affiliate IDs, or a database connection. No extra OpenAI organization/project environment variables are planned for an ordinary project-scoped key.

## Secret handling tomorrow

After the app is created, Codex should establish .gitignore and a value-free .env.example before any keys are entered. The user then enters values locally into ignored .env.local using an editor. Do not paste keys into chat, screenshots, documentation, shell command history, or public issue reports. Keep provider keys out of NEXT_PUBLIC_ variables.

Proposed .env.example contents for tomorrow, shown here only as documentation:

```dotenv
SERPAPI_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
# Optional
TICKETMASTER_API_KEY=
```

Codex may verify only presence/absence without displaying values. After .gitignore exists, check `git check-ignore .env.local` and inspect staged filenames before committing. Restart the dev server after changing environment values.

For Vercel, add secrets to the intended Preview or Production environment and create a new deployment so that the changes apply. Local .env.local does not establish hosted configuration. Keep the selected account/team explicit before deploying. [Vercel environment variables](https://vercel.com/docs/environment-variables)

## First smoke checks after the official start

These are instructions, not completed tests. Do not run travel searches or inference during this preparation.

| Check | Small request or action | Pass condition |
| --- | --- | --- |
| Quota | SerpApi dashboard, or Account API with redacted output | Active free allowance; monthly and hourly headroom known |
| Flight | One-way IST to SIN, October 21, 2026, one adult, economy, TRY | Successful provider response; real offers retain dates, currency, fare scope, source and observation time |
| Hotel | Singapore, October 26 check-in to October 30 check-out, one adult, one room, TRY | Full stay scope retained, four local calendar nights, tax coverage explicit |
| Interpretation | One short SWITCH request, only with confirmed API funding/credits | Schema-valid requirements; assumptions visible; no invented prices |
| Local UI | Open the actual dev-server URL in Chrome | Form loads; requests reach server; errors are intelligible |
| Hosted UI if required | Deploy the working app or permitted replay after implementation | Judge can open the URL with the intended access, and secrets are absent from browser responses |

The flight and hotel smoke requests are independent integration checks, not a complete itinerary. Empty inventory can be a successful API response but is not evidence that the intended demo has usable offers. Do not silently change dates to conceal missing coverage.

The [SerpApi Account API](https://serpapi.com/account-api) is documented as free. Its response includes sensitive fields: log only status and remaining quota, never the raw response, key, or account email. Google travel engine parameters and returned fields must follow the [Flights](https://serpapi.com/google-flights-api) and [Hotels](https://serpapi.com/google-hotels-api) references, not assumptions from another provider.

## If access fails

| Symptom | Next action |
| --- | --- |
| Missing key | Continue manual requirements, engine and UI; show provider not configured |
| 401 or 403 | Check provider/project and key placement privately; stop repeated calls |
| 429 | Read quota/rate/spend error; respect retry instructions; do not buy credits or loop |
| Empty real inventory | Show no offers for searched scope; expand one bounded date/route only if allowance permits |
| OpenAI unavailable | Keep structured form and deterministic explanation; make no claim that AI ran |
| Hosting account trouble | Continue locally; confirm organizer requirements rather than spending build time on a new host |

Do not use another account's keys, invent provider responses, or relabel sandbox data as live to unblock the demo.
