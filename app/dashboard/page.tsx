import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAccount, listCommunities } from "@/lib/account";
import { KEEPER_ORDER } from "@/lib/keepers";

/**
 * The one door.
 *
 * Every CTA on the marketing site points here — the nav's "Sign in" and the
 * page's "Set up your Keepers" alike — and this decides where the visitor
 * actually belongs. `proxy.ts` has already guaranteed a signed-in creator by
 * the time this runs; what it cannot know is whether that creator has finished
 * setting up.
 *
 * Before this existed, `/dashboard` rendered the overview unconditionally, so a
 * creator who had signed up but never connected a Builder API key landed on a
 * dashboard with nothing behind it — every panel empty, no indication that a
 * setup step was missing.
 *
 * The gate lives on this route rather than in `dashboard/layout.tsx` on
 * purpose: the layout also wraps `/dashboard/setup`, and redirecting an
 * incomplete account from there would loop forever.
 *
 * The three conditions mirror what setup's own checklist tracks, in the order
 * setup asks for them.
 */
export default async function DashboardPage() {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");

    const account = await getAccount(userId);

    // 1. No Builder API key connected — nothing else can exist yet.
    if (!account) redirect("/dashboard/setup");

    // 2. Key connected, but the five roles are not all pointed at a Mind.
    //    `RoleMap` is a Partial, so a half-finished assignment is representable
    //    and has to be checked role by role rather than by counting keys.
    const everyRoleAssigned = KEEPER_ORDER.every((role) => account.roleMap[role]);
    if (!everyRoleAssigned) redirect("/dashboard/setup");

    // 3. Roles assigned, but no Discord or Telegram community bound, so the
    //    Keepers have no room to watch and every panel would read zero.
    const communities = await listCommunities(userId);
    if (communities.length === 0) redirect("/dashboard/setup");

    // Set up, so send them to the work.
    //
    // There is no overview page any more. It held four metric tiles for figures
    // nothing computes — active members, flag rate, retention — and five keeper
    // cards with a hard-coded green "Online" dot and no fetch behind it. Rebuilt
    // as a router, it turned out to be the sidebar again: the same five links,
    // one click further away.
    //
    // Moderation instead, because it is the only page carrying a decision that
    // is waiting on the creator. Everything else reports; the escalation queue
    // asks. This route is where every marketing CTA and the post-setup redirect
    // land, so it should open on the thing with someone's attention owed to it.
    redirect("/dashboard/moderation");
}
