// ============================================================
// mindfully.gg — Platform Adapter Registry
// Maps community events from any platform to the orchestrator
// ============================================================

import type {
    Platform,
    PlatformAdapter,
    CommunityMessageEvent,
    CommunityMemberJoinEvent,
    ModerationDecision,
} from "@/types";
import {
    handleMessage,
    handleNewMember,
    parseTrustScore,
} from "@/lib/orchestrator";
import { getAccountByCommunity, getApiKeyForAccount } from "@/lib/account";
import {
    preFilterWithMetrics,
    cacheTrustScore,
    invalidateTrustCache,
} from "@/lib/pre-filter";
import { createEscalation } from "@/lib/escalations";
import { sanitizeDisplayName } from "@/lib/validate";
import { isVigilFailure } from "@/lib/minds-client";
import { toPlainText } from "@/lib/normalize";
import { getRestAdapter } from "./rest";
import { recordSwarmEvent, recordWelcome } from "@/lib/swarm-metrics";

/**
 * The outbound adapter for a platform.
 *
 * This used to be a registry populated by `registerAdapter` at bot startup,
 * which meant it was only ever filled in the bot process — every Vercel
 * function saw an empty map and silently skipped every warn and mute. Actions
 * now go over REST, which needs no persistent connection and therefore works
 * the same in both processes. See lib/adapters/rest.ts.
 */
export function getAdapter(platform: Platform): PlatformAdapter | undefined {
    return getRestAdapter(platform);
}

/**
 * A community's creator-supplied blocked terms, cached briefly.
 *
 * Per-process and short-lived on purpose. This is a cache in front of an
 * authoritative Redis value, not state one process holds and another does not —
 * the distinction that matters after the adapter-registry bug. A cold process
 * reads Redis; a warm one reuses the answer for a minute; neither can be wrong
 * for longer than that.
 *
 * Fails **open**: any read error returns an empty list so the built-in rules run
 * alone. A flaky binding read must never stop moderation.
 */
const blockedTermsCache = new Map<
    string,
    { terms: string[]; at: number }
>();
const BLOCKED_TERMS_TTL_MS = 60_000;

async function blockedTermsFor(communityId: string): Promise<string[]> {
    const cached = blockedTermsCache.get(communityId);
    if (cached && Date.now() - cached.at < BLOCKED_TERMS_TTL_MS) {
        return cached.terms;
    }

    try {
        const binding = await getAccountByCommunity(communityId);
        const terms = binding?.blockedTerms ?? [];
        blockedTermsCache.set(communityId, { terms, at: Date.now() });
        return terms;
    } catch (err) {
        console.error(`Could not read blockedTerms for ${communityId}:`, err);
        return [];
    }
}

/**
 * Process a community message:
 *   1. Run pre-filter (local, zero cognition)
 *   2. If passed → skip swarm, return CLEAR_SAFE
 *   3. If flagged → run full Vera → Sage → Kira chain
 *   4. Cache trust score from Vera's response for future pre-filter checks
 *   5. Execute mod action via platform adapter
 */
