// ============================================================
// mindfully.gg — Escalation store
// The queue of messages Kira handed to a human. Every read here is a
// Redis range read, not an LLM call: the packet holds real structured
// data taken off the platform event, and Vera's/Sage's prose rides
// along as display-only strings.
//
// Retention is inversely tied to sensitivity. A pending packet still
// holds the member's message, so it lives 30 days. On resolve the
// message and the swarm prose are nulled and only the decision record
// survives, which is why that can safely keep for 90.
// ============================================================

import { keys, redis } from "@/lib/kv";
import type {
    EscalationPacket,
    EscalationStatus,
    ModerationAction,
} from "@/types";

/** Pending items still carry message content — keep the window short. */
const PENDING_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Resolved items are redacted, so a longer audit trail costs little. */
const RESOLVED_TTL_SECONDS = 90 * 24 * 60 * 60;
/** How many resolved escalations to keep per account. */
const RESOLVED_MAX = 500;

/**
 * TTL for the index keys, refreshed on every write.
 *
 * The indexes need one for the same reason the packets do. `escalations:member:
 * <communityId>:<authorId>` carries a member's platform id **in the key name**,
 * so an index left behind after its packets expire still records that this
 * person was escalated in this community — outliving the window that is
 * supposed to bound it. `authorId` survives redaction so a member's records can
 * be found and erased; that is scoped to the retention window, not forever.
 *
 * Long enough to outlive anything it points at. A packet created on day 0 can
 * be resolved on day 29, and the resolved copy then lives 90 more days — so an
 * index expiring at 90 would strand ids that still exist. Pending + resolved
 * covers the worst case.
 *
 * Refreshed on write, so an active creator's indexes never expire and a dormant
 * one clears 120 days after its last escalation.
 */
const INDEX_TTL_SECONDS = PENDING_TTL_SECONDS + RESOLVED_TTL_SECONDS;

/** Everything the write site supplies. Lifecycle fields are set here so an
 *  escalation cannot be created in an inconsistent state. */
export type NewEscalation = Omit<
    EscalationPacket,
    | "id"
    | "status"
    | "createdAt"
    | "resolvedAt"
    | "redactedAt"
    | "creatorDecision"
    | "creatorReasoning"
    | "actionTaken"
>;

/** How a creator disposed of an escalation. */
export interface EscalationOutcome {
    status: Exclude<EscalationStatus, "pending">;
    creatorDecision: string;
    creatorReasoning: string;
    actionTaken: ModerationAction | null;
}

// ---- Write ----

/**
 * Store a new escalation and index it four ways: the owner's pending queue,
 * the community (for purge on unbind) and the member (so an erasure request is
 * a set read rather than a scan).
 */
export async function createEscalation(
    input: NewEscalation
): Promise<EscalationPacket> {
    const packet: EscalationPacket = {
        ...input,
        id: crypto.randomUUID(),
        status: "pending",
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        redactedAt: null,
        creatorDecision: null,
        creatorReasoning: null,
        actionTaken: null,
    };

    const pendingKey = keys.escalationsPending(packet.clerkUserId);
    const communityKey = keys.escalationsCommunity(packet.communityId);
    const memberKey = keys.escalationsMember(
        packet.communityId,
        packet.authorId
    );

    await redis()
        .pipeline()
        .set(keys.escalation(packet.id), packet, { ex: PENDING_TTL_SECONDS })
        .zadd(pendingKey, {
            score: Date.parse(packet.createdAt),
            member: packet.id,
        })
        .sadd(communityKey, packet.id)
        .sadd(memberKey, packet.id)
        // Every index gets a TTL, refreshed here on each write. Without this
        // they live forever — and the member index names a real person in its
        // key. See INDEX_TTL_SECONDS.
        .expire(pendingKey, INDEX_TTL_SECONDS)
        .expire(communityKey, INDEX_TTL_SECONDS)
        .expire(memberKey, INDEX_TTL_SECONDS)
        .exec();

    return packet;
}

// ---- Read ----

export async function getEscalation(
    id: string
): Promise<EscalationPacket | null> {
    return (await redis().get<EscalationPacket>(keys.escalation(id))) ?? null;
}

/** Pending count, without reading any packets. Powers the dashboard badge. */
export async function countPending(clerkUserId: string): Promise<number> {
    return redis().zcard(keys.escalationsPending(clerkUserId));
}

/**
 * How many escalation records a community owns.
 *
 * Exists so the Settings page can say what removing a community will actually
 * destroy. `unbindCommunity` calls `purgeForCommunity`, which deletes every
 * packet in this set — so "disconnect" and "delete the moderation history" are
 * the same button, and a creator should be told the size of that before
 * pressing it rather than after.
 *
 * A `SCARD`, so it costs one round trip. The number can slightly over-count:
 * the index holds ids whose packets have already expired under their own TTL,
 * and `purgeForCommunity` sweeps those the same way. Over-stating what is at
 * risk is the safe direction for a confirmation.
 */
export async function countForCommunity(communityId: string): Promise<number> {
    return redis().scard(keys.escalationsCommunity(communityId));
}

