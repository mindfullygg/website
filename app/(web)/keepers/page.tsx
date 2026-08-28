import Image from "next/image";
import type { Metadata } from "next";
import { VIGILS, type VigilName } from "@/types";
import {
    CARD_ART_DIMS,
    KEEPERS,
    KEEPER_ORDER,
    keeperCardArt,
    skillLabel,
    skillUrl,
    tracksHeading,
} from "@/lib/keepers";
import { VIGIL_ICONS } from "@/components/vigils";
import {
    Eyebrow,
    GhostButton,
    PRIMARY_CTA_HREF,
    PRIMARY_CTA_LABEL,
    PrimaryButton,
    SiteFooter,
    SiteNav,
} from "@/components/site-chrome";

/**
 * Meet the Keepers — band 6 of the landing page, expanded.
 *
 * Anatomy is lifted from navbardigital.com/services, which turned out to map
 * onto a Keeper almost exactly: a numbered label, the name, what it does, how
 * it works as a four-step sequence, what it hands off, and one CTA.
 *
 * Their jump list is not — see the note where it used to sit. Five is not eight,
 * and the first block starts right under where the index was.
 *
 * Every word comes from `lib/keepers.ts`, which the landing page also reads —
 * so the two pages cannot describe the same five roles differently. They did
 * before: this page said "Meet the keepers" and the landing said "The swarm".
 */

export const metadata: Metadata = {
    title: "Meet the Keepers — mindfully.gg",
    description:
        "Five Keepers, one shared understanding. Each owns one job: reputation, culture, moderation, room health, and the people drifting out.",
};

