// ============================================================
// mindfully.gg — Minds Client (Model B: per-creator)
// ============================================================

// Type-only import: erased at compile time, so it never triggers module
// resolution. The value is loaded dynamically below — see getCreatorClient.
import type { createMindsClient as CreateMindsClient } from "@animocabrands/minds-client-lib";
import { VIGIL_ALIASES, type RoleMap, type VigilAlias, type VigilName } from "@/types";
import { skillsForRole } from "@/lib/skills-config";
import { recordVigilCall } from "@/lib/swarm-metrics";

type MindsClient = ReturnType<typeof CreateMindsClient>;

// Cache clients per API key to avoid re-creating within a request lifecycle
const clientCache = new Map<string, MindsClient>();

/**
 * Creates (or retrieves cached) a Minds client for a specific creator.
 * Model B: every creator has their own Minds with Vigil Skills equipped.
 * We use THEIR API key, not ours.
 *
 * The SDK is imported on demand rather than at module scope. It is ESM-only —
 * `"type": "module"` with an `exports` map that declares no `require`
 * condition — so a static import makes this module, and everything that pulls
 * it in, unloadable by any CJS-resolving tool. That included `bot/start.ts`,
 * which could not start at all under `npx tsx`. A dynamic import is the
 * supported CJS→ESM interop path and works in both Next and plain Node.
 */
export async function getCreatorClient(
    creatorApiKey: string
): Promise<MindsClient> {
    const cached = clientCache.get(creatorApiKey);
    if (cached) return cached;

    const { createMindsClient } = await import(
        "@animocabrands/minds-client-lib"
    );

    const client = createMindsClient({
        builderApiKey: creatorApiKey,
    });

    clientCache.set(creatorApiKey, client);
    return client;
}

/**
 * How long a Vigil is given to answer.
 *
 * Measured, not guessed, and the number is driven by the worst case rather than
 * the typical one:
 *
 * - An established conversation answers in **30–80s**. Several queued messages
 *   can be handled in one cycle, so throughput is better than latency suggests.
 * - A **brand-new conversation took 150.1s.** There is nothing to batch it with,
 *   so it waits for a cycle of its own.
 *
 * That second case is not an edge case in production: `provisionSwarm` creates
 * five fresh conversations and `verifySwarm` immediately pings all five. At the
 * old 120s default, **every one of those first pings would time out** and a
 * correctly-provisioned swarm would be reported broken to the creator during
 * setup — their first experience of the product.
 *
 * Set generously. A slow answer costs latency; a premature timeout costs the
 * whole call *and* the cognition, which is spent either way.
 */
export const VIGIL_TIMEOUT_MS = 240_000;

/** Returned when the wait elapsed and no reply could be recovered. */
export const VIGIL_TIMED_OUT = "[Agent timed out — no response]";
/** Returned when the call completed but carried no message text. */
export const VIGIL_NO_REPLY = "[No response from agent]";
/** Returned without calling, because the Mind cannot pay for the turn. */
export const VIGIL_NO_COGNITION = "[Agent has no cognition balance]";

/**
 * Aliases known to be out of cognition, with the time we checked.
 *
 * An unfunded Mind does not refuse a message — it accepts it and never answers,
 * so the call costs a full 240s timeout and returns nothing. Three of those in
 * series is what `handleMessage` does, which turns one flagged message into
 * twelve minutes of waiting to reach a moderator that was fine all along.
 *
 * The balance is a free read, so checking is cheap; it is cached because the
 * answer does not change between two messages a second apart, and re-reading it
 * on every call adds a round-trip to the path we are trying to make faster.
 */
const cognitionChecks = new Map<string, { funded: boolean; at: number }>();
const COGNITION_CACHE_MS = 60_000;

/**
 * Can this alias's Mind pay for a turn?
 *
 * Fails **open**: any error resolving the Mind or reading the balance returns
 * true and lets the call proceed. This is an optimisation, not a gate — a
 * flaky balance endpoint must never be the reason moderation stops running.
 *
 * Only a balance at or below zero counts as unfunded. The balance is eventually
 * consistent around a call and drifts either way, but it does not settle
 * negative on its own, so `<= 0` is the one unambiguous reading.
 */
async function canAfford(client: MindsClient, alias: string): Promise<boolean> {
    const cached = cognitionChecks.get(alias);
    if (cached && Date.now() - cached.at < COGNITION_CACHE_MS) {
        return cached.funded;
    }

    try {
        const mindId = await client.getMindIdForAlias(alias);
        if (!mindId) return true;

        const { cognition } = await client.getCognitionBalance(mindId);
        const funded = cognition > 0;
        cognitionChecks.set(alias, { funded, at: Date.now() });
        return funded;
    } catch {
        return true;
    }
}