/**
 * The moderator's most recent decision, pending or resolved, or null.
 *
 * The only "last action" on this project that is readable after the fact. The
 * trust, culture, health and guide roles are all notified fire-and-forget and
 * their replies are discarded, so nothing anywhere records what they last did —
 * which is why the swarm page shows a real line for this role and nothing for
 * the others rather than five plausible sentences.
 *
 * `reasoning` survives redaction; `messageContent` does not, and is not read
 * here. A one-line summary must not resurrect a member's message.
 */
export async function latestModeration(
    clerkUserId: string
): Promise<{ at: string; channel: string; classification: string; action: string; reasoning: string } | null> {
    const [pending, resolved] = await Promise.all([
        listPending(clerkUserId, { limit: 1 }).catch(() => []),
        listResolved(clerkUserId, { limit: 1 }).catch(() => []),
    ]);

    const newest = [...pending, ...resolved].sort((a, b) =>
        (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt)
    )[0];
    if (!newest) return null;

    return {
        at: newest.resolvedAt ?? newest.createdAt,
        channel: newest.channel,
        classification: newest.classification,
        action: newest.actionTaken ?? newest.suggestedAction,
        reasoning: newest.reasoning,
    };
}

/**
 * The pending queue, newest first.
 *
 * Pass `since` (epoch ms) to get only what arrived after that point — the
 * delta read a poller uses to decide whether anything is new, without paying
 * for the whole queue.
 */
export async function listPending(
    clerkUserId: string,
    opts: { since?: number; limit?: number } = {}
): Promise<EscalationPacket[]> {
    const setKey = keys.escalationsPending(clerkUserId);
    const limit = opts.limit ?? 50;

    const ids =
        opts.since === undefined
            ? await redis().zrange<string[]>(setKey, 0, limit - 1, {
                rev: true,
            })
            : (
                await redis().zrange<string[]>(
                    setKey,
                    `(${opts.since}`,
                    "+inf",
                    { byScore: true }
                )
            )
                .reverse()
                .slice(0, limit);

    return loadAndPrune(ids, setKey);
}

/** Resolved history, newest first. Every packet here is redacted. */
export async function listResolved(
    clerkUserId: string,
    opts: { limit?: number } = {}
): Promise<EscalationPacket[]> {
    const setKey = keys.escalationsResolved(clerkUserId);
    const ids = await redis().zrange<string[]>(setKey, 0, (opts.limit ?? 50) - 1, {
        rev: true,
    });
    return loadAndPrune(ids, setKey);
}

/**
 * Fetch packets for a list of ids, dropping any that have expired and removing
 * their now-dangling ids from the sorted set they came from.
 *
 * A key's TTL does not remove it from the sets that reference it, so rather
 * than run a sweeper we prune opportunistically on read — the same approach
 * `listCommunities` takes with stale bindings.
 */
async function loadAndPrune(
    ids: string[],
    setKey: string
): Promise<EscalationPacket[]> {
    if (ids.length === 0) return [];

    const kv = redis();
    const packets = await kv.mget<(EscalationPacket | null)[]>(
        ...ids.map(keys.escalation)
    );

    const found: EscalationPacket[] = [];
    const stale: string[] = [];
    ids.forEach((id, i) => {
        const packet = packets[i];
        if (packet) found.push(packet);
        else stale.push(id);
    });

    if (stale.length > 0) await kv.zrem(setKey, ...stale);

    return found;
}

// ---- Resolve ----

/**
 * Claim and resolve an escalation.
 *
 * The `ZREM` on the pending set is the claim: exactly one caller can remove a
 * given id, so a double-click or two moderators acting at once cannot both run
 * the learning loop or fire two mutes. Returns `null` when the claim is lost or
 * the packet has gone.
 *
 * Returns the packet **as it was before redaction**, because the caller still
 * needs the message text for the learning loop and the routing fields to
 * execute the platform action. What gets written back is the redacted copy.
 */
export async function resolveEscalation(
    clerkUserId: string,
    id: string,
    outcome: EscalationOutcome
): Promise<EscalationPacket | null> {
    const kv = redis();

    const packet = await getEscalation(id);
    if (!packet || packet.clerkUserId !== clerkUserId) return null;

    const claimed = await kv.zrem(keys.escalationsPending(clerkUserId), id);
    if (claimed !== 1) return null;

    const now = new Date().toISOString();
    const resolved: EscalationPacket = {
        ...packet,
        status: outcome.status,
        creatorDecision: outcome.creatorDecision,
        creatorReasoning: outcome.creatorReasoning,
        actionTaken: outcome.actionTaken,
        resolvedAt: now,
        redactedAt: now,
        // The message was needed to decide, not afterwards.
        messageContent: null,
        veraContext: null,
        sageContext: null,
    };

    const resolvedKey = keys.escalationsResolved(clerkUserId);
    await kv
        .pipeline()
        .set(keys.escalation(id), resolved, { ex: RESOLVED_TTL_SECONDS })
        .zadd(resolvedKey, { score: Date.parse(now), member: id })
        // Keep the newest RESOLVED_MAX; rank 0 is the oldest.
        .zremrangebyrank(resolvedKey, 0, -(RESOLVED_MAX + 1))
        .expire(resolvedKey, INDEX_TTL_SECONDS)
        // Resolving extends the packet's life to 90 days from now, so the
        // community and member indexes have to be extended with it. They were
        // last touched at create; without this they could expire while the id
        // they point at is still stored, and a later purge would miss it.
        .expire(
            keys.escalationsCommunity(packet.communityId),
            INDEX_TTL_SECONDS
        )
        .expire(
            keys.escalationsMember(packet.communityId, packet.authorId),
            INDEX_TTL_SECONDS
        )
        .exec();

    return packet;
}

