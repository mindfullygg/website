import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { NavAuth } from "@/components/nav-auth";
import { SpectrumRule } from "@/components/spectrum-rule";
import { cn } from "@/lib/utils";

/**
 * Chrome and typographic primitives for the public marketing pages.
 *
 * The nav and footer lived inline in `app/page.tsx` and
 * `app/(web)/keepers/page.tsx`, and had already drifted: one called the roles
 * "The swarm", the other "Meet the keepers", and the CTA read "Deploy your
 * swarm" on one and "Get Started" on the other. Copy v3 settles all three
 * ("the Keepers", "Add the Keepers"), and there is now one place to settle
 * them in.
 *
 * Dashboard pages have their own chrome — see `components/dashboard-nav.tsx`.
 */

/**
 * Every CTA points here — the nav's "Sign in" included. One door.
 *
 * `/dashboard`, not `/sign-in` and not `/dashboard/setup`, because the route
 * itself decides where you belong: `proxy.ts` bounces a signed-out visitor to
 * Clerk and returns them here afterwards, and the page then sends them to setup
 * or shows the overview depending on how far along their account is. Pointing a
 * button at `/sign-in` would hardcode a step Clerk already owns, and would be
 * wrong for anyone who is already signed in.
 */
export const PRIMARY_CTA_HREF = "/dashboard";

/**
 * The label on the in-page CTAs.
 *
 * Third attempt, and the first two were both wrong in the same way — they
 * promised the wrong shape of action:
 *
 * - `Add the Keepers` (copy v3's label) promises a bot you drop into a server.
 *   There is no such thing to add.
 * - `Connect your Minds` promises a wallet-style handshake — click, approve,
 *   connected. For an audience sitting inside Animoca, Moca Network and token
 *   communities, "Connect X" reads as `Connect wallet` and nothing else. What
 *   actually follows is a sign-up, a wizard, a pasted Builder API key, five
 *   role assignments and a community binding.
 *
 * `Set up your Keepers` describes that honestly, and the self-service band
 * three sections down spells out what "set up" involves in three steps, so the
 * button does not have to.
 */
export const PRIMARY_CTA_LABEL = "Set up your Keepers";

/**
 * Three destinations, three pages — no in-page anchors.
 *
 * "Platform" and "Built for" pointed at `/#platform` and `/#built-for`, which
 * meant two of the three entries scrolled you inside the page you were already
 * on, and did nothing recognisable from `/keepers`. The nav now names the three
 * pages that exist, which is also how `/how-it-works` becomes reachable at all
 * — nothing linked to it, and the footer no longer carries link columns.
 */
const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/keepers", label: "The Keepers" },
    { href: "/how-it-works", label: "How it works" },
];

// The mark lives in components/brand-mark.tsx so the dashboard sidebar can use
// the same one. The previous mark was drawn here from the five VIGILS colours —
// a hub with five spokes — which meant the logo changed shape whenever a role
// colour was retuned, and it read as six nodes rather than five because the hub
// was one too.
export function Wordmark({ className }: { className?: string }) {
    return (
        <Link
            href="/"
            className={cn(
                "inline-flex items-center gap-2.5 text-xl font-bold tracking-tight",
                className
            )}
        >
            {/* Matched to the dashboard sidebar: same 22px mark, same text-xl
                bold, and ".gg" in the same colour as the rest rather than
                dimmed to zinc-500. Two treatments of one wordmark across two
                surfaces read as two products. */}
            <BrandMark className="w-[22px] h-[22px]" />
            mindfully.gg
        </Link>
    );
}

/**
 * Sticky, translucent, three-column: wordmark left, links optically centred,
 * one filled CTA right.
 *
 * `bg-zinc-950/80` plus `backdrop-blur` rather than a solid fill, so the
 * spectrum rule and the content beneath stay faintly visible while scrolling.
 */
