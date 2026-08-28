import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccount, getApiKeyForAccount, setRoleMap } from "@/lib/account";
import { getCreatorClient, provisionSwarm, verifySwarm } from "@/lib/minds-client";
import type { RoleMap, VigilName } from "@/types";

const VIGIL_ROLES: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

/**
 * Vercel's default function timeout is seconds; this route needs minutes.
 *
 * `provisionSwarm` creates five conversations and `verifySwarm` then pings all
 * five and waits for replies. Those are brand-new conversations, and a Mind
 * answering into a fresh one was measured at **150s** — there is nothing to
 * batch it with, so it waits for a cycle of its own. The five run in parallel,
 * so the wall clock is one slow reply, not five.
 *
 * This is the route where a creator first meets the product, and it worked
 * perfectly under `next dev` while being impossible in production. 300s is the
 * Vercel Pro ceiling for a serverless function.
 */
export const maxDuration = 300;

/**
 * POST /api/account/roles
 *
 * Assign each of the 5 Vigil roles to one of the creator's Minds, then
 * provision: wire conversations, equip Skills (placeholder-tolerant), and
 * verify the swarm responds. Idempotent — re-running re-provisions.
 *
 * Body: { roleMap: { vera, sage, kira, mira, nova } → mindId }
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const account = await getAccount(userId);
    if (!account) {
        return NextResponse.json(
            { error: "No swarm connected. Connect your Builder API key first." },
            { status: 409 }
        );
    }

    let body: { roleMap?: Record<string, unknown> };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const input = body.roleMap;
    if (!input || typeof input !== "object") {
        return NextResponse.json({ error: "Missing roleMap." }, { status: 400 });
    }

    // Every role must be assigned a non-empty string id.
    const missing = VIGIL_ROLES.filter(
        (role) => typeof input[role] !== "string" || !(input[role] as string)
    );
    if (missing.length > 0) {
        return NextResponse.json(
            { error: `Assign a Mind to: ${missing.join(", ")}` },
            { status: 400 }
        );
    }

    const assigned = VIGIL_ROLES.map((role) => input[role] as string);

    // A Mind can only hold one role.
    if (new Set(assigned).size !== assigned.length) {
        return NextResponse.json(
            { error: "Each role needs a distinct Mind." },
            { status: 400 }
        );
    }

    const apiKey = await getApiKeyForAccount(account);
    const client = await getCreatorClient(apiKey);

    // Every assigned Mind must actually belong to this account.
    let owned: Set<string>;
    try {
        const minds = await client.listMinds();
        owned = new Set(minds.map((m) => m.mindId));
    } catch (err) {
        console.error("Roles: listMinds failed", err);
        return NextResponse.json(
            { error: "Could not verify your Minds. Check your API key." },
            { status: 502 }
        );
    }

    const foreign = VIGIL_ROLES.filter((role) => !owned.has(input[role] as string));
    if (foreign.length > 0) {
        return NextResponse.json(
            {
                error: `These Minds aren't in your account: ${foreign
                    .map((role) => input[role])
                    .join(", ")}`,
            },
            { status: 400 }
        );
    }

    const roleMap: RoleMap = {};
    for (const role of VIGIL_ROLES) {
        roleMap[role] = input[role] as string;
    }

    await setRoleMap(userId, roleMap);

    const provision = await provisionSwarm(apiKey, roleMap);
    const swarm = await verifySwarm(apiKey);

    return NextResponse.json({ roleMap, provision, swarm });
}