function KeeperBlock({ name }: { name: VigilName }) {
    const v = VIGILS[name];
    const k = KEEPERS[name];
    const Icon = VIGIL_ICONS[name];
    const url = skillUrl(name);

    return (
        <section
            id={name}
            style={{ "--hue": v.color, "--hue-t": v.textColor } as React.CSSProperties}
            className="relative py-21 border-t border-zinc-900 scroll-mt-16"
        >
            {/* A wash of this Keeper's own hue, fading out over the top third.
                One hue per section is what keeps the five distinguishable while
                scrolling; the page never shows two at once. */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-80"
                style={{
                    background:
                        "linear-gradient(180deg, color-mix(in srgb, var(--hue) 14%, transparent) 0%, transparent 100%)",
                }}
            />

            <div className="relative max-w-[1160px] mx-auto px-8">
                {/* The role, where "01 / KEEPER" used to be.
                    That label came from navbardigital's "01 / SERVICE", where the
                    number is half of a two-part system — their index lists 01–08
                    and each block repeats its number, so you can place yourself
                    among eight long sections. This page's index is gone, so the
                    number pointed at nothing; five Keepers are a set rather than
                    a sequence anyway; and "KEEPER" restated the page title, the
                    headline and the name directly below it.

                    `VIGILS[].role` is the same string the dashboard sidebar uses,
                    so it is information rather than decoration and cannot drift
                    from the rest of the product. It is also the only place on
                    this page the role appears — it was otherwise legible only
                    inside the Skill id at the foot of the block. */}
                <span className="font-mono text-label tracking-[0.16em] uppercase text-[var(--hue-t)]">
                    {v.role}
                </span>

                {/* Card art left, everything else right. The original version of
                    this page reserved a `w-48 h-64` placeholder for exactly this
                    — the art is 3:4 because that slot was 3:4. */}
                <div className="grid lg:grid-cols-[300px_1fr] gap-10 lg:gap-14 items-start mt-4.5">
                    <div className="relative w-full max-w-[240px] lg:max-w-none">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute -inset-4 rounded-[28px] blur-2xl opacity-30"
                            style={{
                                background: `radial-gradient(60% 50% at 50% 30%, ${v.color} 0%, transparent 70%)`,
                            }}
                        />
                        <Image
                            src={keeperCardArt(name)}
                            // Decorative: the name, role and description all sit
                            // beside it, and a painting has no useful text equivalent.
                            alt=""
                            width={CARD_ART_DIMS.width}
                            height={CARD_ART_DIMS.height}
                            sizes="(max-width: 1024px) 240px, 300px"
                            className="relative w-full h-auto rounded-2xl border object-cover"
                            style={{ borderColor: v.color + "66" }}
                        />
                    </div>

                    <div>
                        <div className="flex items-center gap-3.5">
                            <span
                                className="w-12 h-12 rounded-xl grid place-items-center flex-none"
                                style={{ backgroundColor: v.color + "38", color: v.textColor }}
                            >
                                <Icon size={24} strokeWidth={1.7} aria-hidden />
                            </span>
                            <h2
                                className="text-display font-semibold leading-none"
                                style={{ color: v.textColor }}
                            >
                                {v.displayName}
                            </h2>
                        </div>
                        <p className="text-lead font-medium tracking-[-0.02em] text-zinc-100 mt-4">
                            {k.tagline}
                        </p>
                        <p className="text-body text-zinc-400 mt-5 max-w-[62ch]">
                            {k.description}
                        </p>

                        <div className="grid sm:grid-cols-2 gap-8 lg:gap-12 mt-9">
                            <div>
                                <div className="font-mono text-label tracking-[0.16em] uppercase text-zinc-600 pb-3 border-b border-zinc-900">
                                    {tracksHeading(name)}
                                </div>
                                <ul className="mt-4 grid gap-2.5">
                                    {k.tracks.map((t) => (
                                        <li
                                            key={t}
                                            className="relative pl-4 text-body text-zinc-400"
                                        >
                                            <span
                                                aria-hidden
                                                className="absolute left-0 top-2 w-[5px] h-[5px] rounded-full"
                                                style={{ backgroundColor: v.textColor }}
                                            />
                                            {t}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <div className="font-mono text-label tracking-[0.16em] uppercase text-zinc-600 pb-3 border-b border-zinc-900">
                                    Works with
                                </div>
                                <ul className="mt-4 grid gap-2.5">
                                    {[
                                        { label: "Reads", value: k.reads },
                                        { label: "Gives", value: k.gives },
                                    ].map((row) => (
                                        <li
                                            key={row.label}
                                            className="relative pl-4 text-body text-zinc-400"
                                        >
                                            <span
                                                aria-hidden
                                                className="absolute left-0 top-2 w-[5px] h-[5px] rounded-full"
                                                style={{ backgroundColor: v.textColor }}
                                            />
                                            <b className="text-zinc-100 font-medium">{row.label}</b> —{" "}
                                            {row.value}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* How one message moves through this Keeper. A real sequence,
                    which is what earns the numbering. */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px mt-10 bg-zinc-900 border-y border-zinc-900">
                    {k.steps.map((s) => (
                        <div key={s.n} className="bg-zinc-950 px-5 pt-5.5 pb-6">
                            <span
                                className="font-mono text-label tracking-[0.08em]"
                                style={{ color: v.textColor }}
                            >
                                {s.n}
                            </span>
                            <h3 className="text-body font-semibold mt-3">{s.title}</h3>
                            <p className="text-body leading-snug text-zinc-500 mt-1.5">{s.body}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-6 mt-9">
                    {/* A sentence, not a raw identifier. `Mindfully_Trust_Keeper`
                        was the Skill's literal Bazaar name shown as-is — accurate,
                        and meaningless to anyone who has not used the Bazaar. The
                        underscored form is still what `skill` stores, because it
                        is the string a search matches; only the display is spaced.

                        Plain <a>: this leaves the app. Hover lifts the whole chip
                        rather than underlining, since the chip is the target. */}
                    {url ? (
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-meta px-3.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
                            style={{ backgroundColor: v.color + "33", color: v.textColor }}
                        >
                            Equipped with {skillLabel(name)} skill{" "}
                            <span aria-hidden className="ml-1.5">
                                ↗
                            </span>
                        </a>
                    ) : (
                        <span
                            className="inline-flex items-center text-meta px-3.5 py-1.5 rounded-full"
                            style={{ backgroundColor: v.color + "33", color: v.textColor }}
                        >
                            Equipped with {skillLabel(name)} skill
                        </span>
                    )}
                    <GhostButton href={PRIMARY_CTA_HREF}>
                        {PRIMARY_CTA_LABEL} <span aria-hidden>→</span>
                    </GhostButton>
                </div>
            </div>
        </section>
    );
}

export default function KeepersPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <SiteNav current="The Keepers" />

            <section className="pt-24">
                <div className="max-w-[1160px] mx-auto px-8">
                    <Eyebrow>The Keepers</Eyebrow>
                    <h1 className="text-hero font-semibold text-balance mt-4.5 max-w-[16ch]">
                        Five Keepers. One shared understanding.
                    </h1>
                    <p className="text-lead text-zinc-400 mt-5 max-w-[62ch]">
                        Each Keeper owns one job and nothing else. They are separate agents working
                        from the same history — what was said, what happened before, and which
                        interventions already ran.
                    </p>

                    {/* navbardigital's jump list is deliberately not here.

                        It works on their Services page because eight offerings
                        are hard to hold in your head and the list is the only
                        place you see them together. Here there are five, and the
                        first block starts immediately below it — the index was
                        showing each name and tagline a few hundred pixels above
                        the block that opens with the same name and the same
                        tagline, then linking down to it.

                        The five are already introduced on the landing page's
                        hero grid, which is where most arrivals come from. This
                        page is the detail; it can start with the detail. */}
                </div>
            </section>

            {KEEPER_ORDER.map((name) => (
                <KeeperBlock key={name} name={name} />
            ))}

            {/* The Control band lived here — the same eyebrow, headline, lead and
                four `CONTROLS` rows the landing page carries. It was on both
                pages from the day this one was built, and flagged as a duplicate
                then: the landing is where a visitor is still deciding whether
                they trust the arrangement, so that is where the argument belongs.

                Here it sat after five detailed blocks that had already made the
                point — Kira "can be overruled", every block's steps end on the
                creator's correction writing back. Removed, not moved. */}

            {/* ---------- FINAL CTA ---------- */}
            <section className="pt-26 pb-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <div className="relative overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-900/60 px-8 py-15 text-center">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 -top-30 h-60 opacity-15 blur-[60px] bg-gradient-to-r from-[#A8D5E2] via-[#F5C842] to-[#22D3EE]"
                        />
                        <h2 className="relative text-title font-semibold text-balance">
                            Your community already has a culture.
                        </h2>
                        <p className="relative text-sub text-zinc-400 tracking-[-0.02em] text-balance mt-3.5 mx-auto max-w-[34ch]">
                            Give your moderation enough memory to understand it.
                        </p>
                        <div className="relative flex flex-wrap gap-3 justify-center mt-7">
                            <PrimaryButton href={PRIMARY_CTA_HREF}>{PRIMARY_CTA_LABEL}</PrimaryButton>
                        </div>
                    </div>
                </div>
            </section>

            <SiteFooter />
        </div>
    );
}
