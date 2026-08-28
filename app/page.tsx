import Link from "next/link";
import Image from "next/image";
import {
    ArrowUp,
    BookOpen,
    Brain,
    ChartSpline,
    Radar,
    RotateCw,
    TriangleAlert,
    type LucideIcon,
} from "lucide-react";
import { VIGILS } from "@/types";
import {
    BUILT_FOR,
    COMPOUNDING,
    CONTROLS,
    KEEPERS,
    KEEPER_ORDER,
    PATTERN_EVENTS,
    PLATFORM_FEATURES,
    SETUP_STEPS,
    keeperAvatar,
} from "@/lib/keepers";
import { VIGIL_ICONS } from "@/components/vigils";
import { KeeperTimeline } from "@/components/keeper-timeline";
import {
    Eyebrow,
    GhostButton,
    Kicker,
    PRIMARY_CTA_HREF,
    PRIMARY_CTA_LABEL,
    PrimaryButton,
    SectionHead,
    SiteFooter,
    SiteNav,
} from "@/components/site-chrome";

/**
 * The landing page — copy v3, bands 1 to 10, in order.
 *
 * Structure comes from two references chosen deliberately: the nav and the
 * eyebrow → two-line headline → evidence rhythm from database.tremor.so, and
 * the numbered index used for "Built for" from navbardigital.com/services.
 *
 * Band 4 is the page. The copy doc calls the member timeline the
 * highest-leverage asset on the site and says to design around it, so it is
 * full-bleed, it is the only band with motion, and it is the tallest thing
 * here. Everything else is quiet by comparison on purpose.
 */

const PLATFORM_ICONS: Record<string, LucideIcon> = {
    Radar,
    Brain,
    ChartSpline,
    RotateCw,
    BookOpen,
    ArrowUp,
};