/**
 * Send a message to a specific Vigil and wait for the reply.
 * Handles the fingerprint → send → wait pattern.
 */
/**
 * Query one Vigil, and record that the call happened.
 *
 * The timing wrapper is separate from the query itself because the body has
 * four return points — timed-out, no-reply, paired-from-history, and the
 * fallback — and a metrics line at each is one refactor away from being three.
 *
 * `ownerId` is optional and only used for metrics: the eval harness and the
 * scripts call this with no account behind them, and an uncounted call is a
 * better outcome than a required argument nobody has.
 */
export async function queryVigil(
    creatorApiKey: string,
    alias: VigilAlias,
    message: string,
    timeoutMs: number = VIGIL_TIMEOUT_MS,
    ownerId?: string
): Promise<string> {
    const startedAt = Date.now();
    const result = await runVigilQuery(creatorApiKey, alias, message, timeoutMs);

    // A Mind skipped for having no cognition was never called. Counting it
    // would inflate the call count and drag the mean towards zero, describing
    // a fast swarm when the truth is a stopped one.
    if (result !== VIGIL_NO_COGNITION) {
        recordVigilCall(ownerId, alias, Date.now() - startedAt, "query");
    }
    return result;
}

async function runVigilQuery(
    creatorApiKey: string,
    alias: VigilAlias,
    message: string,
    timeoutMs: number
): Promise<string> {
    const client = await getCreatorClient(creatorApiKey);

    // An unfunded Mind accepts the message and never answers, so skipping it
    // here converts a 240s dead wait into an immediate, explicit failure. The
    // callers already handle a failed Vigil: the moderator escalates to a human
    // and the welcome is skipped rather than sent broken.
    if (!(await canAfford(client, alias))) {
        console.error(`${alias} has no cognition balance — skipping the call.`);
        return VIGIL_NO_COGNITION;
    }

    // Fingerprint of the last message before ours, so we can tell a new reply
    // from an old one. A conversation with NO history returns `undefined` here,
    // and passing that through as `afterFingerprint` makes waitForReply miss
    // the reply entirely — it times out while the answer sits in the history.
    //
    // That is not just an eval problem: `provisionSwarm` creates fresh
    // conversations, so the FIRST message to every newly set-up Vigil hit this.
    // Omit the key when there is nothing to compare against.
    //
    // It has a second, more important job below: it is the last message that
    // existed BEFORE ours, so whichever side of our message it sits on is the
    // older side. That is how `replyToSentMessage` establishes which neighbour
    // is the reply without assuming the SDK's sort direction.
    const fingerprint = await client.getLatestHistoryFingerprint(alias);

    await client.sendMessage({
        alias,
        messageText: message,
    });

    const response = await client.waitForReply({
        alias,
        timeoutMs,
        sentMessageText: message,
        ...(fingerprint ? { afterFingerprint: fingerprint } : {}),
    });

    // `waitForReply` cannot be trusted to pair a reply with its prompt, even
    // when it reports success. Observed directly: two sequential calls returned
    // byte-identical text 253 chars long, for two different prompts, both
    // reporting no timeout. Whatever it matches on — the fingerprint, the sent
    // text, or neither — it matched the previous call's answer.
    //
    // So its answer is a fallback, and the history is the authority. The extra
    // round-trip costs no cognition and is noise against a 45-120s wait.
    const offered = response.timedOut
        ? undefined
        : response.reply?.messageText ?? undefined;

    const paired = await replyToSentMessage(client, alias, message, fingerprint);
    if (paired) return paired;

    // History could not answer — our message may be outside the window, or the
    // only candidate was one we already returned. Take what we were offered,
    // unless it is something this alias has already handed out.
    if (offered && !isConsumed(alias, offered)) {
        markConsumed(alias, offered);
        return offered;
    }

    // Better to report nothing than to report another call's answer. Both
    // callers treat this as a failure: the moderator escalates to a human and
    // the welcome is skipped, and the eval stops the run after two in a row.
    if (offered) {
        console.error(
            `Discarded a reply for ${alias}: already returned for an earlier call.`
        );
    }
    return response.timedOut ? VIGIL_TIMED_OUT : VIGIL_NO_REPLY;
}

/**
 * Replies already returned for an alias, so one is never handed out twice.
 *
 * Deliberately per-process and deliberately a safety net, not the mechanism —
 * `replyToSentMessage` pairs by the sent message, and that is what makes the
 * pairing correct. This only catches the case where history is ambiguous. In a
 * serverless function the map is empty and nothing is lost: production sends
 * one message per invocation, so there is no sequence to desynchronise.
 */
const consumedReplies = new Map<string, Map<string, true>>();

/** Per alias. A Map is insertion-ordered, which is what bounds it below. */
const CONSUMED_LIMIT = 100;

