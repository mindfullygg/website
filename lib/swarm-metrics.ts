// ============================================================
// mindfully.gg — Swarm call metrics
// How many times each role was called in the last 24 hours, and how slowly.
//
// SCOPE. What is counted here is what THIS APP asked of a Mind, and nothing
// else. It is not the same quantity as the Mind's cognition spend, which
// `getCognitionUsage` reports and which includes every other source: the
// creator's own conversations with the Mind, building and publishing Skills,
// eval runs, nudges, and the Mind's own scheduled cycles.
//
// The two are routinely far apart — a Mind can burn hundreds of credits on a
// Skill build while this app makes no calls at all. Anything rendering them
// together has to say which is which, or a reader takes the gap for a bug in
// the counter. See the note above the tiles in app/dashboard/swarm/page.tsx.
// ============================================================

import { redis, keys } from "@/lib/kv";
import { VIGIL_ALIASES, type VigilAlias, type VigilName } from "@/types";

/**
 * Hourly buckets, not a running total.
 *
 * "Last 24 hours" has to mean a window that moves. A single all-time counter
 * cannot answer it, and a per-day key answers "today" instead — which reads as
 * a collapse every midnight rather than a quiet night.
 *
 * So one hash per creator per hour, summed over the last 24 on read. Buckets
 * expire on their own, which is also the whole retention story: nothing here
 * outlives the window it describes.
 */
const BUCKET_TTL_SECONDS = 26 * 60 * 60;

/** Alias → role. `VIGIL_ALIASES` maps the other way. */
const ROLE_BY_ALIAS = Object.fromEntries(
    Object.entries(VIGIL_ALIASES).map(([role, alias]) => [
        alias,
        role.toLowerCase() as VigilName,
    ])
) as Record<VigilAlias, VigilName>;

/**
 * What each role was asked to do, by kind.
 *
 * Fixed strings, derived from the role and nothing else. A summary built from
 * the triggering message would put member content in a store with its own
 * lifetime, outside the redaction the escalation packets are subject to.
 */
const ROLE_SUMMARY: Record<
    VigilName,
    { query: string; update: string; learning: string }
> = {
    vera: {
        query: "Trust lookup",
        update: "Trust profile updated",
        learning: "Creator override — trust reconsidered",
    },
    sage: {
        query: "Norms check",
        update: "Norms updated",
        learning: "Creator override — norms refined",
    },
    kira: {
        query: "Moderation decision",
        update: "Decision recorded",
        learning: "Creator override — decision model updated",
    },
    mira: {
        query: "Channel activity",
        update: "Health note recorded",
        learning: "Creator override recorded",
    },
    nova: {
        query: "Welcome drafted",
        update: "Onboarding note recorded",
        learning: "Creator override recorded",
    },
};

/** 31 days: the longest window the dashboard offers, plus a day of slack. */
const DAY_TTL_SECONDS = 31 * 24 * 60 * 60;

function dayStamp(at: Date): string {
    return at.toISOString().slice(0, 10).replace(/-/g, "");
}

function bucketKey(ownerId: string, at: Date): string {
    const stamp = at.toISOString().slice(0, 13).replace(/[-T]/g, "");
    return keys.swarmCalls(ownerId, stamp);
}

export interface RoleMetrics {
    /** Calls in the window. */
    calls: number;
    /** Mean round trip in ms, or null when nothing was recorded. */
    avgMs: number | null;
}

/**
 * Record one Vigil call.
 *
 * **Redis, never a module-level counter.** The bot process and every Vercel
 * function would each keep their own tally, so the dashboard would report
 * whichever slice of traffic happened to land in the process that answered —
 * silently, with no error at the point of the mistake. That is the adapter
 * registry bug in `CLAUDE.md`, and this is exactly the shape that reintroduces
 * it.
 *
 * **Never awaited by callers and never throws.** A metrics write must not add
 * latency to, or be able to fail, a moderation decision. Failures are logged
 * and dropped: an undercount is a cosmetic problem, a broken swarm call is not.
 *
 * `ownerId` is required because aliases are per-creator — every account has a
 * `vera-trust`, so counting by alias alone would merge two communities into one
 * number. Calls made without an owner are simply not counted.
 */