export function SiteNav({ current }: { current?: string }) {
    return (
        <div className="sticky top-0 z-50">
            <nav className="bg-zinc-950/80 backdrop-blur-xl backdrop-saturate-150">
                <div className="max-w-[1160px] mx-auto px-8 py-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                    <Wordmark />

                    <div className="hidden md:flex gap-7 justify-self-center">
                        {NAV_LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                aria-current={current === l.label ? "page" : undefined}
                                className={cn(
                                    "text-base transition-colors",
                                    current === l.label
                                        ? "text-zinc-100"
                                        : "text-zinc-400 hover:text-zinc-100"
                                )}
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>

                    {/* `min-w` reserves the slot: NavAuth resolves auth after
                        hydration, and with nothing holding the width the whole
                        bar shifted as the real state arrived. See that file for
                        why the branch is client-side. */}
                    <div className="justify-self-end flex items-center gap-3.5 min-w-[124px] justify-end">
                        <NavAuth />
                    </div>
                </div>
            </nav>
            <SpectrumRule />
        </div>
    );
}

/**
 * Two lines, deliberately.
 *
 * The link columns are gone rather than trimmed. Four "Platform" labels all
 * pointed at the same `/#platform` anchor — four destinations in appearance and
 * one in fact — beside duplicates of the top nav and three Legal links that
 * shared a single destination. A footer that repeats a short nav and fakes
 * depth costs a screen of height and earns nothing.
 *
 * If real legal pages arrive, they belong here — that is a reason to add a
 * column back, and the only one so far.
 *
 * What remains is what this footer is actually for: whose site this is, and
 * where it came from.
 */
/**
 * Every footer link leaves the site, so all three are plain `<a>` — `next/link`
 * exists to prefetch routes this app owns, and there is nothing here to
 * prefetch. `noreferrer` implies `noopener`, which is what stops the opened
 * page reaching back through `window.opener`.
 *
 * Hover lifts to `zinc-300`, not the `zinc-100` used elsewhere: this bar sits
 * at `zinc-600` on purpose, and near-white on hover would be louder than
 * anything else in it.
 */
function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300 transition-colors"
        >
            {children}
        </a>
    );
}

export function SiteFooter() {
    return (
        <footer className="border-t border-zinc-900 py-8">
            <div className="max-w-[1160px] mx-auto px-8">
                <div className="flex flex-wrap justify-between items-center gap-3 text-meta text-zinc-600">
                    <span>
                        © 2026{" "}
                        <FootLink href="https://www.ivanmolto.com">Ivan Molto</FootLink>
                        {" · Built with "}
                        {/* Labelled, so this reads "Built with love in sunny Malta"
                            rather than "Built with red heart in sunny Malta". */}
                        <span role="img" aria-label="love">
                            ❤️
                        </span>
                        {" in sunny Malta · Powered by "}
                        <FootLink href="https://hellominds.ai">
                            Minds from Animoca Brands
                        </FootLink>
                    </span>
                    <FootLink href="https://dorahacks.io/hackathon/creativeminds/detail">
                        Creative Minds Jam #1 · Hong Kong
                    </FootLink>
                </div>
            </div>
        </footer>
    );
}

/**
 * Mono, uppercase, wide-tracked, in parentheses.
 *
 * The one typographic signature on these pages — every band is introduced by
 * one of these, so the reader can tell where a band starts without a rule or a
 * change of background.
 */
export function Eyebrow({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "block font-mono text-label font-medium tracking-[0.18em] uppercase text-zinc-500",
                className
            )}
        >
            ( {children} )
        </span>
    );
}

/** Eyebrow, headline, optional lead — the opening of every band. */
export function SectionHead({
    eyebrow,
    title,
    lead,
    center = false,
    className,
}: {
    eyebrow: string;
    title: React.ReactNode;
    lead?: React.ReactNode;
    center?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "max-w-[780px]",
                center && "mx-auto text-center",
                className
            )}
        >
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2 className="text-display font-semibold text-balance mt-4">
                {title}
            </h2>
            {lead && (
                <p
                    className={cn(
                        "text-lead text-zinc-400 mt-[18px] max-w-[62ch]",
                        center && "mx-auto"
                    )}
                >
                    {lead}
                </p>
            )}
        </div>
    );
}

/** The short declarative line that closes a band. */
export function Kicker({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <p
            className={cn(
                "text-sub font-medium tracking-[-0.02em] text-zinc-100 text-balance",
                className
            )}
        >
            {children}
        </p>
    );
}

export function PrimaryButton({
    href,
    children,
    className,
}: {
    href: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-body font-medium",
                "bg-zinc-100 text-zinc-900 hover:bg-white transition-colors",
                className
            )}
        >
            {children}
        </Link>
    );
}

export function GhostButton({
    href,
    children,
    className,
}: {
    href: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-body font-medium",
                "border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 transition-colors",
                className
            )}
        >
            {children}
        </Link>
    );
}
