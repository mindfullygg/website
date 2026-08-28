import { NextRequest, NextResponse } from "next/server";
import { validateSession, readSwarmVitals } from "@/lib/dashboard";
import { queryVigilsParallel } from "@/lib/minds-client";
import { VIGIL_ALIASES, VIGILS, type VigilName } from "@/types";
import { readFeed, readLast24h } from "@/lib/swarm-metrics";

const vigilNames: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

/**
 * Pings all five Vigils in parallel, so the wall clock is the slowest reply —
 * 30–80s on an established conversation. See app/api/account/roles/route.ts
 * for why 300 rather than something tighter.
 */
export const maxDuration = 300;

/**
 * GET /api/dashboard/swarm
 *
 * Returns swarm operational status — all 5 agents' status and recent activity.
 * Query params:
 *   ?type=status    — online/offline status for each Vigil (default)
 *   ?type=activity  — recent inter-agent activity feed
 *   ?type=full      — status + activity + performance summary from Mira
 */
export async function GET(request: NextRequest) {
    const result = await validateSession();
    if ("error" in result) return result.error;
    const { account, apiKey } = result;

    const type = request.nextUrl.searchParams.get("type") ?? "status";

    // The feed alone: one Redis read, no Minds API calls, no cognition. This is
    // what the "Live" badge polls, and it is only affordable because it does
    // not drag the vitals along with it.
    if (type === "feed") {
        return NextResponse.json({
            feed: await readFeed(account.clerkUserId),
            checkedAt: new Date().toISOString(),
        });
    }

    if (type === "status" || type === "full") {
        // Read-only vitals rather than a ping. `cachedVerifySwarm` messages all
        // five Minds and waits — it spends cognition on the ones that are up
        // and blocks for the full timeout on the ones that are not, so simply
        // opening this page cost credits and hung. See `readSwarmVitals`.
        const vitals = await readSwarmVitals(apiKey, account.roleMap ?? {});

        const agents = vigilNames.map((name) => ({
            name,
            role: VIGILS[name].role,
            tagline: VIGILS[name].tagline,
            color: VIGILS[name].color,
            textColor: VIGILS[name].textColor,
            icon: VIGILS[name].icon,
            online: vitals[name].online,
            credits: vitals[name].credits,
            cognition24h: vitals[name].cognition24h,
        }));

        const allOnline = agents.every((a) => a.online);

        if (type === "status") {
            // Metrics ride along with status: both are cheap Redis/API reads,
            // and the page needs them together. Neither spends cognition.
            // No `lastModeration`. The agent cards used to carry a "last
            // action" line — sample text for four roles, and the moderator's
            // real decision read from the escalation store. All five are gone:
            // one true line in the same slot as four invented ones does not
            // read as the true one, and the dimming that separated them is a
            // detail nobody scanning five cards will weigh.
            //
            // This was `latestModeration`'s only caller, so that export in
            // lib/escalations.ts now has none. Left in place rather than
            // deleted: a decision history is a real thing to show, and the
            // Moderation page is where it belongs, with room to say when and in
            // which channel rather than one truncated line.
            const [metrics, feed] = await Promise.all([
                readLast24h(account.clerkUserId),
                readFeed(account.clerkUserId),
            ]);
            return NextResponse.json({
                swarmHealthy: allOnline,
                agents,
                metrics,
                feed,
                window: "24h",
                checkedAt: new Date().toISOString(),
            });
        }

        // Full mode: also get Mira's swarm performance assessment
        const responses = await queryVigilsParallel(apiKey, [
            {
                alias: VIGIL_ALIASES.MIRA,
                message:
                    "How are the other Vigils performing? Assess each sister's performance based on the data you have. Is the swarm healthy?",
            },
            {
                alias: VIGIL_ALIASES.KIRA,
                message:
                    "Quick summary: how many incidents have you handled? What's your override rate?",
            },
        ]);

        return NextResponse.json({
            swarmHealthy: allOnline,
            agents,
            miraAssessment: responses[VIGIL_ALIASES.MIRA] ?? null,
            kiraStats: responses[VIGIL_ALIASES.KIRA] ?? null,
            checkedAt: new Date().toISOString(),
        });
    }

    if (type === "activity") {
        // Query each agent for their most recent action
        const responses = await queryVigilsParallel(apiKey, [
            {
                alias: VIGIL_ALIASES.VERA,
                message:
                    "What was the last thing you did? One sentence summary of your most recent action.",
            },
            {
                alias: VIGIL_ALIASES.SAGE,
                message:
                    "What was the last thing you learned? One sentence summary of your most recent cultural observation.",
            },
            {
                alias: VIGIL_ALIASES.KIRA,
                message:
                    "What was your most recent moderation decision? One sentence summary.",
            },
            {
                alias: VIGIL_ALIASES.MIRA,
                message:
                    "What was your most recent health observation? One sentence summary.",
            },
            {
                alias: VIGIL_ALIASES.NOVA,
                message:
                    "Who was the last member you welcomed? One sentence summary.",
            },
        ]);

        const activity = vigilNames.map((name) => {
            const alias =
                VIGIL_ALIASES[name.toUpperCase() as keyof typeof VIGIL_ALIASES];
            return {
                agent: name,
                displayName: VIGILS[name].displayName,
                color: VIGILS[name].color,
                lastAction: responses[alias] ?? "No response",
            };
        });

        return NextResponse.json({
            activity,
            queriedAt: new Date().toISOString(),
        });
    }

    return NextResponse.json(
        { error: "Invalid type. Use: status, activity, or full" },
        { status: 400 }
    );
}
