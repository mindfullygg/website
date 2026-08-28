// ============================================================
// mindfully.gg — Escalation store lifecycle check
//
// Exercises lib/escalations.ts against a real Upstash database:
// create → list → delta read → resolve → double-resolve → purge,
// then the lifecycle wiring: unbindCommunity and disconnectAccount
// must take their escalations with them.
//
//   npx tsx --env-file=.env.local scripts/check-escalations.ts
//
// SAFETY: every id this writes is namespaced under `smoke_<runId>` and the
// account id cannot collide with a real Clerk user id (those start `user_2`).
// It purges only what it created, in a finally block, even if a check fails.
// Point it at a scratch database anyway — it prints the host before writing.
// ============================================================

import {
    createEscalation,
    getEscalation,
    listPending,
    listResolved,
    countPending,
    resolveEscalation,
    purgeForMember,
    purgeForCommunity,
    type NewEscalation,
} from "@/lib/escalations";
import {
    bindCommunity,
    unbindCommunity,
    disconnectAccount,
    getAccountByCommunity,
} from "@/lib/account";
import { keys, redis } from "@/lib/kv";

const runId = Math.random().toString(36).slice(2, 8);
const ACCOUNT = `smoke_account_${runId}`;
const COMMUNITY = `smoke_community_${runId}`;
const MEMBER_A = `smoke_member_a_${runId}`;
const MEMBER_B = `smoke_member_b_${runId}`;
const LIFECYCLE = `smoke_lifecycle_${runId}`;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
    if (condition) {
        passed++;
        console.log(`  ok    ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}`);
        if (detail !== undefined) {
            console.log(`        got: ${JSON.stringify(detail)}`);
        }
    }
}

function input(authorId: string, content: string): NewEscalation {
    return {
        clerkUserId: ACCOUNT,
        communityId: COMMUNITY,
        platform: "telegram",
        channelId: COMMUNITY,
        channel: "smoke-test",
        authorId,
        authorDisplayName: `Display ${authorId.slice(-6)}`,
        messageContent: content,
        messageTimestamp: new Date().toISOString(),
        classification: "AMBIGUOUS",
        suggestedAction: "escalate",
        confidence: 0.61,
        reasoning: "Smoke test packet.",
        veraContext: "Trust Score: 38. Watched tier.",
        sageContext: "Borderline against #smoke-test norms.",
        trustScore: 38,
    };
}

/** Distinct sorted-set scores need distinct milliseconds. */
const tick = () => new Promise((r) => setTimeout(r, 5));

