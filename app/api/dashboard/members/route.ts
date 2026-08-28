import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { validateSession, queryDashboard } from "@/lib/dashboard";
import { listPending, listResolved } from "@/lib/escalations";
import { parseTrustScore } from "@/lib/orchestrator";
import { toPlainText } from "@/lib/normalize";
import { VIGIL_ALIASES, type EscalationPacket } from "@/types";
import { redis, keys } from "@/lib/kv";

/** How long a creator-requested trust reading is kept. See `keys.memberTrust`. */
const TRUST_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

interface CachedTrust {
    score: number | null;
    note: string;
    askedAt: string;
}

/**
 * GET  /api/dashboard/members  — members this app has actually seen
 * POST /api/dashboard/members  — ask the trust keeper for one member's score
 *
 * **There is no member table, and there should not be one.** Trust profiles
 * live in the trust keeper's own memory, on the creator's key — that is the
 * point of the architecture, not a gap in it. And the only member-identifying
 * store on this side is the escalation index, which exists so an erasure
 * request can find someone's records rather than to build a roster from.
 *
 * So this endpoint reports what the app can honestly account for: members who
 * were flagged at least once. It cannot see the quiet majority, and building a
 * view that could would mean logging every message — which is exactly what the
 * retention design refuses to do.
 *
 * The listed score is the one **recorded on the escalation**, not a live
 * reading. `trustScore` survives redaction, so it costs a range read rather
 * than a call, and opening this page spends no cognition. Asking for a fresh
 * one is a POST, on click, one member at a time.
 */

const MAX_MEMBERS = 100;

export interface MemberRow {
    authorId: string;
    displayName: string;
    /** Escalations raised against this member, pending and resolved. */
    flags: number;
    /** Score recorded when the most recent escalation was raised. Null when the
     *  trust keeper's prose did not carry a parseable one — never read a null
     *  here as zero. */
    trustScore: number | null;
    /** When that score was recorded, so the age of the reading is visible. */
    trustScoreAt: string | null;
    /** True when the score came from a creator asking, rather than from the
     *  reading taken when the escalation was raised. */
    trustAsked: boolean;
    /** The keeper's prose from that request, when there is one. */
    trustNote: string | null;
    communityId: string;
    /** Most recent flagged message from this member, by platform timestamp. */
    lastSeen: string;
    /** What happened to the most recent escalation. */
    lastOutcome: string;
    channel: string;
}

function outcomeOf(p: EscalationPacket): string {
    if (p.status === "pending") return "awaiting review";
    if (p.creatorDecision) return p.creatorDecision;
    if (p.actionTaken) return p.actionTaken;
    return p.status;
}

export async function GET() {
    const result = await validateSession();
    if ("error" in result) return result.error;

    const [pending, resolved] = await Promise.all([
        listPending(result.account.clerkUserId, { limit: MAX_MEMBERS }),
        listResolved(result.account.clerkUserId, { limit: MAX_MEMBERS }),
    ]);

    // Newest first, so the first packet seen for a member is the most recent
    // one and later packets only add to the count.
    const all = [...pending, ...resolved].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );

    const byMember = new Map<string, MemberRow>();

    for (const p of all) {
        const existing = byMember.get(p.authorId);
        if (existing) {
            existing.flags += 1;
            // An older packet may carry a score when the newest does not.
            if (existing.trustScore === null && p.trustScore !== null) {
                existing.trustScore = p.trustScore;
                existing.trustScoreAt = p.createdAt;
            }
            continue;
        }

        byMember.set(p.authorId, {
            authorId: p.authorId,
            displayName: p.authorDisplayName,
            flags: 1,
            trustScore: p.trustScore,
            trustScoreAt: p.trustScore === null ? null : p.createdAt,
            trustAsked: false,
            trustNote: null,
            communityId: p.communityId,
            lastSeen: p.messageTimestamp ?? p.createdAt,
            lastOutcome: outcomeOf(p),
            channel: p.channel,
        });
    }

    // Overlay any reading the creator asked for. It is newer than the one taken
    // when the escalation was raised, by definition, and it is why the page
    // survives a refresh — the alternative was losing it to React state and
    // showing "never recorded" for a member who had just been looked up.
    const rows = [...byMember.values()];
    const cached = await Promise.all(
        rows.map((r) =>
            redis().get<CachedTrust>(keys.memberTrust(r.communityId, r.authorId))
        )
    );
    rows.forEach((r, i) => {
        const hit = cached[i];
        if (!hit) return;
        r.trustScore = hit.score;
        r.trustScoreAt = hit.askedAt;
        r.trustAsked = true;
        r.trustNote = hit.note;
    });

    return NextResponse.json({
        members: rows,
        note: "Members the app has seen — those flagged at least once. Trust profiles live in the keeper's memory, not here.",
        checkedAt: new Date().toISOString(),
    });
}

