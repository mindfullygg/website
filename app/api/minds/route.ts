import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccount, getApiKeyForAccount } from "@/lib/account";
import { getCreatorClient } from "@/lib/minds-client";

/**
 * GET /api/minds
 *
 * List the signed-in creator's Minds (scoped to their Builder API key) so the
 * setup wizard can offer them for role assignment. We never create Minds —
 * the creator makes them on hellominds.ai; we only read + assign.
 */
export async function GET() {
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

    try {
        const apiKey = await getApiKeyForAccount(account);
        const client = await getCreatorClient(apiKey);
        const minds = await client.listMinds();

        // Balances, so setup can say what this swarm will actually buy before a
        // creator commits to an assignment. A plain read — it spends nothing.
        //
        // **Fails soft, per Mind.** A balance that cannot be read comes back as
        // null and the estimate says so, rather than the whole setup page
        // failing because one lookup did. Same principle as `canAfford`: a
        // flaky balance endpoint must never be the reason a creator cannot
        // finish setup.
        const balances = await Promise.all(
            minds.map(async (m) => {
                try {
                    const { cognition } = await client.getCognitionBalance(m.mindId);
                    return cognition;
                } catch {
                    return null;
                }
            })
        );

        return NextResponse.json({
            minds: minds.map((m, i) => ({
                mindId: m.mindId,
                name: m.name ?? null,
                email: m.email ?? null,
                isEnabled: m.isEnabled ?? true,
                cognition: balances[i],
            })),
        });
    } catch (err) {
        console.error("List minds error:", err);
        return NextResponse.json(
            { error: "Could not list your Minds. Check your API key." },
            { status: 502 }
        );
    }
}
