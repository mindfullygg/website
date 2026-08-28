@AGENTS.md

# Architecture invariants

Nothing checks this file. `scripts/check-docs.ts` walks `skills/*/` only, so the
link and citation rules it enforces there — name a symbol rather than a line
number, and every relative link resolves — hold here by discipline alone. A
pointer to a file that no longer exists is how this section started.

## This app is two processes

The Next.js app and [bot/start.ts](bot/start.ts) are **separate programs**.
The bot runs standalone (`npx tsx bot/start.ts`) because Discord needs a
persistent WebSocket and Telegram long-polls; neither survives in a serverless
function.

**Module-level state is therefore per-process.** Anything
both processes need goes in Redis or is derived from env vars, never from a
module-level variable one process happens to have filled.

## Receiving and sending are deliberately split

- **Inbound**: [discord.ts](lib/adapters/discord.ts) and
  [telegram.ts](lib/adapters/telegram.ts) translate platform events into
  `CommunityEvent`s. Gateway/polling only. No outbound code lives here.
- **Outbound**: [rest.ts](lib/adapters/rest.ts) performs every action over plain
  HTTPS, so it works identically in both processes.

**Never import `discord.js` from anything reachable by `app/`.** The umbrella
package pulls in `@discordjs/ws`, which references the optional native module
`zlib-sync`. The bundler cannot resolve it and **`next build` fails outright** —
and this shows up in neither `tsc` nor `next dev`, only on deploy. Import `REST`
from `@discordjs/rest` and `Routes` from `discord-api-types/v10` instead.

Run `npx next build` before declaring adapter work done. Typecheck does not
catch this class of failure.

## Agent memory

Vera's trust profiles, Sage's norms and Kira's history live in the **creator's**
Minds, on their API key. That is memory: accumulated, semantic, shaping future
judgment.

A queue is not memory. It needs stable ids, exact retrieval, atomic claims and
deletion guarantees. The escalations endpoint originally asked Kira to recite
pending items and returned prose — which is why it could not offer an id, a
delta, or a guarantee against double-mutes. Reach for Redis for state; reach for
a Keeper for judgment.

The daily digest is the worked example. It used to end by asking the health role
to "compare to previous periods you remember", which contradicts that role's own
audit rule — every figure it cites must be one it was given — and a figure
labelled *remembered* is exempt from the only check the role has. So a Mind
rebound through `setRoleMap` could report last week's number it never saw and
the label would make it look sourced. [lib/health-digest.ts](lib/health-digest.ts)
stores each report and the caller passes the previous one back in as text, which
makes both sides of a comparison auditable because both are in the prompt.
`generateHealthDigest` takes it as an argument and does not read storage itself:
text in, text out, one owner for the store.

That store also gave the digest a reader. It cost five Keeper calls per creator
per day and returned a string to Vercel Cron, which discards response bodies.

## Escalation store rules

[lib/escalations.ts](lib/escalations.ts):

- **Structured data drives actions; prose is display-only.** Every field the
  resolve path needs comes off the platform event, never from parsing an LLM
  response. `veraContext` / `sageContext` are rendered, never parsed.
- **Resolve is claimed with a single `ZREM`.** If it does not return `1`, another
  caller won — bail. This is what stops a double-click firing two mutes.
- **`resolveEscalation` returns the packet as it was *before* redaction**, since
  the caller still needs the message for the learning loop.
- **Retention is a GDPR control, not hygiene.** Pending packets hold real member
  messages and expire in 30 days; resolved packets are redacted and keep 90. Do
  not lengthen the pending window or retain `messageContent` past resolve
  without understanding why it is short — a moderation queue concentrates
  Article 9 special category data by construction.
- **`authorId` survives redaction deliberately.** Without a stable identifier
  there is no way to find a member's records to erase them.
- **Erasure has to cover everything keyed by that member, not just packets.**
  `purgeForMember` also deletes `keys.memberTrust(communityId, authorId)` — the
  cached trust reading the Members page writes, which is member-identifying and
  keyed the same way. It was missed at first because it is a convenience cache
  rather than a record, which is exactly the reasoning that leaves data behind
  after an erasure request. Anything new keyed by `(communityId, authorId)`
  belongs in that purge on the day it is added.
- **The index keys carry a TTL too, refreshed on write.** They are not just
  bookkeeping: `escalations:member:<communityId>:<authorId>` has a real member's
  id *in its key name*, so an index with no expiry records that this person was
  moderated here long after the record itself is gone. Redis set members have no
  individual TTL — only the containing key does, and nothing set one until this
  was found. `INDEX_TTL_SECONDS` is pending + resolved, because resolving
  extends a packet to 90 days from resolve and an index must outlive what it
  points at.
- mindfully.gg is a **processor**; the creator is the controller. We assist with
  data subject requests, we do not answer them.

## Keeper output is HTML, and the prompt cannot fix it

Minds return `<p>` and `<br>` regardless of what the Skill and the prompt ask
for. Three rounds of rewording changed nothing. It is handled in code —
[lib/normalize.ts](lib/normalize.ts) — at three boundaries:

- **Outbound**, once at the top of each `executeAction` in
  [lib/adapters/rest.ts](lib/adapters/rest.ts). A new send site inherits it; a
  new *adapter* must call it. Only the mention-fallback path sets
  `parse_mode: "HTML"`, and it escapes its body — a bare `&` 400s the whole send.
- **Inbound**, in the parsers. `<p>CLASSIFICATION: CLEAR_SAFE</p>` matches no
  anchor, so an HTML-wrapped reply escalates every message to a human.