/**
 * Ask the trust keeper for a live score.
 *
 * On click, never on load. `cachedVerifySwarm` learned this the hard way: a
 * page that queries Minds when it opens bills the creator for looking at their
 * own dashboard, and blocks for the full timeout on every Mind that is off.
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const result = await validateSession();
    if ("error" in result) return result.error;

    const body = await request.json().catch(() => ({}));
    const { authorId, displayName, communityId } = body as {
        authorId?: string;
        displayName?: string;
        communityId?: string;
    };

    if (!authorId) {
        return NextResponse.json({ error: "authorId required" }, { status: 400 });
    }

    // Every request carries the time it was asked, for two reasons that both
    // bit us.
    //
    // A Mind deduplicates: told three identical status pings in a row, Vera
    // answered once and said so. A byte-identical lookup is a question it has
    // already answered, so it does not answer again — and the client, finding
    // nothing paired to our message in history, falls back to the newest
    // message there and hands back somebody else's reply. The guard against
    // serving the same text twice is per-process, which is empty on every
    // serverless invocation.
    //
    // Saying where the question came from is also just honest: this one is a
    // person clicking a button, not orchestrator traffic.
    const askedAt = new Date().toISOString();

    const { data, error } = await queryDashboard(
        result.apiKey,
        VIGIL_ALIASES.VERA,
        `Member lookup: ${authorId}${displayName ? ` (${displayName})` : ""}

Provide trust score, history summary, and risk assessment.
State the score on its own line, in the form "Trust Score: 55", using a whole
number from 0 to 100.

Asked from the creator's dashboard at ${askedAt}.`
    );

    if (error || !data) {
        return NextResponse.json(
            { error: `Trust keeper unavailable: ${error ?? "no reply"}` },
            { status: 503 }
        );
    }

    // Null means the prose carried no parseable score, which is not zero. The
    // caller shows the note either way.
    //
    // `toPlainText` on the note because Minds return `<p>` and `<br>` whatever
    // the prompt says — the card would otherwise render the tags. Parsing runs
    // on the raw string; `parseTrustScore` normalises internally.
    // A reply that mentions neither the member nor a score is almost certainly
    // not the answer to this question — the platform pairs replies loosely and
    // a stale one from another call lands here otherwise. Better to say nothing
    // came back than to show a creator an answer to a question nobody asked.
    // A Mind sometimes emits backslash-escaped quotes in prose — `(\"Ivan
    // Molto\")` — which render literally. Unescaped here rather than in
    // `toPlainText`, because that runs on the moderation path where the
    // parsers depend on it and this is a display-only concern.
    const plain = toPlainText(data).replace(/\\(["'])/g, "$1");
    const looksLikeOurs =
        plain.includes(authorId) ||
        (displayName ? plain.includes(displayName) : false) ||
        /trust\s*score/i.test(plain);

    if (!looksLikeOurs) {
        return NextResponse.json(
            {
                error: "The trust keeper replied, but to a different question — its last answer was still queued. Try again in a moment.",
            },
            { status: 409 }
        );
    }

    const score = parseTrustScore(data);

    // Cached so a refresh does not lose it and does not re-bill a call. Keyed
    // by community + author so `purgeForMember` erases it with everything else.
    // The community comes from the row the button sits on; without it the
    // reading is still returned, just not remembered.
    if (communityId) {
        await redis().set(
            keys.memberTrust(communityId, authorId),
            { score, note: plain, askedAt } satisfies CachedTrust,
            { ex: TRUST_CACHE_TTL_SECONDS }
        );
    }

    return NextResponse.json({
        authorId,
        trustScore: score,
        note: plain,
        askedAt,
    });
}
