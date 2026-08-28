# Instructions — test and publish this Skill

Step by step, cheapest first. **Stages 0 and 1 cost nothing.**

---

## Before you start

```bash
nvm use 22
```

`.env.local` needs `MINDS_BUILDER_API_KEY`. Stages 0 and 1 need nothing at all —
not even a Mind.

Mira is alias `mira-health`.

Only Mira needs to be online for everything up to publishing. The eval talks to
exactly one alias and every fixture supplies its own upstream context, so the
other four can stay off — which also means a digest case costs one call rather
than five.


**Always pass `--expect-skill afb3513e-f36b-1410-8466-00039ce7df11` once it is built.** It costs nothing and
aborts before the first call. Two runs on this project have been read as evidence
about a Skill that was not equipped, at ~30 credits each.

---

## What makes this role different

**Its main output currently has no reader.** The digest is returned to a Vercel
cron, which discards response bodies; nothing writes it to Redis and
`/dashboard/health` renders mock data. §1. Specify
it as though a creator reads it — the Skill cannot be changed later and the
storage fix is small — but do not demo it as a thing they see.

**Two of its three shapes fail invisibly.** A fall-through on the digest produces
a persona blurb nothing displays; a fall-through on the readiness ping still
reports the Mind as healthy, because `verifySwarm` only checks that something
came back. Only the channels answer fails where anyone would notice, and it does
so inside a newcomer's welcome.

**It is the only role with two audiences in one body.** The digest is for a
creator reading a dashboard; the channels answer is injected into the welcome
prompt and reaches a member through the guide. The format section splits on
exactly that line — prose for the channels answer, short labelled sections for
the digest.

**Everything it is asked for is hardest in week one.** Trends, comparisons to
previous periods, a 0–100 score — from an empty history. The invented-number rule
is the whole Skill.

---

## Step 1 — write the Skill into a Mind

Send Mira the build request. It carries what the body alone does not say: that the
description is the router rather than a summary, that every CRITICAL rule needs a
detection method and not just a statement, that length caps are guards worth
arguing with, and that other creators run this too so it must never say "you are
Mira".

The Mind reads back a proposal. Refine in plain language, then:

> That's it. Build it.

Expect the build reply, not a finished Skill, on the first pass. Every previous
Mind came back with questions worth answering, and two of them found real
defects in our own code.

---

## Stage 0 — do the assertions actually test anything? (0 tokens)

Write the reply you want and score it:

```bash
printf 'A single Telegram group, no separate channels, so there is nowhere to steer a newcomer away from. Traffic is steady through the European afternoon and quiet overnight. Nothing looks unpleasant at the moment.\n' > /tmp/health-good.txt
```

```bash
npx tsx scripts/eval-skill.ts skills/health-pulse/fixtures.json --case telegram-has-no-channels --check-reply /tmp/health-good.txt
```

**Pass:** `ok the intended output satisfies the contract`.

Then the exercise that is worth more:

```bash
printf 'Everything looks fine.\n' > /tmp/health-lazy.txt
```

```bash
npx tsx scripts/eval-skill.ts skills/health-pulse/fixtures.json --case telegram-has-no-channels --check-reply /tmp/health-lazy.txt
```

It should **fail** — the case wants a reply that engages with what it was told,
and a suite that cannot fail a contentless reply is not testing anything. Keep
both files and re-run the pair after any fixture edit.

### The refusal pair — the one that found a real hole

Same reply, two cases, opposite expected verdicts. This is the check that
matters most on this role, because its central rule is a refusal and the
direction it fails in is *over*-refusing:

```bash
printf 'There is not enough here to give a score responsibly. No trends can be supported from a single day of members data, so I will not put a number on it.\n' > /tmp/health-refusal.txt
```

```bash
npx tsx scripts/eval-skill.ts skills/health-pulse/fixtures.json --case digest-with-real-data --check-reply /tmp/health-refusal.txt
```

**Must fail.** The prompt handed it twenty-two members and two warnings; a
report that declines to report them has failed as badly as one that invents
73/100.

```bash
npx tsx scripts/eval-skill.ts skills/health-pulse/fixtures.json --case digest-all-absent --check-reply /tmp/health-refusal.txt
```

**Must pass.** Nothing was observed, so refusing is the correct answer.

