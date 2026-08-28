"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Network,
    Plug,
    Settings,
    type LucideIcon,
} from "lucide-react";
import { VIGILS, type VigilName } from "@/types";
import { VIGIL_ICONS } from "@/components/vigils";

interface NavItem {
    href: string;
    label: string;
    /** For pages with no role behind them. Role pages use `VIGIL_ICONS`. */
    icon?: LucideIcon;
    vigil?: VigilName;
}

/**
 * Two groups, because two of these pages are a different kind of thing.
 *
 * Everything under "Platform" is where a creator works day to day. "Setup" is
 * run once: it connects a Builder key, assigns the five roles and provisions —
 * which spends cognition, pings all five Minds and waits for replies.
 *
 * They were a flat list of eight, so `Setup` sat beside `Culture` looking like
 * another place to visit. It is not, and treating it as one had a real cost: a
 * creator returning to the dashboard was landed on the provisioning step, where
 * the only obvious action was to run it again for nothing.
 *
 * The Platform entry for the community guide is "Welcomes", not "Onboarding".
 * Both pages had that label and they mean opposite things: one is about members
 * being welcomed into a community, the other about a creator setting the swarm
 * up. Two identical labels pointing at different destinations is a nav bug, and
 * it only appeared once "Setup" was renamed.
 */
const navGroups: { label: string; items: NavItem[] }[] = [
    {
        label: "Platform",
        items: [
            // No "Overview". That page held metrics nothing computes and a
            // hard-coded online dot; rebuilt as a router it was this list again,
            // one click further away. `/dashboard` now redirects to Moderation,
            // so a nav item for it would highlight Moderation while reading
            // "Overview".
            //
            // Ordered by how often each demands attention: act, then read,
            // then look up, then configure, then diagnose. Not by role order
            // (vera, sage, kira, mira, nova), which would sort the sidebar by
            // our architecture rather than by the creator's day.
            //
            // Moderation leads because it is the only page carrying a decision
            // waiting on a person — everything else reports, the queue asks —
            // and because `/dashboard` lands there, so the page a creator is
            // dropped on is also the one their eye starts at.
            //
            // Culture sits low on frequency, not importance: `cultureNotes` is
            // the only unbiased input the swarm gets, and a culture role told
            // nothing about the community generalises from flagged messages
            // alone. It is set once, so the place to surface it is setup, not a
            // higher nav slot.
            { href: "/dashboard/moderation", label: "Moderation", vigil: "kira" },
            { href: "/dashboard/health", label: "Health Pulse", vigil: "mira" },
            { href: "/dashboard/members", label: "Members", vigil: "vera" },
            { href: "/dashboard/onboarding", label: "Welcomes", vigil: "nova" },
            { href: "/dashboard/culture", label: "Culture", vigil: "sage" },
            { href: "/dashboard/swarm", label: "Swarm", icon: Network },
            { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ],
    },
    {
        label: "Setup",
        items: [{ href: "/dashboard/setup", label: "Onboarding", icon: Plug }],
    },
];

/**
 * Colour marks the page you are on, and nothing else.
 *
 * Every role icon used to carry its own colour at all times, so five different
 * hues sat in the sidebar permanently and none of them meant anything — colour
 * was decoration, and the active row was signalled only by a faint background.
 *
 * Now an inactive row is entirely grey, icon and label together, and the active
 * one takes the role's colour across both. The palette still ties each section
 * to its role; it just says something when it appears.
 *
 * Lucide icons inherit `currentColor`, so the icon follows the row's colour
 * with no separate rule — which is what makes "same colour as the text" true by
 * construction rather than by two values kept in step.
 */
/**
 * The active colour for a page with no Vigil behind it.
 *
 * Deliberately achromatic. The five role colours mean "a Vigil is responsible
 * for this page"; Swarm, Settings and Onboarding have none, so a
 * shared sixth colour would imply a sixth role that does not exist.
 *
 * It is also the only safe choice left. Measured against the five role hues,
 * orange sits 18° from the moderator and blue 20° from the trust keeper, and
 * the two remaining clear hues already carry meaning elsewhere in the app —
 * red is destructive (Remove, the delete confirmation) and emerald is healthy
 * (online dots, "Swarm active"). Neutral says "structural page", which is both
 * true and the thing worth saying.
 */
const STRUCTURAL_ACTIVE = "#fafafa";

export function DashboardNav() {
    const pathname = usePathname();

    // `/dashboard` is a prefix of every other route, so it has to match
    // exactly. Everything else matches on prefix, which keeps a nested page
    // highlighting its section.
    //
    // No nav item points at `/dashboard` today — it redirects to Moderation —
    // so that branch is currently unreachable. Kept because the bug it prevents
    // is silent: an item added back without it would light up on every page.
    const isActive = (href: string) =>
        href === "/dashboard" ? pathname === href : pathname.startsWith(href);

    return (
        <nav className="flex-1 p-4 space-y-6">
            {navGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                    <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        {group.label}
                    </p>
                    {group.items.map((item) => {
                        const active = isActive(item.href);
                        const accent = item.vigil
                            ? VIGILS[item.vigil].textColor
                            : undefined;
                        const Icon = item.vigil
                            ? VIGIL_ICONS[item.vigil]
                            : item.icon!;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                                    active
                                        ? "bg-zinc-800/70 font-medium"
                                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                                }`}
                                // Only the active row is coloured. An inactive
                                // row inherits, so the icon and the label are
                                // always the same colour as each other.
                                style={
                                    active
                                        ? { color: accent ?? STRUCTURAL_ACTIVE }
                                        : undefined
                                }
                            >
                                {/* One size and one stroke weight for all nine.
                                    The Unicode glyphs these replaced were set at
                                    a single font size and still looked mismatched,
                                    because each filled a different share of its
                                    em box. */}
                                <Icon size={18} strokeWidth={1.75} aria-hidden />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}
