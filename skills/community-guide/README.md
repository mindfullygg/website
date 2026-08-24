# Community guide

> **Skill body withheld.** `SKILL.md` is not in the public repo. What it must
> satisfy is fully specified here and machine-checked in
> [fixtures.json](fixtures.json) — the contract is public even though the
> wording is not. The prompt the role actually receives is public too, in
> [lib/orchestrator.ts](../../lib/orchestrator.ts).

Alias `nova-onboard`. Welcomes new members.

## Called from

`handleNewMember` in [lib/orchestrator.ts](../../lib/orchestrator.ts), after the
trust, culture and health roles have supplied context.

## Output contract — none enforced, but read this

**The reply is sent to a real person, verbatim.** `processNewMember` passes it
straight to `adapter.sendWelcome`, which DMs it to the new member.

So the entire reply must be the message itself. No preamble, no
"Here's a welcome message:", no notes to the operator, no surrounding quotes.
Anything you write, a stranger reads as their first contact with the community.

Keep it short. Telegram DMs fail if the member has never messaged the bot — the
adapter falls back to a mention in the group, where a long message is worse.

## Cold start

A new community has no ambassadors and little activity. Welcome warmly without
inventing channels or people that do not exist.

## Platform shape

`channel` means different things per platform. On Telegram it is the **group
title** and the community is a single chat — there are no channels to recommend.
On Discord it is a real channel name and there are many. Zero channels is a valid
answer, and the Skill must not fill that gap from habit.

## Fixtures

[fixtures.json](fixtures.json) — 11 cases, all passing as of 2026-08-24.

`promptStyle: "welcome"`, so the harness sends the exact prompt production
sends: `buildWelcomePrompt` in [lib/orchestrator.ts](../../lib/orchestrator.ts),
not a paraphrase of it. `contract: "none"` because nothing parses this role's
output — its contract is *sendability*, which is why the assertions are about
what a member would read rather than about a format.

No fixture-level `language`, deliberately: the default exercises the inference
fallback, and the two cases that test an explicit `CommunityBinding.language`
set it themselves.

Two of the eleven originally failed on assertions that were wrong rather than on
the Skill:

- One required the welcome to never name a channel the health role had flagged.
  The Skill named it *to steer a newcomer away from it* — correct, since the
  context described that room as the community's flagship and a newcomer finds
  it regardless. The assertion now requires the warning and forbids the health
  report leaking into it: no percentages, no sentiment scores, no "flagged".
- One capped a cold-start welcome at 500 characters. Length was a proxy for the
  real defect, which was narrating an absence — telling a newcomer there are no
  regulars yet. Once that rule was fixed the length followed, and the assertion
  now names the behaviour instead of the symptom.

Both are recorded because the lesson generalises: **a fixture that punishes
correct behaviour is worse than no fixture**, since it teaches the Skill to hide
a problem from the person it affects.

## Published

`Mindfully_Community_Guide` — Skill id
`9819503E-F36B-1410-8466-00039CE7DF11`, wired into
[lib/skills-config.ts](../../lib/skills-config.ts) so setup equips it
automatically for any creator who assigns a Mind to this role.
