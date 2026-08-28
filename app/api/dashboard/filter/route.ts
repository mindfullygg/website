import { NextResponse } from "next/server";
import { getFilterMetrics } from "@/lib/pre-filter";

/**
 * GET /api/dashboard/filter
 *
 * Returns pre-filter performance metrics.
 * Shows how many messages were caught locally vs sent to the swarm.
 * Useful for the swarm monitor page and for Mira's health reports.
 */
export async function GET() {
    const metrics = getFilterMetrics();

    return NextResponse.json({
        ...metrics,
        cognitionSaved: {
            messagesSkipped: metrics.passed,
            estimatedTokensSaved: metrics.passed * 3700,
            estimatedTokensUsed: metrics.flagged * 3700,
            savingsPercent: metrics.passRate,
        },
        note: "Each flagged message costs ~3,700 tokens (Vera + Sage + Kira chain). Passed messages cost 0 tokens.",
    });
}
