import { NextRequest, NextResponse } from "next/server";
import { handleCreatorOverride } from "@/lib/orchestrator";
import { validateSession } from "@/lib/dashboard";
import { getAccountByCommunity } from "@/lib/account";
import { getEscalation, resolveEscalation } from "@/lib/escalations";
import { getAdapter } from "@/lib/adapters";
import type {
    EscalationPacket,
    EscalationStatus,
    ModerationAction,
} from "@/types";

/**
 * POST /api/orchestrator/override
 *
 * Resolve a queued escalation. The request carries only the decision — every
 * fact about the message itself is read from the stored packet, so the swarm
 * learns from what actually happened rather than from whatever the client
 * chose to send. This used to accept `originalMessage`, `originalAuthor` and
 * `originalChannel` from the body, unverified, and feed them straight into the
 * learning loop.
 *
 * Triggers the learning loop:
 *   1. Kira learns from the override (adjusts thresholds)
 *   2. Sage updates norms (if the override reveals a boundary)
 *   3. Vera adjusts trust score (if the original action was wrong)
 *
 * Body:
 *   {
 *     escalationId: string
 *     decision: "approve" | "override_safe" | "override_action" | "dismiss"
 *     reasoning?: string          — why; optional but valuable for learning
 *     action?: ModerationAction   — none | warn | mute
 *     muteDuration?: number       — minutes, if action is mute
 *   }
 */

type Decision = "approve" | "override_safe" | "override_action" | "dismiss";

interface OverrideRequest {
    escalationId: string;
    decision: Decision;
    reasoning?: string;
    action?: ModerationAction;
    muteDuration?: number;
}

const DECISION_STATUS: Record<Decision, Exclude<EscalationStatus, "pending">> = {
    approve: "approved",
    override_safe: "overridden",
    override_action: "overridden",
    dismiss: "dismissed",
};

export async function POST(request: NextRequest) {
    try {
        let body: OverrideRequest;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body." },
                { status: 400 }
            );
        }

        const { escalationId, decision, muteDuration } = body;
        const reasoning = body.reasoning ?? "";
        const action: ModerationAction = body.action ?? "none";

        if (!escalationId || !decision || !(decision in DECISION_STATUS)) {
            return NextResponse.json(
                { error: "escalationId and a valid decision are required." },
                { status: 400 }
            );
        }

        const session = await validateSession();
        if ("error" in session) return session.error;
        const { account, apiKey } = session;

        // Read before claiming, so "gone" and "already resolved" are distinct.
        const existing = await getEscalation(escalationId);
        if (!existing) {
            return NextResponse.json(
                { error: "That escalation no longer exists." },
                { status: 404 }
            );
        }
        if (existing.clerkUserId !== account.clerkUserId) {
            return NextResponse.json({ error: "Not yours." }, { status: 403 });
        }

        // The claim. Exactly one caller wins; a second click loses here rather
        // than running the learning loop twice or firing two mutes.
        const packet = await resolveEscalation(account.clerkUserId, escalationId, {
            status: DECISION_STATUS[decision],
            creatorDecision: decision,
            creatorReasoning: reasoning,
            actionTaken: action === "none" ? null : action,
        });

        if (!packet) {
            return NextResponse.json(
                { error: "That escalation was already resolved." },
                { status: 409 }
            );
        }

        // `packet` is the pre-redaction copy — the stored one no longer has
        // the message text. Everything below reads from it, never from `body`.

        let learningTriggered = true;
        try {
            await handleCreatorOverride(
                apiKey,
                escalationId,
                mapDecisionText(decision, action, reasoning),
                reasoning || "No reasoning provided",
                packet.messageContent ?? "(message no longer available)",
                packet.channel,
                packet.authorDisplayName,
                account.clerkUserId
            );
        } catch (err) {
            // The decision is already committed and the queue item consumed;
            // failing the request would tell the creator to retry something
            // that cannot be retried. Report it instead.
            learningTriggered = false;
            console.error(`Learning loop failed for ${escalationId}:`, err);
        }

        const actionExecuted = await executeAction(packet, action, muteDuration);

        return NextResponse.json({
            escalationId,
            decision,
            action,
            actionExecuted,
            learningTriggered,
            agentsUpdated: learningTriggered ? ["kira", "sage", "vera"] : [],
            message: buildResponseMessage(decision, action, actionExecuted),
        });
    } catch (error) {
        console.error("Creator override error:", error);
        return NextResponse.json(
            { error: "Failed to process override" },
            { status: 500 }
        );
    }
}

/**
 * Apply the creator's action on the platform.
 *
 * Re-checks community ownership at execution time: the packet proves who owned
 * the community when the message was flagged, not who owns it now. A community
 * unbound or rebound since then must not be acted on.
 */
async function executeAction(
    packet: EscalationPacket,
    action: ModerationAction,
    muteDuration?: number
): Promise<boolean> {
    if (action !== "warn" && action !== "mute") return false;

    const binding = await getAccountByCommunity(packet.communityId);
    if (!binding || binding.account.clerkUserId !== packet.clerkUserId) {
        console.warn(
            `Override execution skipped: ${packet.clerkUserId} no longer owns ${packet.communityId}`
        );
        return false;
    }

    const adapter = getAdapter(packet.platform);
    if (!adapter) {
        console.error(
            `No adapter for ${packet.platform} — is its bot token set in this environment?`
        );
        return false;
    }

    try {
        if (action === "warn") {
            await adapter.sendWarning(
                packet.communityId,
                packet.authorId,
                `Your message in #${packet.channel} has been reviewed by a moderator. ${packet.creatorReasoning || "Please review the community guidelines."}`,
                packet.channelId
            );
        } else {
            await adapter.muteUser(
                packet.communityId,
                packet.authorId,
                (muteDuration ?? 10) * 60
            );
        }
        return true;
    } catch (err) {
        console.error(`Failed to execute ${action} on ${packet.platform}:`, err);
        return false;
    }
}

function mapDecisionText(
    decision: Decision,
    action: ModerationAction,
    reasoning: string
): string {
    switch (decision) {
        case "approve":
            return `Creator approved Kira's original decision. No changes needed.`;

        case "override_safe":
            return `Creator overrode — this message is acceptable. No action needed. The original escalation was a false positive.`;

        case "override_action":
            return `Creator overrode — action required: ${action}. ${reasoning || ""}`.trim();

        case "dismiss":
            return `Creator dismissed this escalation without action. Not enough context to decide.`;
    }
}

function buildResponseMessage(
    decision: Decision,
    action: ModerationAction,
    actionExecuted: boolean
): string {
    switch (decision) {
        case "approve":
            return "Kira's decision approved. All agents updated — Kira's confidence for similar cases will increase.";

        case "override_safe":
            return "Overridden as safe. All agents updated — Kira will be less strict on similar messages, Sage will adjust norms.";

        case "override_action":
            if (actionExecuted) {
                return `Action executed: ${action}. All agents updated — Kira will catch similar messages next time.`;
            }
            return `Override recorded but the action could not be executed on the platform. Agents still updated.`;

        case "dismiss":
            return "Escalation dismissed. Agents notified — no threshold changes.";
    }
}
