# Local tooling readiness

Checked October 11, 2026 in this workspace. The development and deployment CLIs are ready. Account-specific project permissions and actual application builds remain untested because implementation starts tomorrow.

## Additional checks completed

| Check | Result | Meaning |
| --- | --- | --- |
| GitHub CLI | 2.95.0 | Installed and runnable |
| GitHub authentication | PASS using gh auth status | Existing GitHub authentication works; no repository created or pushed |
| Git commit identity | Name and email configured | No identity setup needed; values not displayed |
| Vercel CLI | 58.4.4 | Installed and runnable |
| Vercel authentication | PASS using vercel whoami | Existing login works; no project linked or deployed |
| Apple command line tools | Configured | Command line tool path is present |
| Corepack | 0.35.0 | Available; npm remains the proposed package manager |
| curl and zip | Available | Network diagnostics and packaging tools present |
| Chrome and Safari | Installed | Ordinary browser testing available; rendering still to verify |
| Ports 3000 and 3001 | Available when checked | Recheck at launch; port state can change |
| Disk space | About 10.2 GiB free | Snapshot only; no cleanup performed |
| Temporary Node diagnostic | HTTP 200 and expected text via local HTTP client | Local server is reachable; process stopped after check |
| In-app browser localhost | FAILED with net::ERR_BLOCKED_BY_CLIENT | Tool/browser navigation blocked; does not establish a server failure |

The earlier Node/npm/Git/Codex and registry checks are recorded in [PREPARATION.md](PREPARATION.md). No redundant global installs or upgrades were necessary. Netlify CLI and Firefox were absent in the checked locations; neither is required.

## What remains unverified

- Chrome rendering of the actual application. At the first milestone, open the printed dev-server URL there; record whether navigation and server requests work. Do not alter security settings to work around the in-app-browser error.
- A production build, tests, and dependency installation. There is intentionally no package.json or app yet.
- GitHub write permissions for the eventual repository and Vercel permissions/plan for the chosen team. Successful authentication is narrower than deployment readiness.
- Provider credentials, runtime model permissions, and funding.
- Public judge access to a hosted URL, including any deployment protection settings.

## Deployment procedure for tomorrow

First make the app work locally. Create the repository under the intended owner, commit only event-day implementation plus clearly identified preparation documents, and keep secrets ignored. If a hosted submission is needed, use the existing Vercel account and select the intended team explicitly. The [Git import flow](https://vercel.com/docs/git) supports selecting a repository and configuring the framework, root directory and environment before deployment.

Prefer the simplest working deployment. An in-memory cache or request counter is shared only within one server process; serverless instances can have separate counters. Until there is a verified account-wide quota control, run live provider queries in the local demo and make any public deployment a clearly labelled permitted replay or data-unavailable view. Do not assume an in-memory limit protects the whole account. Capture replay observations during the event only, retaining provenance and only if provider retention terms permit it.

If a hosted URL is required, verify it in a signed-out browser before submission. If deployment cannot be completed, accurately report the local-only status and follow the organizer's accepted submission format. Do not present a successful local server check as successful deployment.
