# Hackathon preparation handoff

This repository contains preparation documents for October 12, 2026. No application, dependencies, product fixtures, or deployment has been created. Local credentials are kept in an ignored .env.local file and are not shared through Git. Begin implementation only after 09:30 Europe/Istanbul and the user's explicit instruction.

## Read in this order

First read the [team roles and coordination rules](AGENTS.md#team-roles-and-development-coordination). The implementation prompt is scoped to the Product Lead's frontend session; Onur will add his own role instructions before backend work.

1. [Credential setup](CREDENTIAL-SETUP.md): the short account checklist to complete later; keys never belong in these documents.
2. [Tooling readiness](TOOLING-READINESS.md): verified local tools, authentication results, and remaining checks.
3. [Demo script](DEMO-CHECKLIST.md): the two-minute presentation, rehearsal sequence, and fallback wording.
4. [Acceptance checklist](ACCEPTANCE-CHECKLIST.md): observable pass/fail criteria for tomorrow's implementation.
5. [First implementation prompt](TOMORROW-PROMPT.md): paste after the official start.
6. [Full engineering plan](PREPARATION.md): architecture, schemas, optimization, provider sources, and timed milestones.

## Ready now

- Codex, Node, npm, Git, GitHub CLI, and Vercel CLI are available.
- GitHub and Vercel CLI authentication checks passed; Git commit identity is configured.
- Local HTTP serving and package-registry connectivity passed.
- Planning, credential guidance, smoke-test instructions, demo script, judge questions, and acceptance criteria are prepared.

## Pending external dependencies

- SerpApi free account/key and available quota.
- OpenAI runtime project/key, accessible model, and confirmed credits or an authorized spend limit.
- Organizer submission requirements and any extra rules announced at opening.
- The in-app browser blocked the localhost diagnostic. Check the actual app in Chrome tomorrow; no application rendering has yet been verified.

Accounts are intentionally left to the user. No prompt for keys or account decisions is needed tonight. Continue independent implementation tomorrow if a service is unavailable, keeping missing data explicit.

## Morning sequence

Before the build starts: check in, receive event access instructions, locate the submission form, confirm whether a hosted URL is required, and read any new rules. These steps do not authorize early application work.

After 09:30 and explicit authorization: issue the role-specific first prompt; agree the API contract and assign one owner for app initialization in the existing repository. Add secret handling and run the documented smoke checks in the responsible session. Timebox account troubleshooting to 20 minutes and continue independent work within each person's ownership if blocked.

By 11:30: form-to-results path. By 12:20: destination replacement. At 14:30: feature freeze. By 15:30: submission package ready. Submit before 16:00.