// ---- Purge ----

/**
 * Delete every escalation for one member of one community.
 *
 * This is the erasure path. It is why `authorId` survives redaction: without a
 * stable identifier there is no way to find a member's records to remove them.
 */
export async function purgeForMember(
    communityId: string,
    authorId: string
): Promise<number> {
    const memberKey = keys.escalationsMember(communityId, authorId);
    const ids = await redis().smembers<string[]>(memberKey);
    if (ids.length === 0) return 0;

    // Skip only the member index — the community index must still have these
    // ids removed, or a later purge of that community would work from a list
    // of packets that no longer exist.
    await deletePackets(ids, [memberKey]);
    // The cached trust reading is member-identifying and keyed the same way, so
    // it goes with them. A purge that left it behind would answer an erasure
    // request incompletely.
    await redis().del(memberKey, keys.memberTrust(communityId, authorId));
    return ids.length;
}

/**
 * Delete every escalation from one community. Called when a community is
 * unbound: its pending items can no longer be resolved anyway, because the
 * override route resolves ownership through `getAccountByCommunity`.
 */
export async function purgeForCommunity(communityId: string): Promise<number> {
    const communityKey = keys.escalationsCommunity(communityId);
    const ids = await redis().smembers<string[]>(communityKey);
    if (ids.length === 0) return 0;

    await deletePackets(ids, [communityKey]);
    await redis().del(communityKey);
    return ids.length;
}

/** Delete every escalation belonging to one account. */
export async function purgeForAccount(clerkUserId: string): Promise<number> {
    const kv = redis();
    const pendingKey = keys.escalationsPending(clerkUserId);
    const resolvedKey = keys.escalationsResolved(clerkUserId);

    const [pending, resolved] = await Promise.all([
        kv.zrange<string[]>(pendingKey, 0, -1),
        kv.zrange<string[]>(resolvedKey, 0, -1),
    ]);

    const ids = [...new Set([...pending, ...resolved])];
    if (ids.length > 0) await deletePackets(ids, [pendingKey, resolvedKey]);

    await kv.del(pendingKey, resolvedKey);
    return ids.length;
}

/**
 * Delete packets and unlink them from every index that might reference them.
 *
 * Packets that have already expired read back as null, so their owner and
 * community are unknown and their index entries cannot be cleaned here. Two
 * things bound that: reads prune dangling ids as they go, and every index key
 * carries INDEX_TTL_SECONDS so one nobody reads again still goes away.
 *
 * That second half used to say the set entries expired with their own keys.
 * They did not — Redis set members have no individual TTL, and nothing set one
 * on the containing keys, so `escalations:member:<community>:<authorId>` lived
 * forever with a real person's id in its name.
 *
 * `skipKeys` holds indexes the caller deletes itself, so we do not spend
 * commands unlinking from something about to be dropped whole. Pass only keys
 * you actually delete — skipping an index you leave behind strands ids in it.
 */
async function deletePackets(
    ids: string[],
    skipKeys: string[]
): Promise<void> {
    const kv = redis();
    const packets = await kv.mget<(EscalationPacket | null)[]>(
        ...ids.map(keys.escalation)
    );

    const owners = new Set<string>();
    const communities = new Map<string, string[]>();
    const members = new Map<string, string[]>();

    for (const packet of packets) {
        if (!packet) continue;
        owners.add(packet.clerkUserId);
        push(communities, keys.escalationsCommunity(packet.communityId), packet.id);
        push(
            members,
            keys.escalationsMember(packet.communityId, packet.authorId),
            packet.id
        );
    }

    const skipped = new Set(skipKeys);

    const pipeline = kv.pipeline();
    pipeline.del(...ids.map(keys.escalation));

    for (const owner of owners) {
        const pendingKey = keys.escalationsPending(owner);
        const resolvedKey = keys.escalationsResolved(owner);
        if (!skipped.has(pendingKey)) pipeline.zrem(pendingKey, ...ids);
        if (!skipped.has(resolvedKey)) pipeline.zrem(resolvedKey, ...ids);
    }
    for (const [key, packetIds] of communities) {
        if (!skipped.has(key)) pipeline.srem(key, ...packetIds);
    }
    for (const [key, packetIds] of members) {
        if (!skipped.has(key)) pipeline.srem(key, ...packetIds);
    }

    await pipeline.exec();
}

function push(map: Map<string, string[]>, key: string, value: string): void {
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
}
