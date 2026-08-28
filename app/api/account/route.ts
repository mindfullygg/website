import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccount } from "@/lib/account";
import type { VigilName } from "@/types";

const VIGIL_ROLES: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

/**
 * GET /api/account
 *
 * Connection status for the signed-in creator — whether they've connected a
 * Builder API key and finished assigning all 5 Vigil roles. Drives the
 * dashboard's setup gating.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const account = await getAccount(userId);
    if (!account) {
        return NextResponse.json({ connected: false });
    }

    const roleMapComplete = VIGIL_ROLES.every((role) => !!account.roleMap[role]);

    return NextResponse.json({
        connected: true,
        humanId: account.humanId,
        roleMap: account.roleMap,
        roleMapComplete,
        connectedAt: account.connectedAt,
    });
}