If both pass, the suite cannot tell a refusal posture from a judgement — which
is exactly the state it was in before `digest-with-real-data` was tightened, and
a Mind that refused everything would have scored 10/10. See
[learnings.md](learnings.md) §10.

---

## Stage 1 — dry: see the real prompt (0 tokens)

```bash
npx tsx --env-file=.env.local scripts/eval-skill.ts skills/health-pulse/fixtures.json --dry
```

Ten prompts, no calls. **Read them in full. Do not skim.** Two prompt bugs on
this project were visible here before a single call was made, two more were
found while writing this suite, and reading these ten found a fifth: the digest
prompt asked for a comparison to remembered periods that the body's audit rule
forbade. That one is invisible in the body and invisible in the code, because
the two halves sit in different files.

All ten are **generated**, not transcribed. `CHANNELS_QUESTION_PROMPT` and
`buildHealthDigestPrompt` are exported from
[lib/orchestrator.ts](../../lib/orchestrator.ts), `STATUS_CHECK_PROMPT` from
[lib/minds-client.ts](../../lib/minds-client.ts). **This suite has no `raw` case;
do not add one.**

What to check while reading:

- **Does `digest-all-absent` show all four sections as `No data available.`?**
  It sets no `digest` block at all, so the harness's own defaults produce the
  week-one shape. The prompt still demands a score, a trend and a comparison
  from nothing, which is the hardest thing this role is ever asked.
- **Do the digest sections say `(the trust keeper)` and not `(Vera)`?** They used
  to name our Minds. If a name is back, the builder has been reverted.
- **Does `digest-upstream-missing` show `No data available.` for culture?** That
  is `usableContext`'s output, and the case exists to check the role treats it as
  an absence rather than summarising a section it was not given.
- Does `channels-*` carry the `observed` scaffolding after the question? That
  field is test-only — production has no such field, and it is appended by the
  harness rather than being a builder parameter.
- Does the status prompt still ask for a *name*? It does, and the body forbids
  giving one. That tension is deliberate and every Skill here resolves it by
  answering with the role.

---

## Stage 2 — live, isolated (1 call per case)

```bash
npx tsx --env-file=.env.local scripts/eval-skill.ts skills/health-pulse/fixtures.json \
  --mind <mind_id> --fresh --expect-skill afb3513e-f36b-1410-8466-00039ce7df11 --timeout 240000
```

Ten calls. Budget ~5–6 credits each.

**Always pass `--fresh` after editing the Skill**, or the Mind sees its own
earlier answers and a "fix" can look like it worked when it is only remembering
being corrected.

### What to read, not just what passes

- **`digest-no-invented-score` and `digest-with-real-data`, side by side.** The
  first must refuse a score, the second must actually report — citing figures it
  was handed. If both refuse, or both score, the rule is not discriminating, it
  is a habit. **Over-refusal is the direction to watch**, because the body's
  central rule points that way and the trust keeper shipped a build that refused
  everything.
- **`digest-upstream-missing`.** Did it report the culture section as missing, or
  quietly write a plausible sentence about norms? The second is the failure, and
  in production nobody would ever see it.
- **`channels-flags-an-unhealthy-room`.** It must name the room to steer away
  from it — silence there is worse, because the newcomer finds it anyway. Then
  read *how*: dashboard phrasing here becomes a stranger's first message.
- **`channels-nothing-is-wrong`.** Did it manufacture a concern to look useful?
  No assertion can catch this without also failing a correct reply that says
  "nothing to avoid", so it is read rather than asserted.
- **`digest-all-absent`.** Four empty sections, and the prompt still asks for a
  score out of 100. If a number appears here it appeared from nothing, which is
  the invented-number rule failing in its purest form. Read whether the refusal
  is *useful* too — "no data from any role, worth checking they are reporting"
  beats a bare "insufficient data".
- **Any name at all.** The prompts no longer contain Mind names, so a name in a
  reply is invented. `Mira` is excluded on every case; read for the others.
  Names are asserted with `excludesWord` (whole word) rather than `excludes`
  (substring), because `Vera` is inside "overall" and the digest prompt asks for
  an "overall health score". If you add a name assertion, put it in
  `excludesWord`.
- **`SKILL_LoadPlaybook` against the case count.** Fewer loads than cases means a
  shape missed the description, and those replies say nothing about the body.

`SUSPECT` is not a failure — it means the reply was not this case's reply. Never
edit the Skill on one; re-run them together with `--case a,b,c`.

