import { NextRequest, NextResponse } from "next/server";
import { validateSession, queryDashboard } from "@/lib/dashboard";
import { VIGIL_ALIASES } from "@/types";
import { readWelcomes } from "@/lib/swarm-metrics";

/**
 * GET /api/dashboard/onboarding
 *
 * Returns Nova's onboarding data for the retention funnel.
 * Query params:
 *   ?type=report     — full onboarding report with approach comparison (default)
 *   ?type=recent     — recently welcomed members and their status
 *   ?type=faq        — most common questions from new members
 */
export async function GET(request: NextRequest) {
    const result = await validateSession();
    if ("error" in result) return result.error;
    const { apiKey } = result;

    const type = request.nextUrl.searchParams.get("type") ?? "report";

    // Measured, not asked for. The community guide is told when someone joins
    // and nothing afterwards, so retention and approach performance could only
    // ever be invented — see community-guide/learnings.md §7. What it delivered
    // is countable, and is counted at the point of delivery.
    if (type === "welcomes") {
        return NextResponse.json(await readWelcomes(result.account.clerkUserId));
    }

    let prompt: string;
    switch (type) {
        case "recent":
            prompt =
                "List all recently welcomed members. For each include: display name, join date, which welcome approach was used, channels recommended, whether they're still active (day 1, day 7, day 30 if available), and current engagement level (lurker/occasional/active/power-user).";
            break;
        case "faq":
            prompt =
                "What are the most common questions new members ask? List them in order of frequency, with how many times each was asked. Also note what these questions tell you about the community — are there clarity gaps or missing resources?";
            break;
        case "report":
        default:
            prompt =
                "Provide your full onboarding report. Include: total members welcomed, day 1 retention rate, day 7 retention rate, day 30 retention rate (if data exists), approach performance comparison table (each approach with times used and retention rates), drop-off analysis (where people leave), best performing approach, worst performing approach, and recommendations for improvement.";
            break;
    }

    const { data, error } = await queryDashboard(
        apiKey,
        VIGIL_ALIASES.NOVA,
        prompt
    );

    if (error) {
        return NextResponse.json(
            { error: `Nova unavailable: ${error}` },
            { status: 503 }
        );
    }

    return NextResponse.json({
        type,
        data,
        generatedAt: new Date().toISOString(),
    });
}
