# Culture learner

> **Skill body withheld.** `SKILL.md` is not in the public repo. What it must
> satisfy is fully specified here and machine-checked in
> [fixtures.json](fixtures.json) — the contract is public even though the
> wording is not. The prompt the role actually receives is public too, in
> [lib/orchestrator.ts](../../lib/orchestrator.ts).

Alias `sage-culture`. Learns what is normal *here*, so the moderator can judge a
message in context rather than against a generic rulebook.

Built and tested — 14/14 across the suite.

## The description is the router

Worth stating before anything else, because it outranks every rule in the body.
**A prompt that does not match the Skill's description never reaches the Skill.**
The Mind answers as itself instead, in its own voice, and the reply looks
plausible while following none of the rules below.

This is measurable: the run output bills one `SKILL_LoadPlaybook` per invoked
call, so fewer loads than cases means some shape missed the description. Ours
originally described two of the six shapes it receives, and both the status ping
and the **digest** were falling through — the digest being the one whose reply a
creator reads, compiled into their daily report. The description now carries five
clauses for six shapes, the two learning signals sharing one.

If a seventh call site is ever added, the description is the first thing to
change.

[instructions.md](instructions.md) to run the suite.

## Called from

Six message shapes, not four. The last three are easy to miss because nothing
reads the reply.

- `handleMessage` — evaluate a message against community norms, in parallel
  with the trust role. Its reply becomes `CULTURAL CONTEXT` for the moderator.
- `handleNewMember` — culture summary for the welcome.
- `handleMessage`, after a confirmed violation — `Moderation action taken in
  #…`, so the norm shift is recorded. Fire-and-forget; the reply is discarded.
- `generateHealthDigest` — tone and norm shifts over 24h. A *delta*, compiled by
  the health role, not the same ask as the welcome summary.
- `handleCreatorOverride` — refine norms when a decision reveals a boundary.
  Fire-and-forget; the reply is discarded.
- `verifySwarm` — status check.

## Output contract — nothing parses it, which is not the same as no contract

The reply is injected into the moderator's prompt as prose. But **the
moderator's own reply is parsed**, on anchored lines, exactly once — so the
contract here is not a format to produce, it is a format to never produce.

**Never emit `CLASSIFICATION:`, `ACTION:` or `Confidence:`**, in any casing,
even to discuss them. A line here that looks like one of the moderator's fields
is a line the moderator may carry into its own output, where a second anchored
label discards the decision. `Confidence:` is the worst of the three to emit: on
two matches the parser does not escalate, it silently defaults to `0.5`
([lib/orchestrator.ts](../../lib/orchestrator.ts)).

State confidence in words — "too little observed to say", "confident, months of
traffic". Never as an anchored line.

Quality matters more here than in any unparsed role: a vague answer produces a
vague decision downstream, and a wrong one is invisible.

## What actually helps the moderator

Which norms are relevant, whether the wording is normal *in this channel*, any
vocabulary that reads differently here than elsewhere, and the channel's tone
baseline. The `culturalContext` strings in the moderator's fixtures are the
target shape.

## Cold start

A new community has no observed norms. Fall back to `CommunityBinding.cultureNotes`
— the creator's own description, interpolated by `cultureBlock`
([lib/orchestrator.ts](../../lib/orchestrator.ts)) — and do not invent norms you
have not seen. When the creator has not written one, the prompt says so
explicitly, and the honest answer is that there is little to go on. An honest "too
little observed to say" gives the moderator a reason to be cautious; an invented
custom gives it a reason to be confident and wrong.

**That block reaches two of the six shapes** — the message evaluation and the
culture summary — carrying either the description or the explicit statement that
none exists, never both. The two learning signals, the digest and the status
check carry neither, so silence there says nothing about whether a description
exists.

Stated as intent, not as a mechanism: nothing in `buildModerationPrompt` tells
the moderator to escalate on a hedged culture reply, and no fixture tests that it
does. Do not rely on it until it is measured.

## The creator's description is the only unbiased input

This role is called from `handleMessage`, which runs **only** after the
pre-filter flags a message. Everything it sees live is an incident. A culture
inferred from incidents says the room is hostile, that summary reaches the
moderator, the moderator flags more, and the sample gets worse.

`CommunityBinding.cultureNotes` is what breaks that loop. It is creator-authored
and therefore **authoritative** — it is deliberately not wrapped in
`untrusted()`, because fencing it would tell the role to describe the creator's
words rather than follow them.

Cleaned by `normalizeCultureNotes` ([lib/validate.ts](../../lib/validate.ts)),
which strips control characters, bidi overrides and fence-shaped markers, and
**rejects** anything over 2000 characters rather than truncating it — the cap is
there because the notes ride in a prompt on every flagged message.

## Language

When a community has **not** set `CommunityBinding.language`, the welcome prompt
infers the language from *this role's prose*
([lib/orchestrator.ts](../../lib/orchestrator.ts), `welcomeLanguageBlock`). An
English summary of a Spanish community has already produced an English welcome
once, with nothing detecting it.

So: write in the community's language, and set `language` on every community —
including English ones.

**With its diacritics.** Accents, tildes, umlauts and cedillas are part of the
requirement, not a nicety: a summary written as `critica`, `operacion`, `aqui`
reads to a native speaker as though nobody proof-read it, and the moderator
dropped every accent from a member-facing warning for want of an explicit rule.
Check before sending and rewrite rather than patch — a visible self-correction
is its own failure, since everything downstream reads the whole reply.

Note which prompts carry a language directive: the message evaluation does, when
the community has set one. The culture summary never does — the welcome prompt
carries the language for that path — which is exactly why the summary is where
inference can go wrong.

## Fixtures

[fixtures.json](fixtures.json) covers all six message shapes. Every prompt is
**generated** from an exported builder — `buildCultureEvaluationPrompt`,
`buildCultureSummaryPrompt`, `buildNormUpdatePrompt`,
`buildCultureOverridePrompt`, `CULTURE_DIGEST_PROMPT`, `STATUS_CHECK_PROMPT` — so
a change to a prompt reaches the suite instead of quietly invalidating it. There
is no `promptStyle: "raw"` case here; do not add one.

Two pairs carry most of the weight, and both work by contrast:

- **`spanish-community-evaluate` and `culture-summary-spanish-inference`.** The
  first sets `language: "es"`; the second sets none, which is the branch where
  the welcome infers its language from this role's prose. Both fail on stripped
  accents.
- **`flagged-sample-is-not-the-culture` and `creator-notes-beat-flagged-sample`.**
  Identical skewed samples; only the second has creator notes. Refusing to
  describe the room is the right answer to the first and the wrong answer to the
  second.

Known gaps, recorded rather than hidden:

| Gap | Why it is left |
| --- | --- |
| The discard rule's *recovery* half is untested | What it prevents is asserted; a visible mid-reply self-correction cannot be forced from outside |
| Nothing asserts the role does not **characterise** a room as hostile | "This room is hostile" and "hostile messages are all I have been shown" share every keyword — an exclude that catches the first fails the second, which is the better answer |
| `normalizeCultureNotes` has no committed test file | Fourteen inputs were checked by hand and passed; none of those checks is in the repo |
| Only the `warn` outcome of the norms update has a fixture | The escalate branch — "no automatic action was taken" — fires on every escalated violation |
