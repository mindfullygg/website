// ============================================================
// mindfully.gg — the daily health digest store
//
// Exists because the digest had no reader. `generateHealthDigest` spent five
// Vigil calls per creator per day, returned a string to the Vercel cron, and
// cron discards response bodies. Nothing wrote it anywhere and
// /dashboard/health rendered mock data. So the platform paid for a report
// every morning and threw it away.
//
// Two things this buys, and the second is the one that is easy to miss:
//
//   1. A creator can read yesterday's digest.
//   2. The *previous* digest can be fed into the next prompt, which is the only
//      honest way this role can compare periods. Its published Skill forbids
//      citing a figure it did not read — a remembered number is an invented one
//      — so cross-period comparison has to arrive as text in the prompt or not
//      happen at all. See skills/health-pulse/learnings.md §12.
// ============================================================

import { keys, redis } from "@/lib/kv";

/**
 * How many digests to keep. Thirty days of daily runs, so a creator can look
 * back over a month and the comparison always has yesterday to hand.
 */
const DIGEST_LIMIT = 30;

/**
 * Thirty days, matching the pending-escalation window rather than the lifetime
 * counters.
 *
 * This is a retention decision, not cache hygiene. A digest is meant to hold
 * aggregates — "22 active members, 2 warnings" — but it is prose written by a
 * model summarising four other models, and nothing structurally prevents a
 * sentence naming somebody. Given that, it gets the same bounded window as the
 * other keys that might carry member detail, and the list key itself carries
 * the TTL because Redis list entries have no individual expiry.
 *
 * Refreshed on every write, so an active creator keeps a rolling month and a
 * dormant one expires entirely.
 */
const DIGEST_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface StoredDigest {
    /** The report as the Vigil returned it — raw, still HTML.
     *
     *  Deliberately not normalised here. `toPlainText` runs at the display
     *  boundary, and storing the normalised form would mean a future consumer
     *  with different needs (a parser, an export) could never recover what was
     *  actually said. Normalise on the way to a screen, not on the way to disk. */
    report: string;
    /** ISO 8601, set when the digest was generated. */
    generatedAt: string;
}

/** Upstash parses JSON strings back into objects on read; accept both. */
function parse(entry: unknown): StoredDigest | null {
    if (entry && typeof entry === "object" && "report" in entry) {
        return entry as StoredDigest;
    }
    if (typeof entry !== "string") return null;
    try {
        return JSON.parse(entry) as StoredDigest;
    } catch {
        return null;
    }
}

/**
 * Record a digest for one creator.
 *
 * Awaited, unlike the metrics writes. Those are cosmetic and deliberately
 * never block a moderation call; this one *is* the product of the work just
 * paid for, and silently losing it puts us back where we started.
 */
export async function saveDigest(
    clerkUserId: string,
    report: string,
    generatedAt = new Date().toISOString()
): Promise<void> {
    const key = keys.healthDigests(clerkUserId);
    const entry: StoredDigest = { report, generatedAt };

    await redis()
        .pipeline()
        .lpush(key, JSON.stringify(entry))
        .ltrim(key, 0, DIGEST_LIMIT - 1)
        .expire(key, DIGEST_TTL_SECONDS)
        .exec();
}

/**
 * Recent digests, newest first. Empty when a creator has never had one — which
 * is every creator on their first morning, and is not an error.
 */
export async function listDigests(
    clerkUserId: string,
    limit = DIGEST_LIMIT
): Promise<StoredDigest[]> {
    const raw = await redis().lrange<unknown>(
        keys.healthDigests(clerkUserId),
        0,
        Math.max(0, limit - 1)
    );
    return raw.map(parse).filter((d): d is StoredDigest => d !== null);
}

/** The most recent digest, or null. */
export async function latestDigest(
    clerkUserId: string
): Promise<StoredDigest | null> {
    const [first] = await listDigests(clerkUserId, 1);
    return first ?? null;
}

/**
 * Purge a creator's digests. Called on account deletion alongside the other
 * per-creator keys — a bounded TTL is not an answer to an erasure request.
 */
export async function purgeDigests(clerkUserId: string): Promise<void> {
    await redis().del(keys.healthDigests(clerkUserId));
}