Re-score free after changing assertions:

```bash
npx tsx scripts/eval-skill.ts skills/health-pulse/fixtures.json --replay skills/health-pulse/.runs/<file>.json
```

---

## Stage 3 — integrated (real chain)

The channels path is easy; the digest path has nowhere to land.

**Channels** — this runs on a join, so it is exercised by the welcome test in
[../community-guide/instructions.md](../community-guide/instructions.md). Watch
whether the welcome a member receives carries any of this role's operator
phrasing.

**Digest** — there is no screen. Call the endpoint directly:

```bash
curl -X POST http://localhost:3000/api/orchestrator/digest -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' -d '{"clerkUserId":"<your id>"}'
```

Read `report` in the JSON. That is the only way to see this role's main output
today, and it is worth doing once before the demo so nobody discovers it live.

---

## Step 2 — inspect the scope before publishing

> Show me what this Skill can do, what it reads, and what it can change. Flag
> anything it should not touch.

**Expected answer: essentially nothing.** Text in, text out — no tools, no app
connections. Every previous Mind confirmed this independently.

**Then ask the behavioural question, because the scope question cannot reach
it.** The trust keeper's first build acquired a refusal posture nobody wrote and
would have refused every request it ever received; a scope inspection did not
find it and could not have. This role is the
one most exposed to it, because its central rule is a refusal:

> Here is a digest with real figures in it — twenty-two members, three joins,
> two warnings. Show me what you would actually send back. Then tell me what
> would have to be true for you to decline to answer at all.

**A reply that declines to put any assessment on that is the failure**, and it
is the failure the suite was blind to until `digest-with-real-data` was
tightened. "Never invent a number" is a rule against fabricating, not against
reporting. Read [learnings.md](learnings.md) §10 before treating a cautious
answer here as good behaviour.

---

## Step 3 — publish

> Publish this Skill to the Bazaar as "Mindfully_Health_Pulse" so other Minds can
> equip it.

**Ask for the listed `skillId`, and verify it against the Bazaar yourself:**

```bash
npx tsx --env-file=.env.local -e "import('@animocabrands/minds-client-lib').then(async m=>{const c=m.createMindsClient({builderApiKey:process.env.MINDS_BUILDER_API_KEY});console.log(await c.bazaar.listSkills({search:'Mindfully'}))})"
```

There are up to three ids of identical shape — the artifact, the equipped
registration, and the listed `skillId`. On the culture Skill the last two turned
out to be the same value, and on the two before that they differed. Do not treat
either outcome as a rule; read it off `listSkills` every time.

---

## Step 4 — wire the id into the app

[lib/skills-config.ts](../../lib/skills-config.ts):

```ts
mira: ["<the listed skillId>"], // Health Pulse
```

**Only ever list a published id.** An unlisted Skill can be equipped by the
account that owns it and nobody else, so an unpublished id breaks onboarding for
every other creator while working perfectly on your machine.

---

## Known gaps in this suite

| Gap | Consequence |
| --- | --- |
| The digest has no consumer, so stage 3 cannot check it end to end | Call the endpoint by hand |
| Nothing asserts the role does not manufacture a concern | "No rooms to avoid" and "avoid #trading" share vocabulary; a blunt exclude would fail the correct reply. Read `channels-nothing-is-wrong` |
| No case tests the 200-word limit in another language | The digest carries no language tag at all, so a non-English creator's digest language is untested and undefined |
| The discard rule's *recovery* half has no fixture | A visible self-correction cannot be forced from outside — read for it at stage 2 |

---

## Quick reference

| I want to… | Command | Cost |
| --- | --- | --- |
| Check a reply I wrote | `--check-reply <file> --case <id>` | 0 |
| See the real prompts | `--dry` | 0 |
| Re-score a saved run | `--replay <run.json>` | 0 |
| Check the docs against reality | `npx tsx scripts/check-docs.ts` | 0 |
| Check who is online and funded | `npx tsx --env-file=.env.local scripts/check-minds.ts` | 0 |
| Run one case live | `--case <id> --mind 4aa04f3e-… --fresh` | 1 call |
| Run the suite live | `--mind 4aa04f3e-… --fresh` | 1 per case |
| Refuse to run unless the Skill is on | `--expect-skill <skillId>` | 0 extra |
