import { NextRequest, NextResponse } from "next/server";
import { generateHealthDigest } from "@/lib/orchestrator";
import {
    getAccount,
    getApiKeyForAccount,
    listAccounts,
} from "@/lib/account";
import { requireSecret } from "@/lib/api-guard";
import { latestDigest, saveDigest } from "@/lib/health-digest";

/**
 * Generate one creator's digest and record it.
 *
 * The read-then-write is the whole point of the store: yesterday's report goes
 * into today's prompt so the health role can compare periods from text it was
 * given. It is forbidden from comparing against its own memory — a figure it
 * recalls rather than reads is an invented one — so without this the digest can
 * only ever describe a single day.
 *
 * A failed read is not fatal: no previous report is exactly the first-run case,
 * and the Skill answers it with "no earlier report to compare this to".
 */
async function runDigest(clerkUserId: string, apiKey: string) {
    const previous = await latestDigest(clerkUserId).catch(() => null);
    const report = await generateHealthDigest(apiKey, previous?.report);
    const generatedAt = new Date().toISOString();
    await saveDigest(clerkUserId, report, generatedAt);
    return { report, generatedAt };
}

/**
 * POST /api/orchestrator/digest
 *
 * Triggers a health digest for one or all connected creators.
 * Machine-to-machine — gated on CRON_SECRET (Vercel Cron sends it
 * automatically as the Authorization header).
 *
 * Body (optional):
 *   { clerkUserId?: string }
 *   - If provided: runs digest for that creator only (targeted/admin run)
 *   - If omitted: runs digest for ALL connected creators (cron mode)
 */
export async function POST(request: NextRequest) {
    const unauthorized = requireSecret(request, "CRON_SECRET");
    if (unauthorized) return unauthorized;

    try {
        const body = await request.json().catch(() => ({}));
        const { clerkUserId } = body as { clerkUserId?: string };

        // Single creator digest
        if (clerkUserId) {
            const account = await getAccount(clerkUserId);
            if (!account) {
                return NextResponse.json(
                    { error: "Account not found" },
                    { status: 404 }
                );
            }

            const apiKey = await getApiKeyForAccount(account);
            const { report, generatedAt } = await runDigest(
                account.clerkUserId,
                apiKey
            );

            return NextResponse.json({
                clerkUserId: account.clerkUserId,
                humanId: account.humanId,
                report,
                generatedAt,
            });
        }

        // Cron mode: run digest for all connected creators
        const accounts = await listAccounts();

        if (accounts.length === 0) {
            return NextResponse.json({
                message: "No connected creators. Nothing to digest.",
                results: [],
            });
        }

        const results = await Promise.allSettled(
            accounts.map(async (account) => {
                const apiKey = await getApiKeyForAccount(account);
                const { report } = await runDigest(account.clerkUserId, apiKey);
                return {
                    clerkUserId: account.clerkUserId,
                    humanId: account.humanId,
                    report,
                };
            })
        );

        const successes = results
            .filter((r) => r.status === "fulfilled")
            .map((r) => (r as PromiseFulfilledResult<{
                clerkUserId: string;
                humanId: string;
                report: string;
            }>).value);

        const failures = results
            .filter((r) => r.status === "rejected")
            .map((r, i) => ({
                clerkUserId: accounts[i]?.clerkUserId,
                error: (r as PromiseRejectedResult).reason?.message ?? "Unknown error",
            }));

        return NextResponse.json({
            message: `Digest complete: ${successes.length} succeeded, ${failures.length} failed`,
            generatedAt: new Date().toISOString(),
            successes,
            failures,
        });
    } catch (error) {
        console.error("Health digest error:", error);
        return NextResponse.json(
            { error: "Failed to generate health digest" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/orchestrator/digest
 *
 * Quick health check — how many creators would receive digests. Gated on
 * CRON_SECRET since it exposes the connected-creator count.
 */
export async function GET(request: NextRequest) {
    const unauthorized = requireSecret(request, "CRON_SECRET");
    if (unauthorized) return unauthorized;

    const accounts = await listAccounts();

    return NextResponse.json({
        status: "ready",
        connectedCreators: accounts.length,
        note: "POST to this endpoint to trigger a digest. Set up a Vercel Cron Job for automatic daily/weekly digests.",
    });
}