function markConsumed(alias: string, text: string): void {
    let seen = consumedReplies.get(alias);
    if (!seen) consumedReplies.set(alias, (seen = new Map()));
    seen.set(text, true);

    // The bot process is long-lived, so this cannot grow without bound. Old
    // entries are safe to forget: they guard against a reply being handed out
    // twice within a burst of calls, not for the life of the conversation.
    while (seen.size > CONSUMED_LIMIT) {
        const oldest = seen.keys().next().value;
        if (oldest === undefined) break;
        seen.delete(oldest);
    }
}

function isConsumed(alias: string, text: string): boolean {
    return consumedReplies.get(alias)?.has(text) ?? false;
}

/**
 * Did this reply come back as a failure sentinel rather than an answer?
 *
 * A Vigil can bill an LLM turn and still never reply — observed in testing:
 * a 122s wait, cognition spent, and one row in the conversation. Callers must
 * be able to tell that apart from a real answer, because some of them send the
 * result to a human. `processNewMember` would otherwise DM a new member the
 * literal text "[Agent timed out — no response]" as their welcome.
 */
export function isVigilFailure(reply: string): boolean {
    return (
        reply === VIGIL_TIMED_OUT ||
        reply === VIGIL_NO_REPLY ||
        reply === VIGIL_NO_COGNITION
    );
}

/**
 * The Mind's answer to one specific sent message, recovered from history.
 *
 * Replaces a "newest reply newer than X" scan, which was quietly wrong. On a
 * cycle-based platform a slow answer arrives after the wait elapses, so a run of
 * sequential calls desynchronises: the timed-out call recovers the PREVIOUS
 * answer, and the real one is still sitting there when the NEXT call gives up
 * and takes it. Measured over an eleven-case eval — two calls returned
 * byte-identical text, and two more returned an answer written about a different
 * person entirely. Nothing errored. The results simply were not true.
 *
 * Pairing by the sent message is what makes it correct: find our own message in
 * the history and take the Mind message immediately AFTER it.
 *
 * "After" has to be established, not assumed. The SDK does not document its
 * sort direction, and a wrong guess returns the *previous* answer — failing
 * silently in exactly the way this function exists to prevent. So the direction
 * is derived from `priorFingerprint`, the last message before we sent: whichever
 * side of our message that sits on is the older side, and the reply is on the
 * other one.
 *
 * When the direction cannot be established (a fresh conversation has no prior
 * fingerprint), we accept a neighbour only if exactly one of the two is a Mind
 * message — otherwise there is a real choice to make and no basis for making
 * it, so we decline. `senderType` is normalised by the SDK to 0 or 2 for the
 * Mind and 1 for the human.
 */
export interface HistoryRow {
    fingerprint?: string;
    messageText?: string | null;
    senderType?: number | null;
}

/**
 * Index of the reply to `sentText`, or -1 when it cannot be established.
 *
 * Pure and exported so the pairing rules can be tested without a live Mind —
 * this logic has now been silently wrong twice, and both times the output was
 * plausible enough to be mistaken for a Skill defect.
 */
export function selectReplyIndex(
    rows: HistoryRow[],
    sentText: string,
    priorFingerprint?: string
): number {
    // Our own message. Last match wins: identical prompts are possible, and the
    // most recent one is the call we are waiting on.
    let sentIndex = -1;
    rows.forEach((row, i) => {
        if (row.senderType === 1 && row.messageText === sentText) sentIndex = i;
    });
    if (sentIndex === -1) return -1;

    const isReply = (i: number): boolean =>
        !!rows[i]?.messageText && rows[i].senderType !== 1;

    const priorIndex = priorFingerprint
        ? rows.findIndex((r) => r.fingerprint === priorFingerprint)
        : -1;

    if (priorIndex !== -1 && priorIndex !== sentIndex) {
        // The prior message is older than ours by definition, so the newer side
        // is the opposite one.
        const newer = sentIndex + (priorIndex > sentIndex ? -1 : 1);
        return isReply(newer) ? newer : -1;
    }

    // Direction unknown. Accept a neighbour only when exactly one of the two is
    // a Mind message; otherwise there is a real choice and no basis to make it.
    const before = sentIndex - 1;
    const after = sentIndex + 1;
    if (isReply(before) !== isReply(after)) {
        return isReply(before) ? before : after;
    }
    return -1;
}

async function replyToSentMessage(
    client: MindsClient,
    alias: string,
    sentText: string,
    priorFingerprint?: string
): Promise<string | null> {
    try {
        const history = await client.getHistory(alias, { limit: 50 });
        const rows = (Array.isArray(history) ? history : []) as HistoryRow[];

        const index = selectReplyIndex(rows, sentText, priorFingerprint);
        if (index === -1) return null;

        const text = rows[index].messageText!;
        if (isConsumed(alias, text)) return null;

        markConsumed(alias, text);
        return text;
    } catch (err) {
        console.error(`History recovery failed for ${alias}:`, err);
    }
    return null;
}

