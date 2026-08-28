import type { Metadata } from "next";
import { VIGILS } from "@/types";
import { KEEPER_ORDER, skillLabel } from "@/lib/keepers";
import { VIGIL_ICONS } from "@/components/vigils";
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
 * How it works — the setup, step by step.
 *
 * **No Keeper names anywhere on this page.** Every other marketing surface can
 * say Vera and Kira, because those are ours. This page describes the creator's
 * own setup: they bring five Minds they created and named themselves, and each
 * one takes a *role*. Telling someone to "name them Vera, Sage, Kira, Mira and
 * Nova" — which this page did — describes our swarm as if it were theirs, the
 * same error `VIGILS[].tagline` documents and `VigilAvatar` exists to avoid.
 *
 * Roles are used instead, from `VIGILS[].role`: Trust Keeper, Culture Learner,
 * Moderator, Health Pulse, Community Guide. Those are what a creator actually
 * assigns, and they are the strings the dashboard shows them.
 *
 * The steps also had to change to match what setup does. The old step 02 sent
 * creators to the Bazaar to equip five Skills by hand; `lib/skills-config.ts`
 * says the opposite in as many words — "there is no step where a creator
 * browses the Bazaar and installs anything" — because `provisionSwarm` equips
 * them during role assignment. The sequence below is the wizard's real one:
 * key, roles, community, rules.
 */

export const metadata: Metadata = {
    title: "How it works — mindfully.gg",
    description:
        "Five steps from zero to a working moderation layer. You create the Minds, you name them, and they stay on your account.",
};

/* ---------- platform marks ---------- */

const DISCORD = "#5865F2";
const TELEGRAM = "#26A5E4";

function DiscordMark({ size = 18 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.94.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.128c-.598.35-1.22.642-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
    );
}

function TelegramMark({ size = 18 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.16.093.36.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
    );
}

/** A platform chip in its own brand colour, mark first. */
function PlatformChip({
    label,
    color,
    children,
    muted = false,
}: {
    label: string;
    color: string;
    children: React.ReactNode;
    muted?: boolean;
}) {
    return (
        <span
            className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full border text-meta"
            style={
                muted
                    ? { borderColor: "#27272a", color: "#71717a" }
                    : {
                          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                          borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                          color,
                      }
            }
        >
            {children}
            {label}
        </span>
    );
}

/* ---------- step visuals ---------- */

