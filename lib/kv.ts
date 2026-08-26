// ============================================================
// mindfully.gg — Redis (Upstash)
// Shared client plus every key shape the app writes, kept in one
// place so the storage layout stays greppable.
// ============================================================

import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/**
 * Construct the Upstash client lazily. Building this at module scope
 * would fail the Next build on any machine without the env vars set.
 */
export function redis(): Redis {
    if (client) return client;

    // Vercel's Upstash integration injects KV_REST_API_*; a standalone
    // Upstash database gives UPSTASH_REDIS_REST_*. Accept either.
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token =
        process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        throw new Error(
            "Missing Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        );
    }

    client = new Redis({ url, token });
    return client;
}

export const keys = {
    /** Full account record, keyed by Clerk userId. */
    account: (clerkUserId: string) => `account:${clerkUserId}`,
    /** Community → account pointer, so the bot can route by guild/chat id. */
    community: (communityId: string) => `community:${communityId}`,
    /** One hash per creator per hour: swarm call counts and total latency.
     *  `stamp` is YYYYMMDDHH. Expires on its own — see `BUCKET_TTL_SECONDS`. */
    swarmCalls: (clerkUserId: string, stamp: string) =>
        `swarm:calls:${clerkUserId}:${stamp}`,
    /** Capped list of recent swarm activity. Display only, no member content. */
    swarmFeed: (clerkUserId: string) => `swarm:feed:${clerkUserId}`,
    /** Reverse index: the set of community ids an account has bound. */
    accountCommunities: (clerkUserId: string) =>
        `account_communities:${clerkUserId}`,
    /** Set of connected account ids, for listAccounts (digest cron, admin). */
    accountsIndex: "accounts:index",

    // --- Escalations ---
    // One packet per key, plus four indexes over it. Pending and resolved are
    // separate sorted sets so reading the queue is a range read rather than
    // fetching every packet to filter on status. The community and member sets
    // exist for purging: on unbind, and to answer an erasure request without
    // scanning.

    /** The escalation packet itself. TTL'd — see lib/escalations.ts. */
    escalation: (id: string) => `escalation:${id}`,
    /** Awaiting a creator decision. Sorted by creation time (ms). */
    escalationsPending: (clerkUserId: string) =>
        `escalations:pending:${clerkUserId}`,
    /** Decided. Sorted by resolution time (ms), trimmed to a fixed depth. */
    escalationsResolved: (clerkUserId: string) =>
        `escalations:resolved:${clerkUserId}`,
    /** Every escalation id from one community, for purge on unbind. */
    escalationsCommunity: (communityId: string) =>
        `escalations:community:${communityId}`,
    /** Every escalation id for one member of one community, so an erasure
     *  request is a set read instead of a scan. */
    escalationsMember: (communityId: string, authorId: string) =>
        `escalations:member:${communityId}:${authorId}`,
} as const;
