import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { SpectrumRule } from "@/components/spectrum-rule";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
            {/* Sidebar */}
            <aside className="w-64 border-r border-zinc-800 flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-zinc-800">
                    <Link href="/" className="flex items-center gap-2.5">
                        <BrandMark className="w-[22px] h-[22px]" />
                        <span className="text-xl font-bold tracking-tight">mindfully.gg</span>
                    </Link>
                </div>

                {/* Navigation — a client component, because marking the active
                    route needs the current pathname. */}
                <DashboardNav />

                {/* Account footer.
                    This was a green pulsing dot reading "Swarm active" — with
                    nothing behind it. No code computed that status: it said
                    "active" whether the Minds were on, switched off, out of
                    cognition, or the Builder key had been revoked. A status
                    light that cannot report a problem is worse than none,
                    because it is read as evidence that things are fine.

                    Real state already has honest homes — per-Mind status on
                    /dashboard/swarm and the setup checklist — so the space goes
                    to the control that was missing instead: who you are signed
                    in as, and the way out.

                    The five-hue rule keeps the identity the role dots carried,
                    and unlike them it never claims to mean anything. */}
                <div className="mt-auto">
                    <SpectrumRule />
                    <div className="p-4 flex items-center">
                        {/* Order is pinned with `order-first` / `order-last`
                            rather than by flex direction. Clerk owns the DOM
                            order inside `userButtonBox`, so `flex-row-reverse`
                            only lands avatar-left if their markup happens to put
                            the name first — it does not, and the reverse moved
                            the avatar to the right instead. Explicit order is
                            correct either way, and survives a Clerk markup
                            change. */}
                        {/* Styled as one more sidebar row: same `px-3 py-2.5
                            rounded-lg`, same `gap-3`, and the same resting and
                            hover colours an inactive nav link uses. The avatar's
                            left edge therefore lines up with the nav icons above
                            it. `group` on the trigger is what lets hovering
                            anywhere in the row — avatar included — brighten the
                            name, the way hovering a nav link brightens its
                            label. */}
                        <UserButton
                            showName
                            appearance={{
                                elements: {
                                    // `group` on the outermost wrapper, not on the
                                    // trigger: the element is named *Outer*Identifier
                                    // and Clerk's shipped types do not reveal whether
                                    // it nests inside the trigger. rootBox is an
                                    // ancestor of both either way, so the hover
                                    // reaches the name regardless.
                                    rootBox: "group w-full",
                                    userButtonTrigger:
                                        "w-full rounded-lg px-3 py-2.5 hover:bg-zinc-800/40 transition-colors",
                                    userButtonBox:
                                        "flex-row gap-3 w-full justify-start items-center",
                                    avatarBox: "w-6 h-6 order-first shrink-0",
                                    // Trailing `!` because Clerk ships its own
                                    // stylesheet for this element and its colour
                                    // rule outranks a plain utility class — the
                                    // name rendered, but at Clerk's near-invisible
                                    // default rather than zinc-400. (Tailwind v4
                                    // puts the important modifier at the end;
                                    // a leading `!` is the v3 syntax and is
                                    // silently ignored here.)
                                    userButtonOuterIdentifier:
                                        "order-last text-sm text-zinc-400! group-hover:text-zinc-100! transition-colors truncate",
                                },
                            }}
                        />
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-7xl mx-auto p-8">{children}</div>
            </main>
        </div>
    );
}