/** The five roles as glyphs — no names, because the creator picks those. */
function RoleGlyphs() {
    return (
        // A five-column grid, not a wrapping flex row. At `w-24` each the five
        // cells were 528px wide inside a 468px column, so Community Guide fell
        // to a second row and the set read as 4 + 1 rather than as five.
        <div className="grid grid-cols-5 gap-2">
            {KEEPER_ORDER.map((name) => {
                const v = VIGILS[name];
                const Icon = VIGIL_ICONS[name];
                return (
                    <div key={name} className="flex flex-col items-center gap-2 min-w-0">
                        <span
                            className="w-11 h-11 rounded-xl grid place-items-center flex-none"
                            style={{ backgroundColor: v.color + "38", color: v.textColor }}
                        >
                            <Icon size={20} strokeWidth={1.7} aria-hidden />
                        </span>
                        <span
                            className="text-label text-center leading-tight"
                            style={{ color: v.textColor }}
                        >
                            {v.role}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/** Role → the Skill setup equips onto whichever Mind holds it. */
function RoleSkillMap() {
    return (
        <div className="grid gap-2">
            {KEEPER_ORDER.map((name) => {
                const v = VIGILS[name];
                const Icon = VIGIL_ICONS[name];
                return (
                    <div
                        key={name}
                        className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800"
                    >
                        <span
                            className="w-7 h-7 rounded-lg grid place-items-center flex-none"
                            style={{ backgroundColor: v.color + "38", color: v.textColor }}
                        >
                            <Icon size={15} strokeWidth={1.8} aria-hidden />
                        </span>
                        <span
                            className="text-meta font-medium w-32"
                            style={{ color: v.textColor }}
                        >
                            {v.role}
                        </span>
                        <span aria-hidden className="text-zinc-700">
                            →
                        </span>
                        <span className="text-meta font-mono text-zinc-400">
                            {skillLabel(name)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function SampleRules() {
    return (
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 font-mono text-meta text-zinc-400 leading-relaxed">
            <span className="text-zinc-600">{"// your baseline, in your words"}</span>
            <br />
            No spam. No hate speech.
            <br />
            Crypto talk only in #trading.
            <br />
            Memes welcome in #general.
            <br />
            No shilling without mod approval.
            <br />
            Casual language fine everywhere except #announcements.
        </div>
    );
}

/** One message in, five roles consulted, one decision out. */
function FlowDiagram() {
    return (
        <div>
            <div className="flex justify-center gap-2.5">
                <PlatformChip label="Discord" color={DISCORD}>
                    <DiscordMark size={15} />
                </PlatformChip>
                <PlatformChip label="Telegram" color={TELEGRAM}>
                    <TelegramMark size={15} />
                </PlatformChip>
            </div>

            <div className="flex justify-center">
                <span className="w-px h-6 bg-zinc-800" aria-hidden />
            </div>

            <div className="flex justify-center">
                <span className="px-4 py-2 rounded-full bg-zinc-900/60 border border-zinc-800 text-meta text-zinc-400">
                    Your Minds, on your key
                </span>
            </div>

            <div className="flex justify-center">
                <span className="w-px h-6 bg-zinc-800" aria-hidden />
            </div>

            <div className="flex flex-wrap justify-center gap-2">
                {KEEPER_ORDER.map((name) => {
                    const v = VIGILS[name];
                    const Icon = VIGIL_ICONS[name];
                    return (
                        <span
                            key={name}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-label"
                            style={{
                                backgroundColor: v.color + "22",
                                borderColor: v.color + "55",
                                color: v.textColor,
                            }}
                        >
                            <Icon size={13} strokeWidth={1.9} aria-hidden />
                            {v.role}
                        </span>
                    );
                })}
            </div>

            <div className="flex justify-center mt-4">
                <span className="text-meta text-zinc-600">
                    One shared history. Every decision reads it before acting.
                </span>
            </div>
        </div>
    );
}

/* ---------- content ---------- */

const STEPS = [
    {
        n: "01",
        title: "Create your Minds",
        body: "Create five Minds on hellominds.ai — one to hold each role. Name them whatever you like; the role is what setup assigns, not the name. Each Mind keeps its own persistent memory.",
        detail: "About five minutes. Free to create.",
        visual: <RoleGlyphs />,
    },
    {
        n: "02",
        title: "Connect your API key",
        body: "Paste your Minds Builder key into the setup wizard. It is validated against your account and encrypted at rest, and nothing can reach your Minds until it is set.",
        detail: "One field. Your key never leaves your account.",
        visual: null,
    },
    {
        n: "03",
        title: "Assign the five roles",
        body: "Point each role at one of your Minds. Setup equips the published Skill for that role on your behalf — you never open the Bazaar. The Skill is what turns a general Mind into a specialist.",
        detail: "Five dropdowns. Equipping is additive and never removes a Skill you added yourself.",
        visual: <RoleSkillMap />,
    },
    {
        n: "04",
        title: "Connect your community",
        body: "Link a Discord server, a Telegram group, or both. The bot joins and starts listening; from here the roles can see what a message is replying to and who is speaking.",
        detail: "Discord and Telegram today.",
        visual: (
            <div className="flex flex-wrap justify-center gap-2.5">
                <PlatformChip label="Discord" color={DISCORD}>
                    <DiscordMark />
                </PlatformChip>
                <PlatformChip label="Telegram" color={TELEGRAM}>
                    <TelegramMark />
                </PlatformChip>
                <PlatformChip label="Slack — later" color="" muted>
                    <span
                        aria-hidden
                        className="w-[18px] h-[18px] rounded-full border border-zinc-700"
                    />
                </PlatformChip>
            </div>
        ),
    },
    {
        n: "05",
        title: "Seed your rules",
        body: "Write your baseline in your own words — what is allowed, what is not, which channels differ. These are held as your definitions and outrank anything inferred. Everything after that is learned from the room.",
        detail: "A few sentences is enough. The rest is learned.",
        visual: <SampleRules />,
    },
];

const PHASES = [
    {
        label: "Week 1",
        body: "Member records start accumulating. The culture role picks up your vocabulary and where each channel's line sits. Moderation acts on the clear cases and sends the rest to you.",
    },
    {
        label: "Week 2–3",
        body: "Most cases are handled without you. Channel-by-channel norms are mapped. Shifts in participation surface before you would have noticed them, and welcomes settle on whatever actually keeps people.",
    },
    {
        label: "Month 1+",
        body: "Standing reflects how members have behaved here rather than how old their account is. Culture is learned rather than guessed. Moderation costs you minutes, and the corrections you made once are not asked again.",
    },
];

const OWNERSHIP = [
    {
        title: "Your agents",
        body: "The Minds run on your account, under names you chose. We never hold them, and we never see your key in the clear.",
    },
    {
        title: "Your memory",
        body: "What the roles learn lives in your Minds' own memory. Moderation records we do keep are short-lived by design and redacted on resolve.",
    },
    {
        title: "Your choice",
        body: "Disconnect whenever you like. Your Minds keep everything they learned, and the Skills stay equipped.",
    },
];

export default function HowItWorksPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <SiteNav current="How it works" />

            {/* ---------- HERO ---------- */}
            <section className="pt-24">
                <div className="max-w-[1160px] mx-auto px-8">
                    <Eyebrow>How it works</Eyebrow>
                    <h1 className="text-hero font-semibold text-balance mt-4.5 max-w-[14ch]">
                        Live in ten minutes.
                    </h1>
                    <p className="text-lead text-zinc-400 mt-5 max-w-[62ch]">
                        Five steps from an empty account to a working moderation layer. You
                        create the Minds, you name them, and they stay on your key — setup
                        only assigns the roles and equips the Skills.
                    </p>
                </div>
            </section>

            {/* ---------- STEPS ----------
                Numbered because this is a real sequence: you cannot assign roles
                before the key is connected, or bind a community before the roles
                exist. Numbering elsewhere on the site was removed precisely
                because it was ordering sets that had no order. */}
            <section className="pt-16 pb-26">
                <div className="max-w-[1160px] mx-auto px-8 border-t border-zinc-900">
                    {STEPS.map((s) => (
                        <div
                            key={s.n}
                            className="grid lg:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-6 lg:gap-12 py-12 border-b border-zinc-900"
                        >
                            <span className="font-mono text-label tracking-[0.12em] text-zinc-600 lg:pt-2">
                                {s.n}
                            </span>

                            <div>
                                <h2 className="text-title font-semibold">{s.title}</h2>
                                <p className="text-body text-zinc-400 mt-3.5 max-w-[54ch]">
                                    {s.body}
                                </p>
                                <p className="text-meta text-zinc-600 mt-3">{s.detail}</p>
                            </div>

                            {/* The visual column stays in the grid even when a step
                                has nothing to show, so all five rows keep the same
                                three-column rhythm rather than one collapsing. */}
                            <div className="lg:pt-1">{s.visual}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---------- WHAT HAPPENS AFTER ---------- */}
            <section className="py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="After activation"
                        title={
                            <>
                                It is worth more in month two
                                <br />
                                than in week one.
                            </>
                        }
                        lead="Nothing here is configured into place. The roles start with your rules and accumulate the rest from your community, so the useful version arrives by running rather than by setup."
                    />

                    <div className="grid md:grid-cols-3 gap-px mt-14 bg-zinc-900 border border-zinc-900">
                        {PHASES.map((p) => (
                            <div key={p.label} className="bg-zinc-950 px-7 pt-7 pb-8">
                                <span className="font-mono text-label tracking-[0.16em] uppercase text-zinc-500">
                                    {p.label}
                                </span>
                                <p className="text-body text-zinc-400 mt-4">{p.body}</p>
                            </div>
                        ))}
                    </div>

                    <Kicker className="text-center mt-14">
                        The corrections you make once stay made.
                    </Kicker>
                </div>
            </section>

            {/* ---------- THE FLOW ---------- */}
            <section className="py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead
                        center
                        eyebrow="Once it is running"
                        title={
                            <>
                                One message in.
                                <br />
                                Five roles consulted.
                            </>
                        }
                    />
                    <div className="mt-14 max-w-2xl mx-auto">
                        <FlowDiagram />
                    </div>
                </div>
            </section>

            {/* ---------- OWNERSHIP ---------- */}
            <section className="py-26 border-t border-zinc-900">
                <div className="max-w-[1160px] mx-auto px-8">
                    <SectionHead eyebrow="Ownership" title="You own everything." />
                    <div className="grid md:grid-cols-3 gap-px mt-14 bg-zinc-900 border border-zinc-900">
                        {OWNERSHIP.map((o) => (
                            <div key={o.title} className="bg-zinc-950 px-7 pt-7 pb-8">
                                <h3 className="text-lead font-semibold">{o.title}</h3>
                                <p className="text-body text-zinc-400 mt-3">{o.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

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
                        <p className="relative text-sub text-zinc-400 text-balance mt-3.5 mx-auto max-w-[34ch]">
                            Give your moderation enough memory to understand it.
                        </p>
                        <div className="relative flex flex-wrap gap-3 justify-center mt-7">
                            <PrimaryButton href={PRIMARY_CTA_HREF}>
                                {PRIMARY_CTA_LABEL}
                            </PrimaryButton>
                            <GhostButton href="/keepers">
                                Meet the Keepers <span aria-hidden>→</span>
                            </GhostButton>
                        </div>
                    </div>
                </div>
            </section>

            <SiteFooter />
        </div>
    );
}
