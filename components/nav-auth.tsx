"use client";

import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";
import { PRIMARY_CTA_HREF } from "@/components/site-chrome";

/**
 * The right-hand end of the marketing nav, which depends on who is looking.
 *
 * Signed out, the pair is correct and both halves are needed: "Sign in" is for a
 * creator who set up weeks ago, "Connect your Minds" for one who has not. Signed
 * in, both were wrong — the nav was static, so a creator with a live dashboard
 * was still being invited to sign in and to connect Minds they had connected
 * already.
 *
 * **A client component on purpose.** Clerk Core 3 replaced `<SignedIn>` /
 * `<SignedOut>` with `<Show when="signed-in">`, but the App Router's `<Show>` is
 * an async *server* component: it reads auth off the request, which opts the
 * whole route out of static rendering. `/` and `/keepers` are marketing pages
 * and should stay prerendered (`○` in the build output), so the branch happens
 * here, after hydration, instead.
 *
 * The cost of that choice is a moment before `isLoaded`. It is spent on a
 * reserved blank rather than on a guess — rendering the signed-out pair first
 * would flash the wrong nav at every returning creator, which is the bug this
 * component exists to fix.
 */
/**
 * The two treatments the right-hand end uses, and why they differ.
 *
 * The deciding factor is what anchors the bar. Signed out, this end holds one
 * control and nothing else — a plain link leaves the nav visibly lopsided
 * against the wordmark, so `Sign in` takes the pill. Signed in, the avatar is
 * the anchor, so `Dashboard` can sit quiet as one more chrome link beside the
 * centre nav.
 *
 * So it is one treatment per state rather than one per label: whichever element
 * is carrying the weight gets it.
 */
const NAV_LINK = "text-base text-zinc-400 hover:text-zinc-100 transition-colors";

/** Matches `PrimaryButton`, at nav scale. */
const NAV_PILL =
    "px-5 py-2 rounded-full text-base font-medium bg-zinc-100 text-zinc-900 hover:bg-white transition-colors";

export function NavAuth() {
    const { isLoaded, isSignedIn } = useAuth();

    // Held blank, not guessed. The parent reserves the width, so nothing moves
    // when the real state arrives.
    if (!isLoaded) {
        return <span className="h-9 block" aria-hidden />;
    }

    if (isSignedIn) {
        return (
            <>
                <Link href="/dashboard" className={NAV_LINK}>
                    Dashboard
                </Link>
                <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
            </>
        );
    }

    // One control, and it says "Sign in" rather than repeating the page's CTA.
    // The nav serves people who already have an account; the hero, the timeline
    // band and the closing panel serve everyone else. Same destination either
    // way — `/dashboard` routes by how far along you are — so the two labels are
    // not two paths, they are the same path named for who is reading it.
    return (
        <Link href={PRIMARY_CTA_HREF} className={NAV_PILL}>
            Sign in
        </Link>
    );
}