export function recordVigilCall(
    ownerId: string | undefined,
    alias: VigilAlias,
    ms: number,
    kind: "query" | "update" | "learning" = "query"
): void {
    if (!ownerId) return;
    const role = ROLE_BY_ALIAS[alias];
    if (!role) return;

    // The feed rides on the same hook, so a call can never be counted without
    // being shown or shown without being counted. `learning` is a feed
    // distinction, not a different kind of call — it still counts as one.
    recordSwarmEvent(ownerId, {
        from: "orchestrator",
        to: role,
        type: kind,
        summary: `${ROLE_SUMMARY[role][kind]}`,
        duration: Math.max(0, Math.round(ms)),
    });

    const key = bucketKey(ownerId, new Date());
    void redis()
        .pipeline()
        .hincrby(key, `${role}:n`, 1)
        .hincrby(key, `${role}:ms`, Math.max(0, Math.round(ms)))
        .expire(key, BUCKET_TTL_SECONDS)
        .exec()
        .catch((err) => console.error("Failed to record vigil call:", err));
}

/**
 * Calls and mean latency per role over the last 24 hourly buckets.
 *
 * Returns zeroes rather than throwing when nothing has been recorded — a fresh
 * account has no buckets, and that is a legitimate answer, not an error.
 */
export async function readLast24h(
    ownerId: string
): Promise<Record<VigilName, RoleMetrics>> {
    const now = Date.now();
    const hours = Array.from({ length: 24 }, (_, i) =>
        bucketKey(ownerId, new Date(now - i * 60 * 60 * 1000))
    );

    const empty = (): RoleMetrics => ({ calls: 0, avgMs: null });
    const totals: Record<string, { n: number; ms: number }> = {};

    try {
        const pipeline = redis().pipeline();
        for (const key of hours) pipeline.hgetall(key);
        const buckets = (await pipeline.exec()) as (Record<
            string,
            string | number
        > | null)[];

        for (const bucket of buckets) {
            if (!bucket) continue;
            for (const [field, raw] of Object.entries(bucket)) {
                const [role, metric] = field.split(":");
                if (!role || !metric) continue;
                totals[role] ??= { n: 0, ms: 0 };
                const value = Number(raw) || 0;
                if (metric === "n") totals[role].n += value;
                else if (metric === "ms") totals[role].ms += value;
            }
        }
    } catch (err) {
        console.error("Failed to read swarm metrics:", err);
    }

    const out = {} as Record<VigilName, RoleMetrics>;
    for (const role of Object.keys(VIGIL_ALIASES).map(
        (r) => r.toLowerCase() as VigilName
    )) {
        const t = totals[role];
        out[role] = t?.n
            ? { calls: t.n, avgMs: Math.round(t.ms / t.n) }
            : empty();
    }
    return out;
}

// ---- Activity feed ----

/**
 * One thing the swarm did, as it happened.
 *
 * **No member content, ever.** Summaries are built from the role, the event
 * kind and the channel name — never from the message that triggered them. The
 * escalation store redacts `messageContent` on resolve for good reasons, and a
 * feed that quoted it would keep a copy outside that control with a different
 * lifetime. Channel names are community metadata and are safe to show.
 */
export interface SwarmEvent {
    id: string;
    timestamp: string;
    from: string;
    to: string;
    type: "query" | "response" | "update" | "alert" | "action" | "learning";
    summary: string;
    duration?: number;
}

/** Recent activity only. A capped list, so it cannot grow without bound. */
const FEED_LIMIT = 100;

export function recordSwarmEvent(
    ownerId: string | undefined,
    event: Omit<SwarmEvent, "id" | "timestamp">
): void {
    if (!ownerId) return;

    const full: SwarmEvent = {
        ...event,
        id: crypto.randomUUID().slice(0, 8),
        timestamp: new Date().toISOString(),
    };
    const key = keys.swarmFeed(ownerId);

    // Same contract as the counters: never awaited, never throws. A dropped
    // feed entry is cosmetic; a moderation call that failed because a display
    // write failed would not be.
    void redis()
        .pipeline()
        .lpush(key, JSON.stringify(full))
        .ltrim(key, 0, FEED_LIMIT - 1)
        .expire(key, BUCKET_TTL_SECONDS)
        .exec()
        .catch((err) => console.error("Failed to record swarm event:", err));
}