/**
 * Send a message to a Vigil without waiting for a reply.
 * Used for fire-and-forget updates (e.g., telling Vera to update a trust score).
 */
export async function notifyVigil(
    creatorApiKey: string,
    alias: VigilAlias,
    message: string,
    ownerId?: string,
    kind: "update" | "learning" = "update"
): Promise<void> {
    const client = await getCreatorClient(creatorApiKey);

    const startedAt = Date.now();
    await client.sendMessage({
        alias,
        messageText: message,
    });
    // Counted, because it is a real call the swarm made — but it only measures
    // the send, since nothing waits for the reply. That makes its latency
    // incomparable with a query's, which is why the dashboard shows one mean
    // per role rather than pretending these are the same kind of number.
    recordVigilCall(ownerId, alias, Date.now() - startedAt, kind);
}

/**
 * Query multiple Vigils in parallel and return all responses.
 */
export async function queryVigilsParallel(
    creatorApiKey: string,
    queries: { alias: VigilAlias; message: string }[],
    timeoutMs: number = VIGIL_TIMEOUT_MS,
    ownerId?: string
): Promise<Record<string, string>> {
    const results = await Promise.allSettled(
        queries.map(async (q) => ({
            alias: q.alias,
            response: await queryVigil(
                creatorApiKey,
                q.alias,
                q.message,
                timeoutMs,
                ownerId
            ),
        }))
    );

    const responses: Record<string, string> = {};
    for (const result of results) {
        if (result.status === "fulfilled") {
            responses[result.value.alias] = result.value.response;
        } else {
            // Log error but don't fail the entire operation
            console.error("Vigil query failed:", result.reason);
        }
    }

    return responses;
}

/** Per-role outcome of provisioning (conversation wiring + Skill equip). */
export interface RoleProvisionResult {
    conversation: boolean;
    /** Skill ids equipped for this role (empty when none are configured yet). */
    skills: string[];
    /** True when no Skills are configured for the role — the equip was skipped. */
    skillsSkipped: boolean;
    error?: string;
}

/**
 * Provision a creator's swarm from their role → Mind assignment:
 *   - wire the conversation for each role's alias → Mind
 *   - equip that role's Vigil Skills (no-op while the Skill catalog is empty)
 *
 * Roles are provisioned in parallel; one role failing does not abort the
 * others (its result carries the error). Called during onboarding setup.
 */
export async function provisionSwarm(
    creatorApiKey: string,
    roleMap: RoleMap
): Promise<Record<string, RoleProvisionResult>> {
    const client = await getCreatorClient(creatorApiKey);
    const roles = Object.keys(roleMap) as VigilName[];

    const settled = await Promise.allSettled(
        roles.map(async (role) => {
            const mindId = roleMap[role];
            if (!mindId) throw new Error(`No Mind assigned to ${role}`);

            const alias =
                VIGIL_ALIASES[role.toUpperCase() as keyof typeof VIGIL_ALIASES];

            await client.ensureConversation(alias, mindId);

            const skillIds = skillsForRole(role);
            if (skillIds.length > 0) {
                await client.equipSkills(mindId, { ids: skillIds });
            }

            return { skillIds };
        })
    );

    const results: Record<string, RoleProvisionResult> = {};
    settled.forEach((r, i) => {
        const role = roles[i];
        if (r.status === "fulfilled") {
            const skillIds = r.value.skillIds;
            results[role] = {
                conversation: true,
                skills: skillIds,
                skillsSkipped: skillIds.length === 0,
            };
        } else {
            results[role] = {
                conversation: false,
                skills: [],
                skillsSkipped: true,
                error:
                    r.reason instanceof Error ? r.reason.message : String(r.reason),
            };
        }
    });

    return results;
}

/**
 * Verify that a creator's swarm is operational by pinging each Vigil.
 * All five are pinged in parallel.
 */
export async function verifySwarm(
    creatorApiKey: string
): Promise<Record<VigilName, boolean>> {
    const names = Object.keys(VIGIL_ALIASES) as (keyof typeof VIGIL_ALIASES)[];

    const entries = await Promise.all(
        names.map(async (name) => {
            const alias = VIGIL_ALIASES[name];
            try {
                const response = await queryVigil(
                    creatorApiKey,
                    alias,
                    "Status check. Respond with your name and role.",
                    VIGIL_TIMEOUT_MS
                );
                return [name.toLowerCase(), !!response] as const;
            } catch {
                return [name.toLowerCase(), false] as const;
            }
        })
    );

    return Object.fromEntries(entries) as Record<VigilName, boolean>;
}
