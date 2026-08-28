# Trust keeper

> **Skill body withheld.** `SKILL.md` is not in the public repo. What it must
> satisfy is fully specified here and machine-checked in
> [fixtures.json](fixtures.json) — the contract is public even though the
> wording is not. The prompt the role actually receives is public too, in
> [lib/orchestrator.ts](../../lib/orchestrator.ts).

Alias `vera-trust`.

**Published, tested 8/8.** Skill id
`E4CF503E-F36B-1410-8466-00039CE7DF11`, equipped on Vera. See
[instructions.md](instructions.md) to run the suite.

Remembers who each member is and how much they have earned.

## Called from

- `handleMessage` — member lookup, in parallel with the culture role. Its reply
  becomes `TRUST CONTEXT` in the moderator's prompt.
- `handleNewMember` — create a profile, initial trust score 50.
- `generateHealthDigest` — 24h member activity summary.
- `handleCreatorOverride` — trust adjustment after a reversed decision.

## Output contract — enforced

`parseTrustScore` extracts `/[Tt]rust\s*[Ss]core:\s*(\d+)/`.

Always emit a line reading **`Trust Score: <0-100>`**. A missing score parses as
`null`, which is *not* the same as zero: the pre-filter cache stays empty and
the moderator loses its strongest signal.

## Cold start — the one that will bite you

A brand-new community has no history, which is exactly what a demo looks like.
For a member you have never seen, still emit `Trust Score: 50` and say the
member is new. **Never** withhold the score because you lack history.

## Beyond the score

The rest of the reply is prose the moderator reads. Useful: tier, tenure, prior
incidents, risk. Aim for what the `trustContext` strings in the moderator's
fixtures look like — those are the target shape.

## Fixtures

`fixtures.json` in this folder (to be written)