export default function Home() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <SiteNav />

            {/* ---------- 1. HERO ---------- */}
            <section className="pt-24 text-center">
                <div className="max-w-[1160px] mx-auto px-8">
                    {/* The eyebrow carries the category. The headline below buys
                        its pull by giving up the word "moderation", so this is the
                        only place above the fold a cold visitor learns what this
                        is. It deliberately avoids "with memory" — the subhead opens
                        on those words, and the two stacked read as an echo. */}
                    <Eyebrow>Multi-agent moderation</Eyebrow>

                    {/* The one literal that must stay literal. Tailwind resolves
                        arbitrary values like `from-[#A8D5E2]` by scanning source
                        text at build time, so an interpolated variable produces no
                        class at all. Keep in step with VIGILS[].textColor by hand. */}
                    <h1 className="text-hero font-semibold text-balance mt-[22px]">
                        Your community has a history.
                        <br />
                        <span className="bg-gradient-to-r from-[#A8D5E2] via-[#5DCAA5] via-[#F5C842] via-[#9B72CF] to-[#22D3EE] bg-clip-text text-transparent">
                            Mindfully remembers it.
                        </span>
                    </h1>

                    {/* "for a culture worth keeping", not "for communities with a
                        culture worth keeping": the headline already opens on "Your
                        community", and the two lines stacked repeated the word at
                        the two largest sizes on the page. The thesis v3 added —
                        culture, not speed — is what the trim keeps. */}
                    <p className="text-sub font-medium tracking-[-0.022em] text-zinc-100 text-balance mt-[22px] mx-auto max-w-[40ch]">
                        Moderation with memory, for a culture worth keeping.
                    </p>
                    {/* Opens on the verb, not the name. "Mindfully" already lands
                        in the headline's gradient half, which is where it should
                        be heard; repeating it here made three uses in four lines
                        and spent the strong one twice. The subject carries over
                        from the line above without being restated. */}
                    <p className="text-lead text-zinc-400 mt-4 mx-auto max-w-[62ch]">
                        Learns your rules, remembers what happened before, and catches patterns
                        a message-by-message filter misses.
                    </p>

                    <div className="flex flex-wrap gap-3 justify-center mt-[30px]">
                        <PrimaryButton href={PRIMARY_CTA_HREF}>{PRIMARY_CTA_LABEL}</PrimaryButton>
                        <GhostButton href="/keepers">
                            Meet the Keepers <span aria-hidden>→</span>
                        </GhostButton>
                    </div>

                    {/* Two separated items, not three. The dropped pair — an agent
                        count and a feature name — both described the product to
                        itself; "5 specialized AI agents" also asserted directly
                        above the Keepers grid, which shows the five. These two
                        answer the questions a stranger actually arrives with: can
                        I use this where my community already is, and who is behind
                        it. Compatibility and provenance, one each. */}
                    <div className="flex flex-wrap justify-center items-center mt-7">
                        {[
                            "Works with Discord and Telegram",
                            "Built on Minds by Animoca Brands",
                        ].map((item, i) => (
                            <span
                                key={item}
                                className="relative text-meta text-zinc-500 px-4"
                            >
                                {i > 0 && (
                                    <span
                                        aria-hidden
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-zinc-600"
                                    />
                                )}
                                {item}
                            </span>
                        ))}
                    </div>

                    {/* The five Keepers, in the fold. Each card opens its section.
                        Image-led: the art is the strongest thing on the page after
                        the headline, and an icon in front of it would be a worse
                        version of the same idea. */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-15">
                        {KEEPER_ORDER.map((name) => {
                            const v = VIGILS[name];
                            const k = KEEPERS[name];
                            const Icon = VIGIL_ICONS[name];
                            return (
                                <Link
                                    key={name}
                                    href={`/keepers#${name}`}
                                    style={{ "--hue": v.color, "--hue-t": v.textColor } as React.CSSProperties}
                                    // The hover border is a mix of this Keeper's readable hue
                                    // and the resting border, not the hue at an opacity —
                                    // Tailwind's `/40` modifier cannot apply alpha to a value
                                    // it only sees as `var(--hue-t)`.
                                    // Solid `bg-zinc-900`, not `/60`: the scrim under the
                                    // portrait fades to this exact colour, and a translucent
                                    // card would leave a visible seam across every face.
                                    className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 flex flex-col text-left transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--hue-t)_45%,#27272a)]"
                                >
                                    <span className="relative block aspect-square overflow-hidden">
                                        <Image
                                            src={keeperAvatar(name)}
                                            // Decorative: the name is right below it in text,
                                            // and there is no useful alternative to a painting.
                                            alt=""
                                            fill
                                            sizes="(max-width: 768px) 50vw, 20vw"
                                            className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
                                            // All five sit above the fold, so all five
                                            // preload. This was `i < 5` on a five-item
                                            // array, which read as a cutoff but never was.
                                            priority
                                        />
                                        <span
                                            aria-hidden
                                            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-900 to-transparent"
                                        />
                                    </span>

                                    <span className="relative flex flex-col flex-1 px-4 pb-4 -mt-1">
                                        {/* The role glyph sits with the name, not on the
                                            art. Over the image it had to compete with
                                            whatever was behind it — on Nova it landed
                                            squarely on her glasses — and the portrait
                                            already says which Keeper this is. */}
                                        <span className="flex items-center gap-2">
                                            <Icon
                                                size={15}
                                                strokeWidth={1.8}
                                                aria-hidden
                                                style={{ color: v.textColor }}
                                            />
                                            <span
                                                className="text-lead font-semibold tracking-[-0.02em]"
                                                style={{ color: v.textColor }}
                                            >
                                                {v.displayName}
                                            </span>
                                        </span>
                                        <span className="mt-1.5 text-meta leading-snug text-zinc-400">
                                            {k.tagline}.
                                        </span>
                                        {/* An invitation, not the list heading.
                                            `/keepers` heads its bullet list with
                                            "What Vera tracks", which is right
                                            there — a few lines under the name.
                                            Here the name is directly above this
                                            line, so repeating it reads as a
                                            stutter. This line's only job is to
                                            say the card is clickable. */}
                                        {/* `text-meta`, matching the trust bar, and
                                            zinc-500 rather than zinc-600 — at 12px
                                            and zinc-600 this was the dimmest thing
                                            on the card and read as a caption rather
                                            than the affordance it is. Not zinc-400:
                                            that is the tagline's colour directly
                                            above, and the two would compete. */}
                                        <span className="mt-auto pt-4 text-meta text-zinc-500 group-hover:text-[var(--hue-t)] transition-colors">
                                            Meet {v.displayName} <span aria-hidden>→</span>
                                        </span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Copy v3's band 2 — a centred "Running on Minds · Discord and
                Telegram" between two rules — is deliberately not here.

                Both halves of it are said elsewhere, closer to where they
                matter: the hero's trust line already ends on "Built on Minds by
                Animoca Brands" a few hundred pixels above, and Discord and
                Telegram are named in the self-service band, at the step where a
                creator actually binds one. The band was the third mention of
                Minds on the page and the first mention of nothing.

                What it also did, and what is kept, is mark the seam between the
                hero and the argument. That is now a single rule carried by the
                section below — `border-y` on a standalone band drew two.

                ---------- 3. THE PROBLEM ---------- */}
            <section className="mt-22 py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8 grid lg:grid-cols-2 gap-18 items-start">
                    <div>
                        <Eyebrow>The problem</Eyebrow>
                        <h2 className="text-display font-semibold text-balance mt-4">
                            Moderation shouldn&rsquo;t start
                            <br />
                            from zero every time.
                        </h2>
                        <p className="text-lead text-zinc-400 mt-[22px]">
                            Every other tool asks one question:{" "}
                            <b className="text-zinc-100 font-medium">is this message allowed?</b>
                        </p>
                        <p className="text-lead text-zinc-400 mt-[18px] max-w-[62ch]">
                            One suspicious link might mean nothing. A new account posting that link
                            across several conversations, using another member&rsquo;s display name,
                            messaging people one after another — that&rsquo;s a pattern, and no filter
                            sees it, because a filter only ever sees the message in front of it.
                        </p>
                        <p className="text-lead text-zinc-400 mt-4 max-w-[62ch]">
                            Mindfully keeps the context. Decisions are informed by what came before,
                            not just by what appeared in the latest message.
                        </p>
                        {/* No kicker here. "Context over keywords. Patterns over
                            posts." said exactly what the panel opposite already
                            says — and the panel says it with the four "allowed"
                            rows sitting directly above the line, which is the
                            same argument with its evidence attached. */}
                    </div>

                    {/* Four events, each individually permitted. */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-zinc-800 font-mono text-label tracking-[0.05em] text-zinc-600">
                            <span>@new_member_88 · joined 2 days ago</span>
                            <span>{PATTERN_EVENTS.length} events</span>
                        </div>
                        <div className="py-1.5">
                            {PATTERN_EVENTS.map((e) => (
                                <div
                                    key={e.time}
                                    className="grid grid-cols-[64px_1fr_auto] gap-3.5 items-center px-4 py-2.5 text-meta"
                                >
                                    <span className="font-mono text-label text-zinc-600">{e.time}</span>
                                    <span className="text-zinc-400">{e.event}</span>
                                    <span className="font-mono text-label text-zinc-600">allowed</span>
                                </div>
                            ))}
                        </div>
                        <div
                            className="flex items-center gap-2.5 px-4 py-3.5 border-t border-zinc-800"
                            style={{ backgroundColor: VIGILS.kira.color + "1a" }}
                        >
                            <TriangleAlert
                                size={15}
                                strokeWidth={1.8}
                                aria-hidden
                                style={{ color: VIGILS.kira.textColor }}
                            />
                            <span
                                className="text-meta font-medium"
                                style={{ color: VIGILS.kira.textColor }}
                            >
                                Four allowed messages. One pattern.
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ---------- 4. MEMORY, IN ACTION ---------- */}
            <section className="py-26 border-y border-zinc-900 bg-[radial-gradient(120%_80%_at_50%_0%,#101017_0%,#09090b_70%)]">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="Memory, in action"
                        title={
                            <>
                                Three weeks in the life
                                <br />
                                of one member.
                            </>
                        }
                    />
                    <KeeperTimeline />
                    <div className="flex justify-center mt-10">
                        <PrimaryButton href={PRIMARY_CTA_HREF}>{PRIMARY_CTA_LABEL}</PrimaryButton>
                    </div>
                </div>
            </section>

            {/* ---------- 5. THE PLATFORM ---------- */}
            <section id="platform" className="py-26 scroll-mt-20">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="The platform"
                        title={
                            <>
                                One moderation layer.
                                <br />
                                Five specialists. One memory.
                            </>
                        }
                    />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px mt-14 bg-zinc-900 border border-zinc-900">
                        {PLATFORM_FEATURES.map((f) => {
                            const Icon = PLATFORM_ICONS[f.icon];
                            return (
                                <div key={f.title} className="bg-zinc-950 px-7 pt-7 pb-8">
                                    <span className="w-7.5 h-7.5 rounded-lg grid place-items-center bg-zinc-900 border border-zinc-800 text-zinc-400">
                                        <Icon size={15} strokeWidth={1.8} aria-hidden />
                                    </span>
                                    <h3 className="text-body font-semibold mt-4.5">{f.title}</h3>
                                    <p className="text-body text-zinc-500 mt-2">
                                        {f.body}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    {/* The band's closing beat, and the payoff to "Your rules,
                        your norms" three cells above it: rules are the part you
                        can write down, culture is the part only memory holds. */}
                    <Kicker className="text-center mt-14">
                        Rules are written. Culture is remembered.
                    </Kicker>
                </div>
            </section>

            {/* Copy v3's band 6 ("Five Keepers. One shared understanding.", with
                the five listed) is deliberately not here.

                The doc wrote that band for a page whose hero did not introduce the
                Keepers. This one does: the grid in the fold shows the same five
                with the same art, the same taglines and the same `/keepers#name`
                links. The band repeated all of it ~2,000px later and added only
                one sentence each — which is the opening sentence of the
                description already on /keepers.

                Routes to the Keepers are unaffected: the five hero cards, the
                hero's secondary CTA, the nav and the footer all still lead there.

                ---------- 7. BUILT FOR ---------- */}
            <section id="built-for" className="py-26 scroll-mt-20">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        eyebrow="Built for"
                        title={
                            <>
                                Communities where
                                <br />
                                the culture is the product.
                            </>
                        }
                    />
                    {/* Unnumbered. Creators, Web3, Gaming, DAOs and Brands are a
                        set with no order, and unlike the Keepers index these rows
                        are not links — so a number here was neither a sequence nor
                        wayfinding, only decoration. */}
                    <div className="mt-14 border-t border-zinc-900">
                        {BUILT_FOR.map((b) => (
                            <div
                                key={b.segment}
                                className="grid md:grid-cols-[260px_1fr] gap-x-6 gap-y-2 items-start px-2 py-6.5 border-b border-zinc-900 transition-all hover:bg-zinc-900/50 hover:pl-4.5"
                            >
                                <span className="text-lead font-medium tracking-[-0.02em]">
                                    {b.segment}
                                </span>
                                <div>
                                    <p className="text-lead font-medium tracking-[-0.02em] text-zinc-100">
                                        {b.headline}
                                    </p>
                                    <p className="text-body text-zinc-500 mt-2 max-w-[56ch]">
                                        {b.body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---------- 8. CONTROL ---------- */}
            <section className="py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <div className="grid lg:grid-cols-2 gap-18 items-center">
                        <div>
                            <Eyebrow>Control</Eyebrow>
                            <h2 className="text-display font-semibold text-balance mt-4">
                                Your culture.
                                <br />
                                Your rules. Your call.
                            </h2>
                            <p className="text-lead text-zinc-400 mt-[18px] max-w-[62ch]">
                                Mindfully doesn&rsquo;t replace the people responsible for a community
                                — it gives them reach.
                            </p>
                            <p className="text-lead text-zinc-400 mt-3.5 max-w-[62ch]">
                                Teach the Keepers what makes this room different from every other room.
                            </p>
                            {/* Replaces copy v3's "Speed comes from the agents. The
                                standard comes from you.", which restated the band's
                                closing line rather than adding to it.

                                This one argues the case instead: it says why a human
                                is in the loop at all, which is the one thing the
                                band never states outright. "Model" is deliberate and
                                already established — Sage's copy calls out "the
                                conventions a generic model reads as violations". */}
                            {/* `Kicker`'s own 22px, not the 18px override it had:
                                at `text-lead` this matched the two grey paragraphs
                                above it and read as a fourth one. Every other
                                kicker on the page sits at 22px, which is what makes
                                them land as a beat rather than more body copy. It
                                wraps to two lines in this column — that is the
                                trade, and the emphasis is worth it. */}
                            <Kicker className="mt-7">
                                Some decisions need judgment, not another model.
                            </Kicker>
                        </div>

                        <div className="grid gap-px bg-zinc-900 border border-zinc-900 rounded-xl overflow-hidden">
                            {CONTROLS.map((c) => (
                                <div
                                    key={c.n}
                                    className="bg-zinc-950 px-6.5 py-5.5 grid grid-cols-[36px_1fr] gap-4 items-baseline"
                                >
                                    <span className="font-mono text-xs tracking-[0.08em] text-zinc-600">
                                        {c.n}
                                    </span>
                                    <div>
                                        <h3 className="text-body font-semibold">{c.title}</h3>
                                        <p className="text-body text-zinc-500 mt-1.5">
                                            {c.body}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Kicker className="text-center mt-14">
                        The agents learn. You stay in control.
                    </Kicker>
                </div>
            </section>

            {/* ---------- 9. WHY IT COMPOUNDS ---------- */}
            <section className="py-26">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="Why it compounds"
                        title={
                            <>
                                Healthy communities don&rsquo;t just
                                <br />
                                remove bad actors. They keep good ones.
                            </>
                        }
                        lead="The best communities have history, regulars, inside jokes, newcomers finding their place, and arguments that actually get resolved. Mindfully protects the conditions that make people want to come back."
                    />
                    <div className="grid md:grid-cols-2 gap-px mt-14 bg-zinc-900 border border-zinc-900">
                        {COMPOUNDING.map((c) => (
                            <div key={c.title} className="bg-zinc-950 px-6.5 pt-7 pb-7.5">
                                <h3 className="text-body font-semibold flex flex-wrap items-center gap-2.5">
                                    {c.title}
                                    {"roadmap" in c && c.roadmap && (
                                        <span
                                            className="font-mono text-micro tracking-[0.1em] uppercase font-normal px-1.5 py-0.5 rounded border"
                                            style={{
                                                color: VIGILS.mira.textColor,
                                                borderColor: VIGILS.mira.textColor + "66",
                                            }}
                                        >
                                            Roadmap
                                        </span>
                                    )}
                                </h3>
                                <p className="text-body text-zinc-500 mt-2">
                                    {c.body}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* A dashed "Slot reserved" placeholder stood here, holding
                        space for the retention or activity figure copy v3 asks for
                        ("This band converts on evidence"). It was a note to
                        ourselves rendered at visitors, so it is gone.

                        The ask is not: when there is a real number — even from one
                        test server — it belongs in this band. */}
                </div>
            </section>

            {/* ---------- SELF-SERVICE ----------
                Not in copy v3, which never explains how a creator actually gets
                this. "Minds" appeared twice on the whole page, both times as the
                Animoca attribution — so the differentiator that the agents run on
                the creator's own account, under their own key, was nowhere. */}
            <section className="py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="Self-service"
                        title="Make the Keepers your own."
                        lead="They are not our agents running on our servers. They are your Minds, on your key, holding your community's memory."
                    />
                    <div className="grid sm:grid-cols-3 gap-px mt-14 bg-zinc-900 border border-zinc-900">
                        {SETUP_STEPS.map((s) => (
                            <div key={s.n} className="bg-zinc-950 px-7 pt-7 pb-8">
                                <span className="font-mono text-label tracking-[0.08em] text-zinc-600">
                                    {s.n}
                                </span>
                                <h3 className="text-lead font-semibold mt-3">{s.title}</h3>
                                <p className="text-body text-zinc-500 mt-2">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---------- 10. FINAL CTA ---------- */}
            <section className="pb-26">
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
