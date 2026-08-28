// ============================================================
// mindfully.gg — Machine-to-machine route guard
// The orchestrator HTTP routes (message / member-join) and the
// digest cron are called server-to-server, never by a signed-in
// browser, so Clerk doesn't apply. They authenticate with a shared
// secret in the Authorization header instead.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

/**
 * Verify a request carries the expected shared secret as a Bearer token.
 *
 * Returns `null` when authorized, or a 401/500 NextResponse to return
 * directly when it is not. Fails closed: if the secret env var is unset,
 * the route is rejected rather than left open.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
 * when CRON_SECRET is set, so the same check covers cron and manual calls.
 */
export function requireSecret(
    request: NextRequest,
    envVar: "CRON_SECRET" | "ORCHESTRATOR_SECRET"
): NextResponse | null {
    const expected = process.env[envVar];

    if (!expected) {
        console.error(`${envVar} is not set — refusing the request (fail closed).`);
        return NextResponse.json(
            { error: "Server auth not configured" },
            { status: 500 }
        );
    }

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token || !timingSafeEqual(token, expected)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null;
}

/**
 * Constant-time string comparison so a caller can't probe the secret
 * byte-by-byte via response timing. Length mismatch returns early —
 * that only leaks length, which is not sensitive here.
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}