async function main(): Promise<void> {
    const url =
        process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
    if (!url) {
        console.error("No Redis URL in the environment. Did you pass --env-file?");
        process.exit(1);
    }
    console.log(`\nDatabase: ${new URL(url).host}`);
    console.log(`Run id:   ${runId}\n`);

    console.log("create + read");
    const first = await createEscalation(input(MEMBER_A, "first message"));
    await tick();
    const second = await createEscalation(input(MEMBER_B, "second message"));
    await tick();
    const third = await createEscalation(input(MEMBER_A, "third message"));

    check("countPending is 3", (await countPending(ACCOUNT)) === 3);

    const pending = await listPending(ACCOUNT);
    check("listPending returns 3", pending.length === 3, pending.length);
    check(
        "listPending is newest first",
        pending[0]?.id === third.id && pending[2]?.id === first.id,
        pending.map((p) => p.messageContent)
    );

    const roundTrip = await getEscalation(first.id);
    check(
        "packet round-trips intact",
        roundTrip?.messageContent === "first message" &&
        roundTrip?.communityId === COMMUNITY &&
        roundTrip?.trustScore === 38 &&
        roundTrip?.status === "pending",
        roundTrip
    );

    console.log("\ndelta read");
    const delta = await listPending(ACCOUNT, {
        since: Date.parse(first.createdAt),
    });
    check(
        "since excludes the packet at that timestamp",
        delta.length === 2 && !delta.some((p) => p.id === first.id),
        delta.map((p) => p.messageContent)
    );

    console.log("\nresolve");
    const claimed = await resolveEscalation(ACCOUNT, second.id, {
        status: "overridden",
        creatorDecision: "override_action",
        creatorReasoning: "Crossed the line.",
        actionTaken: "mute",
    });
    check(
        "resolve returns the packet before redaction",
        claimed?.messageContent === "second message",
        claimed?.messageContent
    );

    const afterResolve = await getEscalation(second.id);
    check(
        "stored copy is redacted",
        afterResolve !== null &&
        afterResolve.messageContent === null &&
        afterResolve.veraContext === null &&
        afterResolve.sageContext === null &&
        afterResolve.redactedAt !== null,
        afterResolve
    );
    check(
        "decision recorded, authorId survives",
        afterResolve?.status === "overridden" &&
        afterResolve?.actionTaken === "mute" &&
        afterResolve?.authorId === MEMBER_B,
        afterResolve
    );

    const again = await resolveEscalation(ACCOUNT, second.id, {
        status: "approved",
        creatorDecision: "approve",
        creatorReasoning: "Second attempt.",
        actionTaken: null,
    });
    check("double resolve is refused", again === null, again);

    const wrongOwner = await resolveEscalation("smoke_account_other", first.id, {
        status: "approved",
        creatorDecision: "approve",
        creatorReasoning: "Not my escalation.",
        actionTaken: null,
    });
    check("resolve by a non-owner is refused", wrongOwner === null, wrongOwner);

    check("countPending is 2", (await countPending(ACCOUNT)) === 2);
    check("listResolved returns 1", (await listResolved(ACCOUNT)).length === 1);

    console.log("\nindex retention");
    // Every index must carry a TTL. Without one they outlive the packets they
    // point at — and the member index has a real member's id in its key name,
    // so an immortal index records that this person was moderated here long
    // after the moderation record itself is gone.
    //
    // -1 is Redis for "no expiry"; -2 is "key does not exist". Both are bugs
    // here, and they were the previous behaviour and a test error respectively.
    const kv = redis();
    const indexes: [string, string][] = [
        ["pending", keys.escalationsPending(ACCOUNT)],
        ["resolved", keys.escalationsResolved(ACCOUNT)],
        ["community", keys.escalationsCommunity(COMMUNITY)],
        ["member", keys.escalationsMember(COMMUNITY, MEMBER_A)],
    ];

    const DAY = 24 * 60 * 60;
    for (const [label, key] of indexes) {
        const ttl = await kv.ttl(key);
        check(
            `${label} index expires (not -1/-2), ~120d`,
            ttl > 119 * DAY && ttl <= 120 * DAY,
            ttl
        );
    }

    // The member index must outlive the resolved packet it points at, or a
    // later purge cannot find the ids it needs to erase.
    check(
        "index TTL exceeds the 90d resolved packet TTL",
        (await kv.ttl(keys.escalationsMember(COMMUNITY, MEMBER_A))) > 90 * DAY
    );

    console.log("\npurge by member");
    const removed = await purgeForMember(COMMUNITY, MEMBER_A);
    check("purgeForMember removed 2", removed === 2, removed);
    check("their packets are gone", (await getEscalation(third.id)) === null);
    check("countPending is 0", (await countPending(ACCOUNT)) === 0);

    // The bug this catches: an earlier version skipped the community index
    // here, stranding ids in it after the packets were deleted.
    const communityIds = await redis().smembers<string[]>(
        keys.escalationsCommunity(COMMUNITY)
    );
    check(
        "community index no longer references purged packets",
        !communityIds.includes(first.id) && !communityIds.includes(third.id),
        communityIds
    );

    console.log("\nlifecycle: unbind a community");
    // A second community so this cannot disturb the assertions above.
    await createEscalation({ ...input(MEMBER_A, "in lifecycle community"), communityId: LIFECYCLE, channelId: LIFECYCLE });
    await bindCommunity(ACCOUNT, "telegram", LIFECYCLE);
    check(
        "binding exists before unbind",
        (await getAccountByCommunity(LIFECYCLE)) !== null ||
        (await redis().get(keys.community(LIFECYCLE))) !== null
    );

    await unbindCommunity(ACCOUNT, LIFECYCLE);
    check(
        "unbind purged that community's escalations",
        (await redis().smembers<string[]>(keys.escalationsCommunity(LIFECYCLE)))
            .length === 0
    );
    check(
        "unbind removed the binding",
        (await redis().get(keys.community(LIFECYCLE))) === null
    );

    console.log("\nlifecycle: disconnect the account");
    await createEscalation({ ...input(MEMBER_B, "before disconnect"), communityId: LIFECYCLE, channelId: LIFECYCLE });
    await bindCommunity(ACCOUNT, "telegram", LIFECYCLE);
    await disconnectAccount(ACCOUNT);
    check(
        "disconnect purged pending",
        (await countPending(ACCOUNT)) === 0
    );
    check(
        "disconnect purged the community index",
        (await redis().smembers<string[]>(keys.escalationsCommunity(LIFECYCLE)))
            .length === 0
    );

    console.log("\npurge by community");
    await purgeForCommunity(COMMUNITY);
    check("listResolved is empty", (await listResolved(ACCOUNT)).length === 0);
    check(
        "community index is gone",
        (await redis().smembers<string[]>(keys.escalationsCommunity(COMMUNITY)))
            .length === 0
    );
    check(
        "member indexes are gone",
        (
            await redis().smembers<string[]>(
                keys.escalationsMember(COMMUNITY, MEMBER_B)
            )
        ).length === 0
    );
}

async function cleanup(): Promise<void> {
    try {
        await purgeForCommunity(COMMUNITY);
        await purgeForCommunity(LIFECYCLE);
        await redis().del(
            keys.community(LIFECYCLE),
            keys.accountCommunities(ACCOUNT),
            keys.account(ACCOUNT),
            keys.escalationsCommunity(LIFECYCLE),
        );
        await redis().srem(keys.accountsIndex, ACCOUNT);
        await redis().del(
            keys.escalationsPending(ACCOUNT),
            keys.escalationsResolved(ACCOUNT),
            keys.escalationsMember(COMMUNITY, MEMBER_A),
            keys.escalationsMember(COMMUNITY, MEMBER_B)
        );
    } catch (err) {
        console.error("Cleanup failed — check for leftover smoke_ keys:", err);
    }
}

main()
    .catch((err) => {
        failed++;
        console.error("\nThrew:", err);
    })
    .finally(async () => {
        await cleanup();
        console.log(`\n${passed} passed, ${failed} failed\n`);
        process.exit(failed === 0 ? 0 : 1);
    });
