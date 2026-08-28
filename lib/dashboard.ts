// ============================================================
// mindfully.gg — Dashboard Route Helpers
// Shared session validation + agent query patterns for dashboard
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccount, getApiKeyForAccount } from "@/lib/account";
import { getCreatorClient, queryVigil, verifySwarm } from "@/lib/minds-client";
import { redis } from "@/lib/kv";
import { VIGILS, type VigilAlias, type VigilName } from "@/types";

/**
 * Resolve the signed-in creator's account for a dashboard API route.
 *
 * Identity comes from Clerk (the route is protected by proxy.ts, so a valid
 * session cookie is already present). We then load the account keyed by the
 * Clerk userId. Returns `{ account, apiKey }` on success, or `{ error }` with
 * a ready-to-return response:
 *   - 401 if not signed in (should not happen behind the proxy gate)
 *   - 409 if signed in but no Builder API key connected yet
 */
export async function validateSession() {
    const { userId } = await auth();

    if (!userId) {
        return {
            error: NextResponse.json(
                { error: "Not signed in." },
                { status: 401 }
            ),
        };
    }

    const account = await getAccount(userId);
    if (!account) {
        return {
            error: NextResponse.json(
                {
                    error:
                        "No swarm connected. Connect your Builder API key in setup.",
                },
                { status: 409 }
            ),
        };
    }

    return { account, apiKey: await getApiKeyForAccount(account) };
}

/** Swarm status is pinged (5 live LLM calls) — cache it briefly so a
 *  dashboard refresh doesn't re-spend cognition on every load. */
const SWARM_STATUS_TTL_SECONDS = 60;

/**
 * Verify the swarm, cached per account in Redis for a short window. Cuts the
 * cognition cost of dashboard status polling from 5 LLM calls per load to at
 * most 5 per minute.
 */
export async function cachedVerifySwarm(
    clerkUserId: string,
    apiKey: string
): Promise<Record<VigilName, boolean>> {
    const key = `swarmstatus:${clerkUserId}`;

    const cached = await redis().get<Record<VigilName, boolean>>(key);
    if (cached) return cached;

    const status = await verifySwarm(apiKey);
    await redis().set(key, status, { ex: SWARM_STATUS_TTL_SECONDS });
    return status;
}

/**
 * Per-role vitals: reachable, credits left, cognition spent in the last 24h.
 *
 * **Reads only. Spends nothing.** `cachedVerifySwarm` answers a similar
 * question by sending "Status check" to all five Minds and waiting for replies,
 * which costs cognition on every Mind that is up and a full `VIGIL_TIMEOUT_MS`
 * on every Mind that is not. With four Minds switched off, opening the swarm
 * page hung for minutes and billed the one that answered. A dashboard must not
 * charge you for looking at it.
 *
 * So "online" here means `isEnabled` — switched on, the same thing Settings
 * shows — rather than "answered a ping just now". It is a weaker claim, and it
 * is the one we can make for free. Keep `verifySwarm` for setup, where a real
 * round trip is the point.
 */
export interface RoleVitals {
    online: boolean;
    credits: number | null;
    cognition24h: number | null;
}

export async function readSwarmVitals(
    apiKey: string,
    roleMap: Partial<Record<VigilName, string>>
): Promise<Record<VigilName, RoleVitals>> {
    const client = await getCreatorClient(apiKey);
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

    let enabled = new Map<string, boolean>();
    try {
        const minds = await client.listMinds();
        enabled = new Map(
            minds.map((m: { mindId: string; isEnabled?: boolean }) => [
                m.mindId,
                m.isEnabled ?? true,
            ])
        );
    } catch (err) {
        console.error("Could not list Minds for vitals:", err);
    }

    const roles = Object.keys(VIGILS) as VigilName[];
    const entries = await Promise.all(
        roles.map(async (role): Promise<[VigilName, RoleVitals]> => {
            const mindId = roleMap[role];
            if (!mindId) {
                return [role, { online: false, credits: null, cognition24h: null }];
            }

            // Independently guarded: a usage endpoint that fails must not take
            // the balance down with it, and neither must blank the whole page.
            const [credits, cognition24h] = await Promise.all([
                client
                    .getCognitionBalance(mindId)
                    .then((b: { cognition: number }) => b.cognition)
                    .catch(() => null),
                client
                    .getCognitionUsage(mindId, {
                        interval: "1h",
                        startTime: start.toISOString(),
                        endTime: end.toISOString(),
                    })
                    .then((u: { items?: { value: number }[] }) =>
                        (u.items ?? []).reduce(
                            (sum: number, i: { value: number }) => sum + (i.value ?? 0),
                            0
                        )
                    )
                    .catch(() => null),
            ]);

            return [
                role,
                { online: enabled.get(mindId) ?? false, credits, cognition24h },
            ];
        })
    );

    return Object.fromEntries(entries) as Record<VigilName, RoleVitals>;
}

/**
 * Query a Vigil with a structured prompt and return the raw response.
 * Wraps error handling so dashboard routes stay clean.
 *
 * **Shorter timeout than the message path, on purpose.** `VIGIL_TIMEOUT_MS` is
 * four minutes because a moderation call that times out early costs the whole
 * call and the cognition with it. A person waiting on a button is the opposite
 * trade: a switched-off Mind means the request is never processed at all, and
 * four minutes of a spinner reads as a broken product rather than a slow one.
 * Ninety seconds still clears the measured 45–60s reply cycle with room to
 * spare.
 */
const DASHBOARD_TIMEOUT_MS = 90_000;

export async function queryDashboard(
    apiKey: string,
    alias: VigilAlias,
    prompt: string
): Promise<{ data: string | null; error: string | null }> {
    try {
        const response = await queryVigil(
            apiKey,
            alias,
            prompt,
            DASHBOARD_TIMEOUT_MS
        );
        return { data: response, error: null };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Agent query failed";
        console.error(`Dashboard query failed for ${alias}:`, message);
        return { data: null, error: message };
    }
}
