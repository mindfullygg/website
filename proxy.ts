// ============================================================
// mindfully.gg — Proxy (Next.js 16's renamed Middleware)
// Clerk owns identity + sessions. This gate protects the creator
// dashboard and its APIs; the public marketing site and the
// machine-to-machine orchestrator/cron routes stay open (those are
// guarded by their own shared secrets — see lib/api-guard.ts).
//
// Clerk detects itself at runtime via request headers, not by the
// file name, so exporting it from `proxy.ts` works the same as the
// deprecated `middleware.ts`.
// ============================================================

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that require a signed-in creator. The machine-to-machine
// orchestrator routes (message / member-join / digest) are intentionally
// absent — they authenticate with a shared secret, not a Clerk session.
const isProtectedRoute = createRouteMatcher([
    "/dashboard(.*)",
    "/api/dashboard(.*)",
    "/api/minds(.*)",
    "/api/account(.*)",
    "/api/auth(.*)",
    "/api/orchestrator/override",
]);

export default clerkMiddleware(async (auth, request) => {
    if (isProtectedRoute(request)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        // Skip Next internals and static files unless in search params.
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|map)).*)",
        // Always run for API routes.
        "/(api|trpc)(.*)",
    ],
};
