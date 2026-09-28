# Bounty Ops Agent

An AI intelligence and action layer built around Gibwork's SDK, CLI, and MCP tooling.

Gibwork already gives you raw operations: list tasks, list submissions, approve, reject,
comment, refund. This project sits on top of those operations and answers a different
question — not *"what exists?"* but *"what does it mean, what needs my attention, and
what should I do next?"*

It's built as two systems:

- **Watchdog** — creator-side monitoring: bounty health, expiry risk, and submission
  change detection, all running against real mainnet data.
- **Guide Agent** — a conversational assistant (usable via terminal or Claude Desktop
  through MCP) that helps anyone navigate Gibwork: explaining bounty requirements,
  listing live available work, and surfacing contributor reputation — strictly for
  bounty creators evaluating their own submissions, never to help complete someone
  else's bounty.

Every write action (approving a submission, paying out) requires an explicit,
human-typed confirmation showing the real fee quote from Gibwork first. Nothing in
this project auto-approves or auto-pays based on reputation or AI judgment.

**Bounty creation is intentionally excluded.** The Guide Agent can explain it if asked,
but will not walk anyone through creating one — that use case has already been built
elsewhere, and this project is scoped to everything else around the platform.

## Why this is a new use case

Gibwork's own tooling is transactional — one resource at a time. This project adds:

- Cross-task health analysis (stale bounties, approaching deadlines, stuck reviews)
- Submission-to-submission change detection (did a resubmission actually change?)
- Contributor reputation aggregation, shown as context, never as authority
- A live, conversational guide grounded in real Gibwork data — not canned FAQ answers
- A hard privacy boundary: reputation data is only ever shown for bounties you created

## What's inside

| Command | What it does |
|---|---|
| `npm run diagnose` | Read-only dump of your own created tasks + submissions (raw JSON) |
| `npm run diagnose-contributor -- <taskId>` | Read-only submission dump for a specific task |
| `npm run watchdog` | Full health/expiry/change-detection report across your bounties |
| `npm run contributor-intel` | Reputation profiles for everyone who's submitted to your bounties |
| `npm run chat` | Terminal chat with the Guide Agent (Gemini-powered) |
| `npm run approve` `-- <taskId>` | Interactive approve/reject/pay flow with real quotes and explicit confirmation |

## Architecture

```
Gibwork SDK (tasks, submissions, comments)
        │
        ▼
Shared data layer (src/gibwork/)
        │
        ▼
Deterministic analysis (src/analysis/) ── health rules, contributor aggregation
        │
        ▼
Watchdog (src/watchdog.ts) ── combines health + expiry + change detection
        │
Snapshot/change detection (src/storage/) ── hash-based, cheap, no AI needed
        │
Guide Agent (src/chat.ts, src/mcp/) ── AI layer (Gemini), grounded in real
        │                              live data (public bounty listing,
        │                              bounty pages) and bundled reference docs
        │
Action layer (src/approve-flow.ts) ── real payouts, human-confirmed, real
                                       fee quotes shown before signing
```

Deterministic code handles anything countable or comparable (dates, statuses,
approval rates, content hashes). AI is only used for the parts that genuinely need
interpretation — explaining a bounty in plain language, answering open-ended
questions, summarizing live listings.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
SOLANA_PRIVATE_KEY=your_wallet_private_key
GIBWORK_PRODUCTION=true          # false hits Gibwork's stage environment instead
GEMINI_API_KEY=your_gemini_key   # free tier — https://aistudio.google.com/app/apikey
```

Then run any command from the table above.

**Note:** `.env` is never included in this repo or shared — it's excluded via
`.gitignore` and holds credentials unique to whoever is running the project.
Each person needs their own Solana wallet (a fresh, empty one is fine — every
command here is read-only except `approve-flow.ts`) and their own free Gemini
key from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

## Real findings from building this against live mainnet data

- Gibwork's task list API does **not** return a deadline field, even in the raw
  response — confirmed against real data, not just SDK type definitions. Expiry
  detection is therefore only reliable for bounties tracked from creation.
- There's no API endpoint to fetch a contributor's full submission history across
  the platform — `submissions.list()` is always scoped to one task. Contributor
  Intelligence works from the reputation stats Gibwork already embeds on every
  submission (`approvedTaskSubmissions`, `rejectedTaskSubmissions`, `rating`).
- A submission `CLOSED` with reason "Bounty funds were fully paid out" is not a
  rejection of quality — it means the budget ran out. Handled as a distinct case
  throughout, so it never gets treated as negative signal about the contributor.

## Safety

- Every financial action requires a real quote from Gibwork and an explicit typed
  confirmation — never a default, never inferred from context.
- Contributor reputation is only ever shown for bounties the connected wallet
  created — enforced in code, not just described in a prompt.
- Bounty creation assistance is hard-blocked at the code level, independent of how
  the request is phrased.