export async function readFeed(
    ownerId: string,
    limit = 40
): Promise<SwarmEvent[]> {
    try {
        const raw = await redis().lrange<string | SwarmEvent>(
            keys.swarmFeed(ownerId),
            0,
            Math.max(0, limit - 1)
        );
        return raw
            .map((entry) => {
                // Upstash parses JSON strings back into objects on read, so
                // accept both rather than assuming one and crashing the feed.
                if (typeof entry !== "string") return entry;
                try {
                    return JSON.parse(entry) as SwarmEvent;
                } catch {
                    return null;
                }
            })
            .filter((e): e is SwarmEvent => !!e && !!e.timestamp);
    } catch (err) {
        console.error("Failed to read swarm feed:", err);
        return [];
    }
}

// ---- Welcomes ----

/**
 * A welcome that actually reached a member.
 *
 * Counted here rather than from the community guide's call count, because those
 * are not the same number: a Vigil can fail and still return a string, and
 * `processNewMember` refuses to send that — so a failed welcome costs a call and
 * welcomes nobody. Recorded only after the adapter returns.
 *
 * Two counters, because they answer different questions. The hourly bucket
 * expires with everything else and gives "last 24h"; the all-time key has no
 * TTL, because "how many people has this swarm welcomed" is the number a
 * creator actually cares about and it should not reset every night.
 *
 * The feed entry carries the channel, never the member. A display name is
 * member-supplied and this store has no redaction path.
 */
export function recordWelcome(
    ownerId: string | undefined,
    channel: string
): void {
    if (!ownerId) return;

    recordSwarmEvent(ownerId, {
        from: "nova",
        to: "orchestrator",
        type: "action",
        summary: channel ? `Welcomed a new member in #${channel}` : "Welcomed a new member",
    });

    const now = new Date();
    const hour = bucketKey(ownerId, now);
    const day = keys.welcomesDay(ownerId, dayStamp(now));

    // Three counters, one pipeline. The hourly bucket gives a 24h window that
    // moves; the daily key gives 7 and 30 days without reading 720 hours; the
    // all-time key never expires.
    void redis()
        .pipeline()
        .hincrby(hour, "welcome:n", 1)
        .expire(hour, BUCKET_TTL_SECONDS)
        .incr(day)
        .expire(day, DAY_TTL_SECONDS)
        .incr(keys.welcomesTotal(ownerId))
        .exec()
        .catch((err) => console.error("Failed to record welcome:", err));
}

export interface WelcomeCounts {
    /** A window that moves by the hour. */
    last24h: number;
    /** Today plus the previous 6 days. Calendar days, not a rolling 168h — day
     *  granularity is what daily buckets can answer, and reading 168 hourly
     *  keys to move the boundary by the hour is not worth the round trips. */
    last7d: number;
    /** Today plus the previous 29, same caveat. */
    last30d: number;
    /** Since the account was created. Never expires. */
    total: number;
}

export async function readWelcomes(ownerId: string): Promise<WelcomeCounts> {
    const now = Date.now();
    const hours = Array.from({ length: 24 }, (_, i) =>
        bucketKey(ownerId, new Date(now - i * 60 * 60 * 1000))
    );
    // One read covers both windows: 7d is the first seven of the same 30 days.
    const days = Array.from({ length: 30 }, (_, i) =>
        keys.welcomesDay(ownerId, dayStamp(new Date(now - i * 24 * 60 * 60 * 1000)))
    );

    try {
        const pipeline = redis().pipeline();
        for (const key of hours) pipeline.hget(key, "welcome:n");
        for (const key of days) pipeline.get(key);
        pipeline.get(keys.welcomesTotal(ownerId));
        const rows = (await pipeline.exec()) as (string | number | null)[];

        const total = Number(rows[rows.length - 1] ?? 0) || 0;
        const num = (v: string | number | null) => Number(v) || 0;
        const last24h = rows.slice(0, 24).reduce<number>((s, v) => s + num(v), 0);
        const dayRows = rows.slice(24, 24 + 30);
        const last7d = dayRows.slice(0, 7).reduce<number>((s, v) => s + num(v), 0);
        const last30d = dayRows.reduce<number>((s, v) => s + num(v), 0);
        return { last24h, last7d, last30d, total };
    } catch (err) {
        console.error("Failed to read welcomes:", err);
        return { last24h: 0, last7d: 0, last30d: 0, total: 0 };
    }
}

