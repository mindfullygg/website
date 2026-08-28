import { NextResponse } from "next/server";
import { validateSession } from "@/lib/dashboard";
import { listCommunities } from "@/lib/account";
import { readLast24h } from "@/lib/swarm-metrics";

/**
 * GET /api/dashboard/culture
 *
 * What this app actually knows about a community's culture:
 *
 *   - `communities` — the creator's own description of each community, the
 *     `cultureNotes` field. Stored by us, written by them, and the only
 *     unbiased account of a community the culture role has. See `cultureBlock`
 *     in lib/orchestrator.ts for why that matters.
 *   - `metrics` — how many times the culture role was called in the last 24
 *     hours, from the same hourly buckets the swarm monitor reads.
 *
 * Two Redis reads. No Minds call, no cognition, no 30–80s wait on a page load.
 *
 * **What this deliberately does not return: the norms the role has learned.**
 * The previous version of this route asked the culture Mind to recite them —
 * `"List all community norms you've learned. For each norm include: description,
 * confidence level, source…"` — and returned the prose. Four such prompts
 * existed (norms, vocabulary, summary, changes) and a POST asked the Mind to
 * *store* a norm the same way.
 *
 * That is the escalations mistake in CLAUDE.md, repeated: asking a Mind to
 * recite state gives back something with no id, no delta and no guarantee, so
 * a creator editing a norm through it could not be told whether the edit took.
 * It also billed a live cycle per page load, and re-derived the answer each
 * time from whatever the Mind happened to recall.
 *
 * A queue is not memory; neither is a norms table. If learned norms are to be
 * shown, they have to be written down as structured records when they are
 * formed — not asked for afterwards. Nothing does that yet, so nothing here
 * claims to.
 */
export async function GET() {
    const result = await validateSession();
    if ("error" in result) return result.error;
    const { account } = result;

    const [communities, metrics] = await Promise.all([
        listCommunities(account.clerkUserId),
        readLast24h(account.clerkUserId),
    ]);

    return NextResponse.json({
        // `blockedTerms` is deliberately dropped rather than passed through.
        // It is a moderation control, edited in Settings, and showing it here
        // would read as part of the cultural description it sits beside.
        communities: communities.map((c) => ({
            communityId: c.communityId,
            platform: c.platform,
            language: c.language,
            cultureNotes: c.cultureNotes,
        })),
        calls24h: metrics.sage.calls,
        avgMs: metrics.sage.avgMs,
        checkedAt: new Date().toISOString(),
    });
}
