import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectApiKey } from "@/lib/account";

/**
 * POST /api/auth/connect
 *
 * Connect (or rotate) the signed-in creator's Builder API key. The key is
 * validated against Minds (`listMinds`) and stored AES-256-GCM encrypted,
 * keyed to their Clerk userId. Role assignment and community binding happen
 * in later setup steps.
 *
 * Body: { apiKey: string }
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    let apiKey: unknown;
    try {
        ({ apiKey } = await request.json());
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!apiKey || typeof apiKey !== "string") {
        return NextResponse.json({ error: "Missing apiKey." }, { status: 400 });
    }

    try {
        const account = await connectApiKey(userId, apiKey);
        return NextResponse.json({
            connected: true,
            humanId: account.humanId,
        });
    } catch (err) {
        console.error("Connect error:", err);
        const message = err instanceof Error ? err.message : "Failed to connect.";
        return NextResponse.json(
            { error: `Could not connect your Builder API key. ${message}` },
            { status: 400 }
        );
    }
}
