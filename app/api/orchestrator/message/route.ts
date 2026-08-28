import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/adapters";
import { requireSecret } from "@/lib/api-guard";
import { isCommunityMessageEvent } from "@/lib/validate";

/**
 * The longest-running route in the app, and the one that cannot be made to fit.
 *
 * `handleMessage` runs trust → culture → moderator **sequentially**, and each
 * Vigil is given up to `VIGIL_TIMEOUT_MS` (240s). The worst case is therefore
 * ~12 minutes, well past the 300s Vercel Pro ceiling set here. A slow message
 * will be cut off mid-chain in production.
 *
 * That is survivable today because **the bot does not use this route** — it
 * calls `processMessage` in its own long-lived process, where no timeout
 * applies. This exists for other server-to-server callers, and a cut-off here
 * fails safe: nothing is written until the chain completes.
 *
 * The real fix is architectural, not a bigger number: fire-and-forget plus the
 * SSE `subscribeEvents` stream, so nothing waits inside a request at all. See
 * skills/community-guide/critical.md §1.
 */
export const maxDuration = 300;

/**
 * POST /api/orchestrator/message
 *
 * Server-to-server entry point for a community message. Delegates to the same
 * canonical path the bot uses ([processMessage]) — pre-filter → swarm →
 * trust-cache → adapter execution — so HTTP and bot callers behave identically.
 * Gated on ORCHESTRATOR_SECRET.
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

    if (!isCommunityMessageEvent(event)) {
        return NextResponse.json(
            { error: "Invalid message event payload." },
            { status: 400 }
        );
    }

    try {
        const { decision, executed, preFiltered } = await processMessage(event);
        return NextResponse.json({
            classification: decision.classification,
            action: decision.action,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            warningMessage: decision.warningMessage,
            muteDuration: decision.muteDuration,
            executed,
            preFiltered,
        });
    } catch (error) {
        if ((error as Error).message?.includes("No creator connected")) {
            return NextResponse.json(
                { error: "No creator connected for this guild" },
                { status: 404 }
            );
        }
        console.error("Orchestrator message error:", error);
        return NextResponse.json(
            { error: "Failed to process message" },
            { status: 500 }
        );
    }
}