export async function processMessage(
    inbound: CommunityMessageEvent
): Promise<{ decision: ModerationDecision; executed: boolean; preFiltered: boolean }> {
    // Normalise the member-chosen display name before it can reach a prompt.
    // Done here rather than in each platform adapter because this function is
    // the funnel BOTH the bot adapters and the orchestrator HTTP route pass
    // through — one place, no entry point missed. Message content is left
    // untouched on purpose; see sanitizeDisplayName.
    const event: CommunityMessageEvent = {
        ...inbound,
        displayName: sanitizeDisplayName(inbound.displayName),
    };

    // Step 1: Pre-filter (local, instant, zero cognition)
    //
    // The creator's blocked terms live on the binding, so this needs one Redis
    // read that the pre-filter was deliberately designed to avoid. Cached for a
    // minute: the list changes when a creator edits it, which is rare, and the
    // message rate is everything else. A stale read costs at most 60 seconds of
    // the old list — and failing to read it at all just means the built-in
    // rules run alone, which is what happened before this existed.
    const filterResult = preFilterWithMetrics(event, {
        blockedTerms: await blockedTermsFor(event.communityId),
    });

    if (filterResult.pass) {
        // Message is clearly safe — skip the entire swarm
        console.log(
            `[Pre-filter] PASS: ${event.displayName} in #${event.channel} — ${filterResult.reason}`
        );
        return {
            decision: {
                classification: "CLEAR_SAFE",
                confidence: 1.0,
                action: "none",
                reasoning: `Pre-filtered: ${filterResult.reason}`,
            },
            executed: false,
            preFiltered: true,
        };
    }

    // Step 2: Message flagged — needs swarm evaluation
    console.log(
        `[Pre-filter] FLAG: ${event.displayName} in #${event.channel} — ${filterResult.reason} [${filterResult.flags.join(", ")}]`
    );

    // Find the account that owns this community
    const binding = await getAccountByCommunity(event.communityId);
    if (!binding) {
        throw new Error(`No creator connected for community: ${event.communityId}`);
    }

    const apiKey = await getApiKeyForAccount(binding.account);

    // Step 3: Run full moderation flow: Vera → Sage → Kira → decision
    // The message entering the swarm. The reason the filter flagged it is a
    // property of our rules, not of what the member wrote, so it is safe to
    // show — the message itself never reaches this store.
    recordSwarmEvent(binding.account.clerkUserId, {
        from: event.platform,
        to: "orchestrator",
        type: "query",
        summary: `Message flagged in #${event.channel} — ${filterResult.reason}`,
    });

    const result = await handleMessage(
        apiKey,
        event,
        binding.language,
        binding.cultureNotes,
        binding.account.clerkUserId
    );

    // Step 4: Cache the trust score from the trust keeper's response for
    // future pre-filter checks. Best-effort — null means "not stated", which
    // is not the same as zero.
    const trustScore = parseTrustScore(result.veraContext);
    if (trustScore !== null) {
        cacheTrustScore(event.communityId, event.userId, trustScore);
    }

    // Invalidate cache if a mod action was taken (score will change)
    if (result.decision.action === "warn" || result.decision.action === "mute") {
        invalidateTrustCache(event.communityId, event.userId);
    }

    // Step 5: Queue an escalation for the creator.
    //
    // Deliberately NOT inside the adapter block below. An escalation goes to
    // the dashboard queue, never to the platform, so it needs no adapter — and
    // gating it on one would mean nothing is ever queued in any process that
    // has not registered a bot (which today is every Vercel function).
    //
    // Storage failing must not discard the moderation result: the decision is
    // already made and the caller still needs it, so this logs and continues.
    let executed = false;

    if (result.decision.action === "escalate") {
        try {
            await createEscalation({
                clerkUserId: binding.account.clerkUserId,
                communityId: event.communityId,
                platform: event.platform,
                channelId: event.channelId,
                channel: event.channel,
                authorId: event.userId,
                authorDisplayName: event.displayName,
                messageContent: event.content,
                messageTimestamp: event.timestamp,
                classification: result.decision.classification,
                suggestedAction: result.decision.action,
                confidence: result.decision.confidence,
                reasoning: result.decision.reasoning,
                // Minds return `<p>` and `<br>` whatever the prompt asks, and
                // these two are rendered on the escalation card. The parsers
                // normalise on the way in for the same reason; nothing was
                // doing it for the display-only fields, so the card would have
                // shown the tags. `reasoning` arrives already normalised via
                // `parseKiraDecision`.
                veraContext: toPlainText(result.veraContext),
                sageContext: toPlainText(result.sageContext),
                trustScore,
            });
            executed = true;
            recordSwarmEvent(binding.account.clerkUserId, {
                from: "kira",
                to: "creator",
                type: "alert",
                summary: `Escalated for review in #${event.channel} — ${result.decision.classification}`,
            });
        } catch (err) {
            console.error(
                `Failed to queue escalation for ${event.communityId}:`,
                err
            );
        }
    }

    // Step 6: Execute an on-platform action via the correct adapter.
    const adapter = getAdapter(event.platform);

    if (adapter && (result.decision.action === "warn" || result.decision.action === "mute")) {
        try {
            switch (result.decision.action) {
                case "warn":
                    await adapter.sendWarning(
                        event.communityId,
                        event.userId,
                        result.decision.warningMessage ??
                        `Your message in #${event.channel} has been flagged. Please review the community guidelines.`,
                        event.channelId
                    );
                    executed = true;
                    break;

                case "mute":
                    await adapter.muteUser(
                        event.communityId,
                        event.userId,
                        (result.decision.muteDuration ?? 10) * 60
                    );
                    executed = true;
                    break;
            }
            // Recorded only inside the try, after the adapter returned. A mute
            // that threw must not appear in the feed as one that landed — the
            // dashboard already has one place where a failed mute looks like a
            // resolved case, and this must not become a second.
            recordSwarmEvent(binding.account.clerkUserId, {
                from: "orchestrator",
                to: event.platform,
                type: "action",
                summary: `${result.decision.action} applied in #${event.channel}`,
            });
        } catch (err) {
            console.error(`Failed to execute ${result.decision.action} on ${event.platform}:`, err);
        }
    }

    return { decision: result.decision, executed, preFiltered: false };
}

/**
 * Process a new member join through the welcome flow,
 * then send the welcome via the correct platform adapter.
 */
export async function processNewMember(
    inbound: CommunityMemberJoinEvent
): Promise<{ welcomeMessage: string; sent: boolean }> {
    // See processMessage — same funnel, same reason.
    const event: CommunityMemberJoinEvent = {
        ...inbound,
        displayName: sanitizeDisplayName(inbound.displayName),
    };

    const binding = await getAccountByCommunity(event.communityId);
    if (!binding) {
        throw new Error(`No creator connected for community: ${event.communityId}`);
    }

    const apiKey = await getApiKeyForAccount(binding.account);

    // Run welcome flow: Vera + Sage + Mira → Nova
    const result = await handleNewMember(
        apiKey,
        event,
        binding.language,
        binding.cultureNotes,
        binding.account.clerkUserId
    );

    // Send welcome via the correct platform adapter
    const adapter = getAdapter(event.platform);
    let sent = false;

    // A Vigil can fail and still return a string. Sending that string is worse
    // than sending nothing: the member's first contact with the community would
    // read "[Agent timed out — no response]". Skip the welcome instead.
    if (isVigilFailure(result.welcomeMessage)) {
        console.error(
            `Welcome skipped for ${event.userId} in ${event.communityId}: ${result.welcomeMessage}`
        );
        return { welcomeMessage: result.welcomeMessage, sent: false };
    }

    if (adapter) {
        try {
            await adapter.sendWelcome(
                event.communityId,
                event.userId,
                result.welcomeMessage
            );
            sent = true;
            // Only after the adapter returned. A Vigil can fail and still hand
            // back a string, and the guard above refuses to send that — so a
            // failed welcome costs a call and welcomes nobody. Counting the
            // call would report a welcome that never arrived.
            // A join event carries no channel — a member joins a community,
            // not a room — so the summary reads without one.
            recordWelcome(binding.account.clerkUserId, "");
        } catch (err) {
            console.error(`Failed to send welcome on ${event.platform}:`, err);
        }
    }

    return { welcomeMessage: result.welcomeMessage, sent };
}
