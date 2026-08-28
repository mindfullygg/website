import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    getAccount,
    bindCommunity,
    unbindCommunity,
    listCommunities,
} from "@/lib/account";
import { countForCommunity } from "@/lib/escalations";
import type { Platform } from "@/types";
import {
    MAX_BLOCKED_TERMS,
    MAX_BLOCKED_TERM_LENGTH,
    MAX_CULTURE_NOTES,
    normalizeBlockedTerms,
    normalizeCultureNotes,
    normalizeLanguageTag,
} from "@/lib/validate";

const PLATFORMS: Platform[] = ["discord", "telegram", "slack"];

/** Resolve the signed-in creator's account, or a ready-to-return error. */
async function requireAccount() {
    const { userId } = await auth();
    if (!userId) {
        return {
            error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
        };
    }
    const account = await getAccount(userId);
    if (!account) {
        return {
            error: NextResponse.json(
                { error: "No swarm connected. Connect your Builder API key first." },
                { status: 409 }
            ),
        };
    }
    return { userId };
}

/** GET /api/account/communities — list the account's bound communities. */
/**
 * Attach the escalation count to each community.
 *
 * Removing a community also purges its moderation records, so the Settings page
 * needs the size of that before offering the button. One `SCARD` per community,
 * and a failure degrades to `undefined` rather than failing the list — a count
 * that cannot be read must not stop a creator seeing their communities.
 */
async function withCounts<T extends { communityId: string }>(communities: T[]) {
    return Promise.all(
        communities.map(async (c) => ({
            ...c,
            escalationCount: await countForCommunity(c.communityId).catch(
                () => undefined
            ),
        }))
    );
}

export async function GET() {
    const r = await requireAccount();
    if ("error" in r) return r.error;

    const communities = await withCounts(await listCommunities(r.userId));
    return NextResponse.json({ communities });
}

/**
 * POST /api/account/communities — bind a Discord guild / Telegram chat to the
 * account. Rejected with 409 if another account already owns it.
 * Body: { platform, communityId, language?, blockedTerms?, cultureNotes? }
 *
 * `language` is a BCP-47 tag ("es", "pt-BR"). Optional, but setting it is what
 * turns the swarm's language handling from inference into fact — without it,
 * every role guesses from the incidental language of the culture summary.
 */
export async function POST(request: NextRequest) {
    const r = await requireAccount();
    if ("error" in r) return r.error;

    let body: {
        platform?: unknown;
        communityId?: unknown;
        language?: unknown;
        blockedTerms?: unknown;
        cultureNotes?: unknown;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const platform = body.platform as Platform;
    const communityId = String(body.communityId ?? "").trim();

    if (!PLATFORMS.includes(platform)) {
        return NextResponse.json(
            { error: `Unknown platform. Use one of: ${PLATFORMS.join(", ")}` },
            { status: 400 }
        );
    }
    if (!communityId) {
        return NextResponse.json({ error: "Missing communityId." }, { status: 400 });
    }

    // Reject a malformed tag rather than storing it: this string is
    // interpolated into every prompt for this community.
    const language = normalizeLanguageTag(body.language);
    if (body.language !== undefined && language === null) {
        return NextResponse.json(
            { error: "language must be a BCP-47 tag, e.g. \"es\" or \"pt-BR\"." },
            { status: 400 }
        );
    }

    // Creator-supplied terms. These end up inside a regular expression, so the
    // bounds are enforced here rather than trusted: `normalizeBlockedTerms`
    // rejects an over-long term or an over-long list, and `termMatcher` escapes
    // what survives. `[]` means "cleared"; null means "malformed, reject".
    const blockedTerms = normalizeBlockedTerms(body.blockedTerms);
    if (blockedTerms === null) {
        return NextResponse.json(
            {
                error:
                    `blockedTerms must be up to ${MAX_BLOCKED_TERMS} terms of ` +
                    `${MAX_BLOCKED_TERM_LENGTH} characters or fewer, one per line.`,
            },
            { status: 400 }
        );
    }

    // The creator's description of their community. This one is NOT fenced as
    // untrusted at the prompt boundary — the creator is entitled to instruct
    // their own swarm — so `normalizeCultureNotes` is the only thing between a
    // paste and a prompt. It strips control characters and bidi overrides, and
    // removes anything shaped like an untrusted-input fence. "" is "cleared";
    // null means it exceeded the cap.
    const cultureNotes = normalizeCultureNotes(body.cultureNotes);
    if (cultureNotes === null) {
        return NextResponse.json(
            {
                error: `cultureNotes must be ${MAX_CULTURE_NOTES} characters or fewer.`,
            },
            { status: 400 }
        );
    }

    try {
        await bindCommunity(
            r.userId,
            platform,
            communityId,
            language ?? undefined,
            body.blockedTerms === undefined ? undefined : blockedTerms,
            body.cultureNotes === undefined ? undefined : cultureNotes
        );
    } catch (err) {
        // Anti-hijack: community already owned by another account.
        const message = err instanceof Error ? err.message : "Could not connect community.";
        return NextResponse.json({ error: message }, { status: 409 });
    }

    const communities = await withCounts(await listCommunities(r.userId));
    return NextResponse.json({ communities });
}

/**
 * DELETE /api/account/communities?communityId=... — unbind a community the
 * account owns.
 */
export async function DELETE(request: NextRequest) {
    const r = await requireAccount();
    if ("error" in r) return r.error;

    const communityId = new URL(request.url).searchParams.get("communityId") ?? "";
    if (!communityId) {
        return NextResponse.json({ error: "Missing communityId." }, { status: 400 });
    }

    const owned = await listCommunities(r.userId);
    if (!owned.some((c) => c.communityId === communityId)) {
        return NextResponse.json(
            { error: "That community is not connected to your account." },
            { status: 404 }
        );
    }

    await unbindCommunity(r.userId, communityId);
    const communities = await withCounts(await listCommunities(r.userId));
    return NextResponse.json({ communities });
}
