# Instructions — test and publish this Skill

Step by step. Stages 0–2 cost nothing but stage 2. Commands are for the
community guide; swap the fixtures path for any other role.

---

## Before you start

```bash
nvm use 22
```

`.env.local` needs `MINDS_BUILDER_API_KEY` (already set). Stages 0 and 1 need
nothing at all.

---

## Step 1 — make the demo fixture real

Open [fixtures.json](fixtures.json). The first case, `demo-telegram-trading`, is
Telegram-shaped and runs as-is — but its tone, rules and the two member names
(`Ivan`, `Otlom`) are invented. Replace them with your actual group's.

Five fields to edit:

- `displayName` — a plausible new member name
- `language` — currently `"en"`. A BCP-47 tag; must match what you pick in the
  setup UI when you bind the community, or the eval tests a prompt production
  never sends.
- `culturalContext` — how your group actually talks, what the creator forbids,
  any customs, ending `Confidence: 0.75`
- `activityContext` — when it is busy; keep "one chat, no channels" for Telegram
- `ambassadorContext` — the members with real standing, or "none yet"

Then update `containsAny` to those members' names.

**If you demo on Discord instead**, this case is the wrong shape — Telegram is a
single chat, Discord has channels. Copy `established-crypto-community` as the
starting point and delete this one.

Worth doing properly: this fixture is also the written spec that the
culture-learner and trust-keeper Skills get built against later.

---

## Step 2 — write the Skill into a Mind

Skills are built by conversation, not by pasting into a form.

Open a chat with `Nova_Mindfully` (Telegram, email or web) and send:

> Build me a Skill that behaves exactly as described below. Keep the rules about
> what the reply may contain exactly as written — they are not stylistic.
>
> *(then paste the entire **Body** section of your `SKILL.md`)*
>
> The Skill body is deliberately not in this repo — see the note at the top of
> [README.md](README.md). The contract it must satisfy is public and
> machine-checked in [fixtures.json](fixtures.json).

The Mind will read back a proposal. Refine in plain language if needed, then:

> That's it. Build it.

**Say the "exactly as written" part.** The Mind builds from your description and
may reword — and the rule most likely to be softened is the one that matters
most here: the reply is delivered to a member unchanged.

---

## Stage 0 — check the format by hand (0 tokens)

Write the reply you *want* into a file:

```bash
printf 'gm and welcome! Fast crowd here — traders, chart arguments and memes at all hours.\n\n#trading is busiest right now, that is where the calls land. #general is steady, and we all say gm there each morning; it is kind of our thing.\n\nIf you get stuck, OGBuilder is around daily and actually helpful.\n\nDrop a hello when you are ready.\n' > /tmp/draft.txt
```

Score it:

```bash
npx tsx scripts/eval-skill.ts skills/community-guide/fixtures.json --case established-crypto-community --check-reply /tmp/draft.txt
```

**Pass:** `ok the intended output satisfies the contract`.

**Fail:** it tells you exactly which assertion broke. Fix the fixture if the
assertion is wrong, or your draft if the format is wrong. Requires `--case`.

---

## Stage 1 — dry: see the real prompt (0 tokens)

```bash
npx tsx scripts/eval-skill.ts skills/community-guide/fixtures.json --dry
```

**Read the output in full. Do not skim it.** This is the exact prompt production
sends — a delimiter escape was caught here before a single call was made.

Check: does each case give the Mind enough to answer? Is the untrusted block
delimited with a nonce? Does the cold-start case really contain nothing to
invent from?

