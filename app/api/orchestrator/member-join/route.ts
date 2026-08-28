import { NextRequest, NextResponse } from "next/server";
import { processNewMember } from "@/lib/adapters";
import { requireSecret } from "@/lib/api-guard";
import { isCommunityMemberJoinEvent } from "@/lib/validate";

/**
 * `handleNewMember` queries trust, culture and health in parallel, then the
 * community guide — so two waits in series rather than four. Comfortably inside
 * 300s in practice, though a fresh conversation (~150s each) could approach it.
 *
 * As with the message route, the bot calls `processNewMember` directly and is
 * not subject to this.
 */
export const maxDuration = 300;

/**
 * POST /api/orchestrator/member-join
 *
 * Server-to-server entry point for a new-member join. Delegates to the same
 * path the bot uses ([processNewMember]) so HTTP and bot callers behave
 * identically. Gated on ORCHESTRATOR_SECRET.
 */
export async function POST(request: NextRequest) {
    const unauthorized = requireSecret(request, "ORCHESTRATOR_SECRET");
    if (unauthorized) return unauthorized;

    let event: unknown;
    try {
        event = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!isCommunityMemberJoinEvent(event)) {
        return NextResponse.json(
            { error: "Invalid member-join event payload." },
            { status: 400 }
        );
    }

    try {
        const { welcomeMessage, sent } = await processNewMember(event);
        return NextResponse.json({ welcomeMessage, sent });
    } catch (error) {
        if ((error as Error).message?.includes("No creator connected")) {
            return NextResponse.json(
                { error: "No creator connected for this guild" },
                { status: 404 }
            );
        }
        console.error("Member join error:", error);
        return NextResponse.json(
            { error: "Failed to process new member" },
            { status: 500 }
        );
    }
}