- **On the way to a screen.** Any Vigil prose the dashboard renders — the
  `veraContext` and `sageContext` on an escalation card, a member lookup — has
  to be normalised too, or the tags are displayed literally. This was missed for
  months because the two boundaries above were treated as the whole list, and
  because the one escalation anybody looked at had been resolved, which nulls
  both context fields. **A new display surface must call it, exactly like a new
  adapter.**

A Mind will also emit backslash-escaped quotes in prose — `(\"Ivan Molto\")`.
`toPlainText` deliberately leaves those alone, because it runs on the parse path;
unescape at the display boundary instead.

**Every anchored field must match exactly once.** Normalising creates line
boundaries, and anchored parsing is the injection defence, so a second match
escalates rather than winning. Do not "fix" a flaky parse by taking the first
match — that is the hole this closed.

**Assert on normalised text, never raw.** Raw looks clean when `&amp;` is about
to reach a member, and looks broken when nothing is wrong.

Verify store changes against real Upstash:

```
npx tsx --env-file=.env.local scripts/check-escalations.ts
```

## A published Skill's description is a router, and it freezes the prompt

A Skill is invoked when the prompt **matches its description**. A prompt that
does not match never reaches the Skill at all: the Mind answers as itself, in a
confident voice, following none of the rules in the body. Every diagnostic looks
healthy while this happens — the Skill is equipped, listed, and the playbook is
loading for the calls that *do* match.

The measurement is `SKILL_LoadPlaybook` in a run's cognition breakdown: **one
load per invoked call**. Fewer loads than calls means some shape missed the
description. Read that number before theorising about a Skill body.

Two consequences for anyone editing this repo:

- **Prompt wording for a published role is part of the contract.** Renaming
  `Moderation summary:` in `generateHealthDigest` could silently unhook the
  published moderator from its own call site. Descriptions cannot be edited
  after publication — the correction path is republish under a new id and one
  line in [lib/skills-config.ts](lib/skills-config.ts).
- **A new call site needs a description clause before it needs a body rule.**
  The culture role shipped describing two of its six shapes; the digest and the
  status ping fell through, and the digest is the one a creator reads.

The published moderator has the same gap for status pings and cannot be fixed.
Impact is nil today because `verifySwarm` only checks that *something* came
back. See `skills/culture-learner/learnings.md` §19.

## A conversation is a queue, not a request and a response

`waitForReply` cannot be trusted to pair a reply with its prompt even when it
reports success — two sequential calls have returned byte-identical text for two
different prompts, both reporting no timeout. `queryVigil` therefore treats
history as the authority (`replyToSentMessage`) and keeps a per-alias set of
replies it has already handed out.

**That guard is per-process**, which was fine while production sent one message
per invocation. It is not fine for a dashboard button that calls the same alias
repeatedly: every serverless request starts with an empty map, so a stale reply
can be served again and again. If you add a surface that queries a Vigil more
than once, make the prompt unique per request and check the answer actually
belongs to the question.

**Minds also deduplicate.** Sent three identical status pings, one answered once
and said so. A byte-identical prompt is a question it may consider already
answered, and then the loose pairing above hands you somebody else's reply.

**Switching a Mind off does not drop its queue.** Messages sent while it is off
are answered when it wakes, in a burst, ahead of anything you send next. Before
testing, switch the Minds on and give them a minute to drain.

# Telegram bot concurrency (grammY runner)

The Telegram adapter ([lib/adapters/telegram.ts](lib/adapters/telegram.ts)) uses
grammY. By default it runs via `bot.start()`, which processes updates in a
**sequential long-polling loop** — each update handler runs to completion before
the next update starts.

For a moderation bot this matters because a flagged message runs the full swarm
chain: `processMessage` in [lib/adapters/index.ts](lib/adapters/index.ts) hands
off to `handleMessage` in [lib/orchestrator.ts](lib/orchestrator.ts) — Vera →
Sage → Kira — which is several LLM round-trips (~5–15s). Under the sequential loop, one slow
swarm evaluation blocks every other community's messages behind it, so
moderation latency stacks linearly with load.

`@grammyjs/runner` (`run(bot)` instead of `bot.start()`) replaces the loop with a
concurrent one: sequential **per chat**, concurrent **across chats** — which maps
cleanly onto `communityId` as the chat key.

## Pros

- Concurrent handling across communities — one slow swarm eval no longer blocks
  others; moderation latency stops scaling linearly with load.
- Keeps same-chat updates in order, so per-community message ordering is
  preserved (no processing message #2 before #1).
- Pulls larger update batches with backpressure handling — scales to higher
  update volume than the built-in loop.
- First-party grammY plugin, actively maintained; ~5-line change to adopt.

## Cons

- Introduces shared-state race surface. Audit the trust cache in
  [lib/pre-filter.ts](lib/pre-filter.ts) (`cacheTrustScore` / `invalidateTrustCache`);
  it's keyed by `(communityId, userId)` and the runner keeps same-chat updates
  sequential, so it's mostly protected, but confirm before enabling. This is now
  the *only* in-process shared state on the message path — the outbound adapters
  no longer cache clients, and the escalation store is Redis-backed with an
  atomic claim, so neither adds race surface.
- Graceful shutdown changes: `run()` returns a handle stopped with
  `await runner.stop()`, so the `SIGINT` / `SIGTERM` handlers must be updated
  (they currently call `bot.stop()`).
- Requires solid `bot.catch()` so concurrent handler failures are logged, not
  swallowed.
- Extra dependency (`@grammyjs/runner`).

## Recommendation

**Not yet.** While the project runs one or a few communities, the default
sequential loop is simpler and race-free, and the pre-filter already keeps
clearly-safe messages on an instant, zero-LLM path. Adopt the runner when
**multiple active communities share one bot process** or moderation latency
climbs under load. Decide first whether deployment is one bot process per
community or many communities fanned through one — that architectural choice is
the signal for when the runner becomes worth it.