To capture it for reference (don't commit the file — it goes stale):

```bash
npx tsx scripts/eval-skill.ts skills/community-guide/fixtures.json --dry > skills/community-guide/prompts.txt
```

---

## Stage 2 — live, isolated (1 call per case)

**Set the community's language in the setup UI, and match the fixture.** The
demo case is `"en"`, so pick *English* rather than leaving the dropdown on "Not
set — infer it" — otherwise production sends the inference paragraph while the
eval sends the directive, and you are testing two different prompts.

Set it even for an English community. The culture keeper writes free prose, and
nothing stops it summarising an English group in another language on some future
call; inference would follow it, an explicit tag would not.

```bash
npx tsx --env-file=.env.local scripts/eval-skill.ts skills/community-guide/fixtures.json --mind mind_id --fresh
```

The run will:

1. Wire the alias `nova-onboard` to that Mind if it isn't already
2. Print which Skills are equipped — confirm yours is listed
3. Reset the conversation (`--fresh`)
4. Send one call per case
5. Print cognition spent, total and per case
6. Score every case and save the raw replies to `.runs/`

**Always pass `--fresh` after editing the Skill.** Without it the Mind sees its
own earlier answers and a "fix" can look like it worked when it is only
remembering being corrected.

**`--fresh` does not reset memory.** It starts a new conversation; memory lives
on the Mind and outlives every conversation, which is the point of it. So a
display name is **single-use** — once a name has been through a run, that Mind
remembers welcoming them.

**Display names are therefore generated on every run,** a different one per
case, no two sharing a first name. Otherwise the keeper sees the same person
"join" repeatedly and will — correctly — conclude the bot is replaying events
and stop welcoming them. Ours did exactly that, emailed to ask whether to hold
or continue, and confirmed it would do the same again even knowing the source is
a harness. Pass `--no-vary-names` to exercise that hold on purpose; the
fixtures' own names are burned, so it will hold immediately.

**`SUSPECT` is not a failure — it means the reply was not this case's reply.**
A slow answer can land after its own wait elapses and be picked up by the next
call, so one timeout desynchronises everything after it. Never edit the Skill
on a suspect case; re-run the suspects together:

```bash
npx tsx --env-file=.env.local scripts/eval-skill.ts skills/community-guide/fixtures.json --case a,b,c --mind mind_id --fresh
```

**If the run stops early saying "two silent replies in a row", it is holding.**
That is not a bad case — check your inbox, the keeper emails when it holds. The
run abandons the rest deliberately: each further case would cost a full 240s
timeout and a cycle's cognition to prove the same thing again.

Cheaper options while iterating:

```bash
npx tsx --env-file=.env.local scripts/eval-skill.ts skills/community-guide/fixtures.json --case cold-start-nothing-known --mind mind_id --fresh
```

Re-score a saved run for free after changing assertions:

```bash
npx tsx scripts/eval-skill.ts skills/community-guide/fixtures.json --replay skills/community-guide/.runs/nova-2026-08-23T10-00-00-000Z.json
```

### Then read the replies yourself

The assertions cannot check tone. Open the `.runs/` file and read:

- The **crypto** and **art** replies side by side. If they could be swapped
  without anyone noticing, the Skill is not reading context — it is producing one
  generic welcome with the nouns changed.
- The **Spanish** reply. Is it actually Spanish, or English that dodged the
  excluded phrases?
- The two **language-\*** replies. Their context is English but the tag says
  `es` / `pt-BR` — an English reply there means the Skill ignored the setting,
  which no amount of prose quality makes acceptable.
- The **cold-start** reply. Did it invent a channel, a person or a custom?

---

## Stage 3 — integrated (real chain)

Needs the environment and a bound
community.

1. `npm run dev`, sign in, connect your Builder key at `/dashboard/setup`
2. Assign the five roles
3. Add the bot to a test Telegram group and bind it
4. In a second terminal: `npx tsx --env-file=.env.local bot/start.ts`
   (the flag is required — nothing in the bot loads a `.env` file, and without
   it you get `No bot tokens found` with a perfectly good token in place)
5. Join the group with a second account

**Pass:** the welcome arrives as a DM and reads as a message — no "Here's a
welcome message:", no quotes, no notes.

This is the only stage that tests sendability for real. Stages 0–2 assert it
with string matching.

If stage 2 passed but stage 3 looks wrong, the problem is upstream — stage 2
uses canned context, stage 3 uses whatever the culture, trust and health roles
actually said.

---

## Step 3 — inspect the scope

Before publishing, ask the Mind:

> Show me what this Skill can do, what it reads, and what it can change. Flag
> anything it should not touch.

**Expected answer: essentially nothing.** This role takes text in and returns
text — no app connection, no tools. Anything listed was added by the build step,
not requested by you. Tighten it before publishing.

---

## Step 4 — publish

> Publish this Skill to the Bazaar as "XXXX_YYYY_ZZZZ" so other
> Minds can equip it.

Self-serve, no portal, no waiting. Then confirm it is listed:

```bash
npx tsx --env-file=.env.local -e "import('@animocabrands/minds-client-lib').then(async m=>{const c=m.createMindsClient({builderApiKey:process.env.MINDS_BUILDER_API_KEY});const r=await c.bazaar.listSkills({search:'Mindfully'});console.log(JSON.stringify(r,null,1))})"
```

---

## Step 5 — wire the id into the app

Copy the `skillId` from the previous step into
[lib/skills-config.ts](../../lib/skills-config.ts):

```ts
export const VIGIL_SKILL_IDS: Record<VigilName, string[]> = {
    vera: [],
    sage: [],
    kira: [],
    mira: [],
    nova: ["9819503E-F36B-1410-8466-00039CE7DF11"], // Community Guide
};
```

Then re-run setup at `/dashboard/setup`. `provisionSwarm` equips it on every
creator's assigned Mind.

**Only ever list a published id.** An unlisted Skill can be equipped by the
account that owns it and nobody else, so an unpublished id here breaks
onboarding for every other creator — while working perfectly on your machine.
Equip an unpublished draft directly on your own Mind instead.

---

## Quick reference

| I want to… | Command flag | Cost |
| --- | --- | --- |
| Check a format I wrote | `--check-reply <file> --case <id>` | 0 |
| See the real prompt | `--dry` | 0 |
| Re-score a saved run | `--replay <run.json>` | 0 |
| Verify reply pairing | `npx tsx scripts/check-pairing.ts` | 0 |
| Run one case live | `--case <id> --mind <id> --fresh` | 1 call |
| Re-run a subset | `--case a,b,c --mind <id> --fresh` | 1 per case |
| Run the suite live | `--mind <id> --fresh` | 1 per case |
| Check the right Skill is on | `--expect-skill <skillId>` | 0 extra |
