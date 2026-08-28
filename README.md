# mindfully.gg

**Your community has a history. Mindfully remembers it.**

Multi-agent moderation with memory, for a culture worth keeping. It learns your
rules, remembers what happened before, and catches patterns a message-by-message
filter misses. Works with Discord and Telegram; built on [Minds by Animoca Brands](https://hellominds.ai).

---

**Creative Minds Jam #1** — Track: *Moderation & community assistance*.
Multi-agent architecture, five persistent Minds.

- **Demo video:** [Mindfully.gg video pitch](https://youtu.be/s7aG6PdLdFA) - https://youtu.be/s7aG6PdLdFA
- **Live app:** [Mindfully.gg](https://www.mindfully.gg) - https://www.mindfully.gg 
- **Technical documentation:** this file, plus [CLAUDE.md](CLAUDE.md) for the
  architecture invariants and [`skills/`](skills) for each published Skill
- **Persistence:** [memory, continuity and autonomous follow-up](#persistence),
  with the code path for each

Creator-economy fit: a creator's community *is* their business, and moderating
it is unpaid work that scales with success. The moment a Discord or Telegram
community outgrows one person reading every message, the creator either hires
mods, burns out, or installs a keyword filter that punishes the regulars it
doesn't recognise. This is the third option done properly — moderation that knows
who your members are, learns what your community actually sounds like, and hands
you the calls that deserve a human.

---

## The problem

Moderation shouldn't start from zero every time.

One suspicious link might mean nothing. A new account posting that link across
several conversations, using another member's display name, then messaging people
one after another — that's a pattern, and no filter sees it, because a filter only
ever sees the message in front of it. Four allowed messages, one pattern.

## Five Keepers, one shared understanding

Each Keeper owns one job and nothing else. They are separate agents working from
the same history — what was said, what happened before, and which interventions
already ran.

| Keeper | Role | What it does |
| --- | --- | --- |
| Vera | Trust Keeper | Trust you can watch accumulate |
| Sage | Culture Learner | Learns the in-jokes before the rulebook |
| Kira | Moderator | Acts early, explains itself, can be overruled |
| Mira | Health Pulse | Reads the room |
| Nova | Community Guide | Checks in on the people drifting out |

What they hand each other is the product — a Keeper alone is one model with a
prompt:

- **Vera** reads the shared history and gives Kira member standing *before* a
  call is made, regulars to Nova, participation to Mira.
- **Sage** reads your rules and what happened after each intervention, and gives
  Kira the norm at stake.
- **Kira** reads standing from Vera and the norm from Sage, then gives the
  outcome back to both and incident rates to Mira. It never decides in a vacuum.
- **Mira** reads signals from all four and gives the room's state to you, and to
  Nova before it points a newcomer anywhere. Room level throughout — mood,
  participation, conflict, never an individual member's state.
- **Nova** reads conventions from Sage, standing from Vera and room state from
  Mira, and gives back who is drifting and whether the check-in landed.

Your overrides write back to the roles that informed the call, so a correction
made once is not asked again.

## Whose agents these are

Creators create five Minds on [hellominds.ai](https://hellominds.ai), one to hold
each role, and **name them whatever they like — the role is what setup assigns,
not the name.** Setup equips the published Skill for each role on their behalf;
they never open the Bazaar. The Skill is what turns a general Mind into a
specialist.

Vera, Sage, Kira, Mira and Nova are the names *we* use for the roles. Nothing
hardcodes them at a member-facing boundary, and every Skill is written never to
name a peer — a creator whose trust Mind is called something else must never read
a digest crediting Vera.

The Minds run on the creator's account. We never hold them and never see their
key in the clear; what the roles learn lives in their Minds' own memory, and
disconnecting leaves everything learned and the Skills still equipped.

## This is two processes

The Next.js app and the bot are **separate programs**, and that is not an
accident of local development. Discord needs a persistent WebSocket and Telegram
long-polls; neither survives in a serverless function.

- **`next dev` / Vercel** — marketing site, creator dashboard, HTTP routes.
- **`bot/start.ts`** — Discord gateway and Telegram polling, run wherever a
  long-lived process can live.

The consequence worth knowing before you write anything: **module-level state is
per-process.** Anything both halves need goes in Redis or comes from env vars.
See [CLAUDE.md](CLAUDE.md) — it documents this and the other invariants that
have already caused real bugs here.

## Getting started

```bash
npm install
```

Copy the environment template and fill it in. It documents every variable and
where to get it:

```bash
cp .env.example .env.local
```

Nothing works without Upstash Redis, an `ENCRYPTION_KEY` and Clerk keys; bot
tokens are needed only for the process that talks to a platform. Run the web app:

```bash
npm run dev
```

Then the bot, in a second terminal. It reads `process.env` directly and loads no
env file of its own, so the flag is required — a missing flag looks exactly like
a missing token:

```bash
npx tsx --env-file=.env.local bot/start.ts
```

Either `DISCORD_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN` alone is enough to start it.

## Setup, and what it checks

Connect a Builder API key, assign the five roles, link a Discord server or
Telegram group, then seed your rules in your own words — those are held as your
definitions and outrank anything inferred. Everything after that is learned from
the room.

`/dashboard/setup` verifies the whole chain and names the missing link rather
than failing vaguely: key connected, five roles assigned, a community connected,
assigned Minds online, assigned Minds funded with cognition, every community
given a language and a description.

The creator's key is encrypted with `ENCRYPTION_KEY` (AES-256-GCM) and stored per
account. `MINDS_BUILDER_API_KEY` is for the developer scripts only — the app
itself never reads it.

## How a message is handled

A message hits the **pre-filter** first ([lib/pre-filter.ts](lib/pre-filter.ts)),
a local classifier with no cognition cost that passes obviously safe messages
straight through. Only ambiguous ones enter the Keeper chain — Vera (who is this?)
→ Sage (is this normal here?) → Kira (decide) — which is several LLM round-trips.

Kira's decision is executed over plain HTTPS, or escalated to the creator's
moderation queue when it needs a human. The queue is Redis, not agent memory: it
needs stable ids, exact retrieval and an atomic claim, and resolve is claimed
with a single `ZREM` so a double-click cannot fire two mutes.

A daily digest runs on Vercel Cron at 09:00 UTC, compiling the four upstream
roles into one report through Mira, and stores it so the next run can compare
against a report it was actually given.

## Persistence

The three properties the Jam asks a Mind to demonstrate, and where each one lives
in this repo.

### Memory — it remembers context across sessions

Trust profiles, learned norms and moderation history live in the **creator's**
Minds, on their key. That is memory in the sense that matters: accumulated,
semantic, and shaping later judgment rather than being looked up. Ask Vera about
a member and it answers with the arc — how they have shown up over time — not a
score alone.

The boundary is deliberate and it is the main architectural decision here: **a
queue is not memory.** The escalation queue needs stable ids, exact retrieval,
atomic claims and deletion guarantees, so it is Redis. Judgment needs
accumulation and nuance, so it is a Mind. An early version asked Kira to recite
the pending queue and got prose back — no id, no delta, no guarantee against
double-mutes. Redis for state, a Mind for judgment.

### Continuity — it picks up where it left off

- **Every decision writes back, unprompted.** After a call, Vera is told the
  outcome and Sage is told the norm at stake — fire-and-forget `notifyVigil`
  writes in `handleMessage`, after the request that triggered them is done.
- **Your overrides are authoritative and propagate.** `handleCreatorOverride`
  writes the correction to Kira, refines Sage's norms, and adjusts Vera's trust
  when an action was reversed. A correction made once is not asked again.
- **The daily digest reads the previous digest.** Yesterday's report is passed
  into today's prompt as text, so period-over-period comparison is auditable —
  both sides of it are in the prompt. The health role is forbidden from citing a
  figure it did not read, which makes a *remembered* number an invented one.
- **A conversation is the unit, not a request.** `queryVigil` treats history as
  the authority when pairing a reply to its prompt, rather than trusting a
  reply-wait to hand back the right answer.

### Autonomous follow-up — it acts without being prompted

- **The daily digest runs on a cron**, 09:00 UTC, no human in the loop: four
  roles queried in parallel, compiled by Mira into one report, stored for the
  creator and for tomorrow's comparison.
- **A member joining triggers the Keepers.** Mira is asked what is active right
  now, and Nova welcomes the newcomer in the community's own language — a
  platform event, not a human request, starts it.
- **The learning writes fire after the human has stopped looking**, which is the
  point: the Keepers keep updating themselves between sessions.

### Why the Minds are integral

Remove them and there is no product. The pre-filter is deliberately incapable of
judgment — it clears the obvious and nothing else, precisely so that everything
requiring an opinion reaches a Mind. Every decision, every norm, every trust
reading and the entire digest is Mind output. What this repo adds is the
orchestration: role assignment, the chain, the escalation queue with its atomic
claim, retention controls, and five published Skills that turn a general Mind
into a specialist.

## Scripts

All take `--env-file=.env.local`. `tsx` is fetched by `npx`; it is not a
dependency.

| Script | Cost | What it does |
| --- | --- | --- |
| `check-crypto.ts` | free, offline | Confirms `ENCRYPTION_KEY` is present, the right length, and round-trips |
| `check-pairing.ts` | free, offline | Exercises reply-pairing — which history row answers a sent message |
| `check-docs.ts` | free, offline | Lints the Skill docs under `skills/*/` |
| `check-escalations.ts` | Redis only | Escalation store lifecycle against real Upstash |
| `check-minds.ts` | free reads | Mind inventory: status and cognition balances |
| `check-conversation.ts` | free reads | Dumps a conversation's history |
| `eval-skill.ts` | **spends cognition** | Skill eval harness; leads with three zero-token modes |

```bash
npx tsx --env-file=.env.local scripts/check-minds.ts
```

`check-escalations.ts` writes to whatever database `.env.local` points at. It
namespaces everything under `smoke_<runId>` and purges in a `finally`, but point
it at a scratch database anyway — it prints the host before writing.

## Skills

Each Keeper's published Skill lives under `skills/<role>/`, with the public
`README.md`, `instructions.md` and `fixtures.json` tracked and the working notes
gitignored. Skill ids are pinned in
[lib/skills-config.ts](lib/skills-config.ts) — the same ids `provisionSwarm`
equips at setup.

**A published Skill's description cannot be edited.** It is also a router: a
prompt that does not match it never reaches the Skill body at all, and every
diagnostic looks healthy while that happens. Prompt wording at a call site is
therefore part of the contract. Read the section in [CLAUDE.md](CLAUDE.md) before
renaming anything a Keeper is sent.

## Deploying

The web app deploys to Vercel as-is. [vercel.json](vercel.json) pins `fra1` and
declares the digest cron; set `CRON_SECRET` and Vercel will authenticate it
automatically.

The bot is not deployable to Vercel by design — give it a host that keeps a
process alive.

**Run `npx next build` before declaring adapter work done.** Importing
`discord.js` from anything reachable by `app/` fails the build outright, and it
shows up in neither `tsc` nor `next dev` — only on deploy.

```bash
npx next build
```

## Contributing

Read [CLAUDE.md](CLAUDE.md) first. It is the list of things that have already
gone wrong here — silently, in most cases — and each entry exists because
someone lost time to it.
