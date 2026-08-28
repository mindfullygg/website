# Health pulse

> **Skill body withheld.** `SKILL.md` is not in the public repo. What it must
> satisfy is fully specified here and machine-checked in
> [fixtures.json](fixtures.json) — the contract is public even though the
> wording is not. The prompts the role actually receives are public too, in
> [lib/orchestrator.ts](../../lib/orchestrator.ts).

Alias `mira-health`. Compiles the daily picture from the other four roles, and
tells the guide which rooms are safe to send a newcomer into.

**Published.** Listed `skillId`
`afb3513e-f36b-1410-8466-00039ce7df11`, pinned in
[lib/skills-config.ts](../../lib/skills-config.ts). The fifth and last of the
five roles — built last deliberately: it summarises the other four, it is not on
the moderation path, and it is least interesting with an empty history, which is
what week one is.

**Stage 2: 9/9 on every case that reached the Skill.** Two runs, ~50 credits.
The digests refuse a score when data is absent and report figures when it is
present, use labelled sections, and name no Minds. The status ping is the one
shape that cannot be tested through its production prompt — a fixed string that
Minds deduplicates, so it returns a stale pre-Skill reply and generates no model
turn at all. Harmless today; [learnings.md](learnings.md) §15 has the reasoning
and the leak to watch.

## The description is the router

Worth stating before anything else. **A prompt that does not match the Skill's
description never reaches the Skill.** The Mind answers as itself instead, in its
own voice, following none of the rules in the body — on this project that
produced a persona blurb and a creator's email address in reply to a status ping,
on two different Minds.

This role receives three shapes and the description names all three. If a fourth
call site is added, the description is the first thing to change — and it cannot
be changed after publication, so it is changed before.

The measurement is `SKILL_LoadPlaybook` in a run's cognition breakdown: one load
per invoked call, absent when the prompt missed.

## Called from

| Prompt | Sent by | Reply consumed by |
| --- | --- | --- |
| `What channels are most active right now?…` | `handleNewMember` | injected into the welcome prompt as `activity` |
| `DAILY HEALTH DIGEST — Compile from all agents:` | `generateHealthDigest`, on the 09:00 cron | returned to the cron — **see below** |
| `Status check…` | `verifySwarm` | presence only |

The digest sections are labelled by **role**, never by Mind name. They were
labelled `MEMBERS (Vera):` through `ONBOARDING (Nova):` until 2026-08-27, which
handed the role four of our Minds' names in a prompt sent to every creator's
swarm. Each section now also passes through `usableContext`, so a failed upstream
arrives as `No data available.` rather than as a bracketed error string the role
would reason about.

## The digest currently has no reader

Stated plainly because it changes what a demo can claim. `generateHealthDigest`
returns the report to
[the cron route](../../app/api/orchestrator/digest/route.ts); Vercel Cron
discards response bodies, nothing writes it to Redis, and `/dashboard/health`
renders static mock data.

So the report is generated, billed at five Vigil calls per creator per day, and
thrown away. The Skill is specified as though a creator reads it — the storage
fix is small and a published body cannot be changed — but nobody sees it yet. To
read one, POST to the digest endpoint with `CRON_SECRET` and look at `report`.

## Output contract — nothing parses it, which is not the same as no contract

Two audiences, and the format splits on them:

- the **creator** reads the digest in a dashboard, so short labelled sections are
  fine there;
- the **community guide** turns the channels answer into a message a newcomer
  receives, so that one is prose, and operator language — percentages, sentiment
  scores, the word "flagged" — does not belong in it.

## Never invent a number

The rule the whole role rests on. A confident `73/100` on day one is fluent,
plausible, exactly what the prompt asked for, and undetectable downstream,
because the number *is* the output and there is nothing to compare it against. It
teaches the creator to distrust every number afterwards.

Two data points are not a trend. A section reading `No data available.` is an
absence, not a finding — report it missing rather than filling it.

## Fixtures

[fixtures.json](fixtures.json) covers all three shapes in **ten cases**. Every prompt is
**generated** from an exported builder — `CHANNELS_QUESTION_PROMPT`,
`buildHealthDigestPrompt`, `STATUS_CHECK_PROMPT` — so a change to a prompt
reaches the suite instead of quietly invalidating it. There is no
`promptStyle: "raw"` case; do not add one.

The suite asserts a word ceiling (`maxWords`) rather than only characters,
because the body states its limit in words and a character cap is a poor proxy
across languages.

One pair carries most of the weight: **`digest-no-invented-score` and
`digest-with-real-data`**. The first must refuse a score, the second must not
merely decline — it has to cite a figure it was handed and engage with what it
was told. If both refuse, or both score, the rule is a habit rather than a
judgement, and a single case cannot show that.

That second case was tightened after a hand-written blanket refusal **passed**
it, which would have let a Mind with a total refusal posture score 10/10 on the
suite it was supposed to fail. §10 — and note
the failure mode it guards is real on this project, not hypothetical: the trust
keeper's first build acquired a refusal posture nobody wrote.

`digest-all-absent` is the week-one shape: all four sections read
`No data available.` while the prompt still demands a 0–100 score, a trend and a
comparison to previous periods. It puts both CRITICAL rules under load at once
and is the case to read first.

**Names are asserted with `excludesWord`, not `excludes`.** The distinction is
load-bearing here rather than stylistic §9.
`excludes` is a substring test, and `Vera` is a substring of "o*vera*ll", which
is the first word a digest reply reaches for because the prompt asks for an
"overall health score". Markup fragments (`**`, `&#`, `/100`) stay on
`excludes`, where substring is the correct test.

Known gaps, recorded rather than hidden:

| Gap | Why it is left |
| --- | --- |
| Nothing asserts the role does not **manufacture** a concern | "No rooms to avoid" and "avoid #trading" share vocabulary; an exclude that catches the second fails the first, which is the better reply |
| Neither the digest nor the channels question carries a language tag | `handleNewMember` threads `language` to the guide only, so an English channels answer feeds a possibly-Spanish welcome. The guide owns the output, so the English stays on the input side. `buildCultureSummaryPrompt` is unlanguaged the same way — platform pattern, not a defect of this role. §11 |
| The discard rule's *recovery* half is untested | A visible mid-reply self-correction cannot be forced from outside |

