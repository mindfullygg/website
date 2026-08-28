import { NextRequest, NextResponse } from "next/server";
import { validateSession, queryDashboard } from "@/lib/dashboard";
import { listDigests } from "@/lib/health-digest";
import { VIGIL_ALIASES } from "@/types";

/**
 * GET /api/dashboard/health
 *
 * Returns Mira's latest health data for the dashboard charts.
 * Query params:
 *   ?type=stored    — the stored daily digests. No Vigil call, no cognition
 *   ?type=snapshot  — latest health snapshot (default)
 *   ?type=alerts    — active alerts only
 *   ?type=quick     — quick pulse check (3-4 sentences)
 *
 * `stored` is the cheap one and behaves differently from the rest: it reads
 * what the 09:00 UTC cron already wrote instead of asking the Vigil. Free,
 * immediate, and the same text every viewer sees — where the live types each
 * cost a call and can take the full 90-second timeout. Prefer it wherever a
 * page just needs to show the latest report.
 *
 * **`snapshot`, `alerts` and `quick` do not work, and cannot be fixed here.**
 * No page calls them any more. Each asks the health role to report on a
 * community while supplying nothing about that community, and the published
 * Skill forbids inventing what it was not given, so every one returns a
 * refusal — politely, at the cost of a call:
 *
 *     There is no current state in this prompt to report on … I have stopped at
 *     the edge of what was actually given to me.
 *
 * They were written for a Mind that would answer anything, on the assumption
 * that it holds member counts and sentiment in its head. CLAUDE.md rules that
 * out — state goes in Redis, a Vigil is for judgment — and the Skill made the
 * assumption's failure visible instead of silently plausible. **They were always
 * broken; fabrication was hiding it.**
 *
 * Kept rather than deleted because the fix is real and known: supply the state.
 * `generateHealthDigest` already does exactly that — four role summaries into
 * one prompt — which is why the digest works and these do not. Whoever wants an
 * on-demand pulse should route it through that, not through here.
 */
export async function GET(request: NextRequest) {
    const result = await validateSession();
    if ("error" in result) return result.error;
    const { apiKey, account } = result;

    const type = request.nextUrl.searchParams.get("type") ?? "snapshot";

    if (type === "stored") {
        const digests = await listDigests(account.clerkUserId, 7);
        return NextResponse.json({
            type,
            digests,
            // An empty list is the normal first-morning state, not a failure.
            // Said explicitly so the page can tell "nothing yet" apart from
            // "something broke" without guessing from an empty array.
            note:
                digests.length === 0
                    ? "No digest has been generated yet. The cron runs at 09:00 UTC."
                    : null,
        });
    }

    let prompt: string;
    switch (type) {
        case "alerts":
            prompt =
                "List all active health alerts. For each alert include: type, severity, description, evidence, and recommendation. If no alerts are active, say so.";
            break;
        case "quick":
            prompt =
                "Quick community health check — how are things right now compared to your recent baseline? Keep it to 3-4 sentences.";
            break;
        case "snapshot":
        default:
            prompt =
                "Generate a full health snapshot. Include: overall health score (0-100), core metrics (active members, message volume, sentiment, flag rate, new members, retention), trend comparisons to previous period, channel health breakdown, risk signals, positive signals, and recommendations. Format with clear section headers.";
            break;
    }

    const { data, error } = await queryDashboard(
        apiKey,
        VIGIL_ALIASES.MIRA,
        prompt
    );

    if (error) {
        return NextResponse.json(
            { error: `Mira unavailable: ${error}` },
            { status: 503 }
        );
    }

    return NextResponse.json({
        type,
        report: data,
        generatedAt: new Date().toISOString(),
    });
}
