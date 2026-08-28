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
    /** Welcomes delivered, all time. Deliberately no TTL — unlike the hourly
     *  buckets, this is a lifetime figure a creator watches grow. */
    welcomesTotal: (clerkUserId: string) => `swarm:welcomes:${clerkUserId}`,
    /** Welcomes delivered on one day. `day` is YYYYMMDD. Expires at 31 days,
     *  which is the longest window the page offers plus a day of slack. An
     *  aggregate count, so nothing here identifies a member. */
    welcomesDay: (clerkUserId: string, day: string) =>
        `swarm:welcomes:${clerkUserId}:${day}`,
    /** The last trust reading a creator asked for about one member, so the
     *  Members page survives a refresh without re-billing a call.
     *
     *  Member-identifying, and keyed by community + author precisely so
     *  `purgeForMember` can erase it alongside the escalations. Expires at 30
     *  days — the shortest window any member data here gets. It is a
     *  convenience cache, not a record: the authoritative profile lives in the
     *  trust keeper's memory and cannot be reached from this side at all. */
    memberTrust: (communityId: string, authorId: string) =>
        `member:trust:${communityId}:${authorId}`,
    /** Reverse index: the set of community ids an account has bound. */
    accountCommunities: (clerkUserId: string) =>
        `account_communities:${clerkUserId}`,
    /** Set of connected account ids, for listAccounts (digest cron, admin). */
    accountsIndex: "accounts:index",

    /** Recent daily health digests for one creator, newest first.
     *
     *  A capped list rather than a single latest-only key, because the second
     *  entry is load bearing: it is fed back into the next digest prompt so the
     *  health role can compare periods from what it was *given* rather than
     *  from memory. Its Skill forbids recalling a figure it did not read.
     *
     *  Vigil prose, so treat it as it were member-adjacent even though it
     *  should only ever hold aggregates — it is a language model summarising
     *  four other language models, and nothing guarantees it never names
     *  someone. TTL'd accordingly; see DIGEST_TTL_SECONDS. */
    healthDigests: (clerkUserId: string) => `health:digests:${clerkUserId}`,

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
