import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { validateSession, queryDashboard } from "@/lib/dashboard";
import {
    listPending,
    listResolved,
    countPending,
} from "@/lib/escalations";
import { VIGIL_ALIASES } from "@/types";

/** Upper bound on packets per request, whatever `?limit=` asks for. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/dashboard/escalations
 *
 * The queue is read from Redis, not from Kira. Every field the dashboard and
 * the resolve path need is real structured data captured when the escalation
 * was raised, so listing it costs a range read rather than an LLM call with a
 * 30 second timeout.
 *
 *   ?type=pending   — awaiting a creator decision (default), newest first
 *   ?type=history   — resolved escalations. All redacted: no message content.
 *   ?type=count     — pending count only. One ZCARD; use this to poll.
 *   ?type=summary   — Kira's narrative moderation summary (still an LLM call)
 *
 *   ?since=<ms>     — pending only: just what arrived after this timestamp
 *   ?limit=<n>      — pending and history, capped at 100
 *
 * Only `summary` needs the creator's Builder API key. The store reads are keyed
 * on the Clerk user id alone, so they neither load the account nor decrypt
 * anything — the queue stays readable even when the Minds connection is not.
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const type = params.get("type") ?? "pending";

    if (type === "summary") return summary();

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    if (type === "count") {
        return NextResponse.json({
            type,
            count: await countPending(userId),
            generatedAt: new Date().toISOString(),
        });
    }

    const limit = parseLimit(params.get("limit"));

    if (type === "history") {
        const escalations = await listResolved(userId, { limit });
        return NextResponse.json({
            type,
            escalations,
            count: escalations.length,
            generatedAt: new Date().toISOString(),
        });
    }

    // Default: pending.
    const since = params.get("since");
    if (since !== null && !/^\d+$/.test(since)) {
        return NextResponse.json(
            { error: "`since` must be epoch milliseconds." },
            { status: 400 }
        );
    }

    const escalations = await listPending(userId, {
        limit,
        ...(since !== null ? { since: Number(since) } : {}),
    });

    return NextResponse.json({
        type: "pending",
        escalations,
        count: escalations.length,
        // Total pending, which `escalations` may not cover once limited or
        // filtered by `since` — the badge should track this, not the page.
        pendingTotal: await countPending(userId),
        generatedAt: new Date().toISOString(),
    });
}

/**
 * Kira's narrative summary. Deliberately still an LLM call: a written account
 * of trends and repeat offenders is what a language model is actually for. A
 * queue is not.
 */
async function summary() {
    const result = await validateSession();
    if ("error" in result) return result.error;

    const { data, error } = await queryDashboard(
        result.apiKey,
        VIGIL_ALIASES.KIRA,
        "Moderation summary: total messages evaluated, classification breakdown (counts and percentages for CLEAR_SAFE, CLEAR_VIOLATION, AMBIGUOUS, EDGE_CASE), actions taken (warnings, mutes, escalations), creator override rate, accuracy trend, and any notable patterns or repeat offenders."
    );

    if (error) {
        return NextResponse.json(
            { error: `Kira unavailable: ${error}` },
            { status: 503 }
        );
    }

    return NextResponse.json({
        type: "summary",
        data,
        generatedAt: new Date().toISOString(),
    });
}

function parseLimit(raw: string | null): number {
    if (raw === null) return DEFAULT_LIMIT;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}
