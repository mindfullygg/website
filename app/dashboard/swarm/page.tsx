"use client";

import { useState, useEffect } from "react";
import { VIGILS, type VigilName } from "@/types";
import {
    CircleUser,
    Hash,
    Network,
    Send,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import { VIGIL_ICONS } from "@/components/vigils";

// --- Types ---

interface ActivityEvent {
    id: string;
    timestamp: string;
    from: VigilName | "orchestrator" | "creator" | "discord" | "telegram";
    to: VigilName | "orchestrator" | "creator" | "discord" | "telegram";
    type: "query" | "response" | "update" | "alert" | "action" | "learning";
    summary: string;
    duration?: number;
}

interface AgentStatus {
    name: VigilName;
    online: boolean;
    /** Vigil calls in the window, from our own Redis counters. */
    calls: number;
    /** Cognition spent in the window, from the Mind. Null when unreadable. */
    spent24h: number | null;
    /** Balance remaining. Null when unreadable. */
    credits: number | null;
}

const VIGIL_ORDER: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

// --- Helpers ---

/**
 * Two colours per node, because the tint behind a mark and the mark itself have
 * different jobs.
 *
 * `bg` is the brand colour, only ever used at low alpha behind something. `fg`
 * is the mark, and has to be readable: the trust keeper's `#1E3A5F` measures
 * **1.54:1** on this panel and the health role's `#5B2E91` **1.89:1**, both far
 * under the 3:1 floor — which is why those two icons were barely visible while
 * the other three were fine.
 *
 * Same fix as the sidebar; this map was simply missed. Anywhere a role colour
 * lands on text or a glyph, it must be `textColor`.
 */
const nodeColors: Record<string, { bg: string; fg: string }> = {
    vera: { bg: VIGILS.vera.color, fg: VIGILS.vera.textColor },
    sage: { bg: VIGILS.sage.color, fg: VIGILS.sage.textColor },
    kira: { bg: VIGILS.kira.color, fg: VIGILS.kira.textColor },
    mira: { bg: VIGILS.mira.color, fg: VIGILS.mira.textColor },
    nova: { bg: VIGILS.nova.color, fg: VIGILS.nova.textColor },
    orchestrator: { bg: "#71717a", fg: "#a1a1aa" },
    creator: { bg: "#e4e4e7", fg: "#e4e4e7" },
    discord: { bg: "#5865F2", fg: "#949BF9" },
    telegram: { bg: "#26A5E4", fg: "#26A5E4" },
};

/**
 * Icon per node in the feed.
 *
 * Roles come from `VIGIL_ICONS`, so a node here and its sidebar entry are the
 * same mark. The platforms use generic lucide icons rather than brand logos —
 * `Send` is the paper plane Telegram is known by and `Hash` is how a Discord
 * channel is written, so both read correctly without reproducing a trademark,
 * and they stay on the same 24px grid and stroke weight as everything else.
 */
const nodeIcons: Record<string, LucideIcon> = {
    vera: VIGIL_ICONS.vera,
    sage: VIGIL_ICONS.sage,
    kira: VIGIL_ICONS.kira,
    mira: VIGIL_ICONS.mira,
    nova: VIGIL_ICONS.nova,
    orchestrator: Workflow,
    creator: CircleUser,
    discord: Hash,
    telegram: Send,
};

const nodeNames: Record<string, string> = {
    vera: "Trust Keeper",
    sage: "Culture Learner",
    kira: "Moderator",
    mira: "Health Pulse",
    nova: "Community Guide",
    orchestrator: "Orchestrator",
    creator: "Creator",
    discord: "Discord",
    telegram: "Telegram",
};

/**
 * One node in the feed: its icon on a tint of its colour.
 *
 * `className="block"` on the icon is load-bearing. Lucide renders an `<svg>`,
 * which is inline by default and therefore sits on the text baseline — inside a
 * circle that reads as the icon being pushed down and slightly off centre.
 * Making it a block takes it off the baseline so the flex centring is the only
 * thing positioning it.
 *
 * The icon is also floored at 12px: at 18px the 0.6 ratio rounded to 11, and a
 * 24px-grid glyph at 11px lands its strokes between pixels.
 */
function NodeBubble({ node, size = 24 }: { node: string; size?: number }) {
    const colour = nodeColors[node] ?? { bg: "#71717a", fg: "#a1a1aa" };
    const Icon = nodeIcons[node] ?? Workflow;
    return (
        <div
            className="rounded-full flex items-center justify-center flex-shrink-0 leading-none"
            style={{
                width: size,
                height: size,
                backgroundColor: colour.bg + "30",
                color: colour.fg,
            }}
            title={nodeNames[node]}
        >
            <Icon
                className="block"
                size={Math.max(12, Math.round(size * 0.58))}
                strokeWidth={2}
                aria-hidden
            />
        </div>
    );
}

const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
    query: { bg: "#3B82F620", text: "#60A5FA", label: "query" },
    response: { bg: "#10B98120", text: "#34D399", label: "response" },
    update: { bg: "#8B5CF620", text: "#A78BFA", label: "update" },
    alert: { bg: "#F59E0B20", text: "#FBBF24", label: "alert" },
    action: { bg: "#06B6D420", text: "#22D3EE", label: "action" },
    learning: { bg: "#EC489920", text: "#F472B6", label: "learning" },
};

function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
}

// --- Components ---

/**
 * No "last action" line.
 *
 * Four of the five roles are notified fire-and-forget and their replies
 * discarded, so nothing records what they last did. Those four carried sample
 * text — dimmed, italic, tooltipped — and the moderator carried a real decision
 * read from the escalation store.
 *
 * Removed together, including the real one. A single true line sitting in the
 * same slot as four invented ones does not read as the true one; it reads as a
 * row of five, and the dimming that separated them is a styling detail a person
 * scanning five cards will not weigh. Better to show no last action than to ask
 * the reader to notice which of five is measured.
 *
 * The moderator's line can come back on its own terms. It came from
 * `latestModeration` in lib/escalations.ts, which now has no caller — kept
 * because a decision history is worth showing on the Moderation page, where
 * there is room for when and which channel. The Health page already does the
 * equivalent: it shows the real stored digest rather than a one-line sample.
 */
function AgentStatusCard({
    agent,
    live,
}: {
    agent: AgentStatus;
    live: boolean;
}) {
    const v = VIGILS[agent.name];
    const RoleIcon = VIGIL_ICONS[agent.name];
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 relative overflow-hidden">
            <div
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-12 rounded-full blur-2xl opacity-20"
                style={{ backgroundColor: v.color }}
            />
            <div className="flex items-center gap-3 mb-3 relative">
                <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: v.color + "30", color: v.textColor }}
                >
                    {/* `v.icon` is a lucide export name, not a glyph. Rendered
                        directly it printed the word "Users" over the title. */}
                    <RoleIcon size={19} strokeWidth={1.75} aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: v.textColor }}>
                            {v.role}
                        </p>
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                                backgroundColor: agent.online ? "#10B981" : "#EF4444",
                            }}
                        />
                    </div>
                    <p className="text-xs text-zinc-400">{v.tagline}</p>
                </div>
            </div>
            {/* Two real numbers rather than three, one of them invented. The
                cognition column came from a literal in this file — a plausible
                figure beside two measured ones is the worst of both, because
                nothing on screen says which is which. */}
            {/* All three measured: calls from our own Redis counters, spend and
                credits straight from the Mind. The column that used to sit here
                held a literal from this file. */}
            <div className="grid grid-cols-3 gap-2 relative">
                <div className="bg-zinc-800/50 rounded px-2 py-1.5">
                    <p className="text-xs text-zinc-500">Calls</p>
                    <p className="text-sm font-medium text-zinc-200">
                        {live ? agent.calls : "—"}
                    </p>
                </div>
                <div className="bg-zinc-800/50 rounded px-2 py-1.5">
                    <p className="text-xs text-zinc-500">Spent</p>
                    <p className="text-sm font-medium text-zinc-200">
                        {agent.spent24h == null
                            ? "—"
                            : Math.round(agent.spent24h).toLocaleString()}
                    </p>
                </div>
                <div className="bg-zinc-800/50 rounded px-2 py-1.5">
                    <p className="text-xs text-zinc-500">Credits</p>
                    <p className="text-sm font-medium text-zinc-200">
                        {agent.credits == null
                            ? "—"
                            : Math.round(agent.credits).toLocaleString()}
                    </p>
                </div>
            </div>
        </div>
    );
}

function FeedEvent({ event }: { event: ActivityEvent }) {
    const style = typeStyles[event.type];
    const fromColor = (nodeColors[event.from] ?? { bg: "#71717a" }).bg;
    const toColor = (nodeColors[event.to] ?? { bg: "#71717a" }).bg;

    return (
        <div className="flex items-start gap-3 py-3 border-b border-zinc-800/50 last:border-0">
            {/* From node */}
            <div className="mt-0.5">
                <NodeBubble node={event.from} />
            </div>

            {/* Arrow */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-1.5">
                <div
                    className="w-4 h-px"
                    style={{ backgroundColor: fromColor + "60" }}
                />
                <span className="text-zinc-500 text-xs">→</span>
                <div
                    className="w-4 h-px"
                    style={{ backgroundColor: toColor + "60" }}
                />
            </div>

            {/* To node */}
            <div className="mt-0.5">
                <NodeBubble node={event.to} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: style.bg, color: style.text }}
                    >
                        {style.label}
                    </span>
                    {event.duration && (
                        <span className="text-xs text-zinc-500">
                            {event.duration}ms
                        </span>
                    )}
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                    {event.summary}
                </p>
            </div>

            {/* Timestamp */}
            <span className="text-xs text-zinc-500 flex-shrink-0 mt-1">
                {timeAgo(event.timestamp)}
            </span>
        </div>
    );
}

// --- Page ---

export default function SwarmPage() {
    // Real: calls and mean latency per role over the last 24h, and whether each
    // Mind is actually reachable. Everything else on this page is still sample
    // data and is labelled as such — mixing the two without saying which is
    // which is worse than showing neither.
    const [live, setLive] = useState<{
        agents: {
            name: VigilName;
            online: boolean;
            credits: number | null;
            cognition24h: number | null;
        }[];
        metrics: Record<VigilName, { calls: number; avgMs: number | null }>;
        feed: ActivityEvent[];
    } | null>(null);

    useEffect(() => {
        fetch("/api/dashboard/swarm?type=status")
            .then((r) => r.json())
            .then((d) => {
                if (d?.metrics)
                    setLive({
                        agents: d.agents ?? [],
                        metrics: d.metrics,
                        feed: d.feed ?? [],
                    });
            })
            .catch(() => {});
    }, []);

    const [filter, setFilter] = useState<"all" | ActivityEvent["type"]>("all");
    // Named for what it does: gate the 10s feed poll. It was `autoScroll`,
    // from when this feed was mock data that scrolled itself — nothing has
    // scrolled since the feed became real, and `feedRef` went with it.
    const [livePolling, setLivePolling] = useState(true);

    /**
     * Poll the feed while "Live" is on — only the feed.
     *
     * The badge said Live and the page fetched once on mount, which is a claim
     * the UI was not keeping. `type=feed` is one Redis LRANGE, so it is cheap
     * enough to poll; the vitals it sits beside are eleven Minds API calls and
     * are deliberately left to the initial load.
     */
    useEffect(() => {
        if (!livePolling) return;
        const id = setInterval(() => {
            fetch("/api/dashboard/swarm?type=feed")
                .then((r) => r.json())
                .then((d) => {
                    if (Array.isArray(d?.feed)) {
                        setLive((prev) => (prev ? { ...prev, feed: d.feed } : prev));
                    }
                })
                .catch(() => {});
        }, 10_000);
        return () => clearInterval(id);
    }, [livePolling]);
    // Real events, newest first, from `swarm:feed:<creator>` — written on every
    // Vigil call and on the platform moments around them. Empty until the swarm
    // handles something, which is the honest state for a quiet community.
    const feed = live?.feed ?? [];
    const filteredFeed =
        filter === "all" ? feed : feed.filter((e) => e.type === filter);

    const roles = Object.values(live?.metrics ?? {});
    const totalQueries = roles.reduce((sum, m) => sum + m.calls, 0);
    const onlineCount = live?.agents.filter((a) => a.online).length ?? 0;
    const cognition24h = live?.agents.reduce(
        (sum, a) => sum + (a.cognition24h ?? 0),
        0
    );

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Network size={26} strokeWidth={1.75} aria-hidden />
                        Swarm monitor
                    </h1>
                    <p className="text-zinc-300 mt-1">
                        Real-time inter-agent communication and performance
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-zinc-400">
                        {live ? `${onlineCount}/5 online` : "checking…"}
                    </span>
                </div>
            </div>

            {/* Swarm stats */}
            <div className="grid grid-cols-2 gap-4 mb-6 max-w-2xl">
                {[
                    {
                        label: "Calls from this app · last 24h",
                        value: live ? totalQueries.toLocaleString() : "—",
                    },
                    {
                        label: "Cognition spent · last 24h · all sources",
                        value:
                            live && cognition24h !== undefined
                                ? Math.round(cognition24h).toLocaleString()
                                : "—",
                    },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                        <p className="text-xs text-zinc-400">{stat.label}</p>
                        <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* These two numbers measure different things and will not agree.
                Left unexplained, a Mind showing 0 calls and 400 credits spent
                reads as a bug in the counter rather than as work done
                elsewhere. */}
            <p className="text-sm text-zinc-400 mb-8 max-w-2xl border-l-2 border-zinc-700 pl-3">
                <span className="text-zinc-300">These will not match, and that is expected.</span>{" "}
                Calls counts only what this app asked of your Minds. Cognition is
                everything a Mind spent — your own conversations with it, building
                and publishing Skills, running evals, its own scheduled cycles. A
                Mind can spend plenty while this app makes no calls at all.
            </p>

            {/* Agent status cards */}
            <div className="mb-6">
                <h2 className="text-sm font-semibold text-zinc-100 mb-3">
                    Agent stats · last 24h
                </h2>
                <p className="text-sm text-zinc-400 -mt-2 mb-3">
                    Calls are ours; spend and credits are the Mind&apos;s own.
                </p>
                <div className="grid grid-cols-5 gap-3">
                    {VIGIL_ORDER.map((name) => {
                        const m = live?.metrics[name];
                        const vitals = live?.agents.find((a) => a.name === name);
                        return (
                            <AgentStatusCard
                                key={name}
                                agent={{
                                    name,
                                    online: vitals?.online ?? false,
                                    calls: m?.calls ?? 0,
                                    spent24h: vitals?.cognition24h ?? null,
                                    credits: vitals?.credits ?? null,
                                }}
                                live={!!live}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Activity feed */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium">Activity feed</h2>
                        <span className="text-xs text-zinc-500">
                            {filteredFeed.length} events · most recent 100
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Type filters */}
                        <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
                            {/* Only what the swarm emits. `response` is gone:
                                a call is recorded once, with its duration,
                                rather than as a query and a reply — so a
                                `response` chip could only ever say "no events".
                                A filter that can never match is a broken
                                control, not an empty one. */}
                            {(
                                [
                                    "all",
                                    "query",
                                    "update",
                                    "learning",
                                    "action",
                                    "alert",
                                ] as const
                            ).map((f) => {
                                const style =
                                    f === "all"
                                        ? { bg: "", text: "", label: "" }
                                        : typeStyles[f];
                                return (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-sm ${filter === f
                                                ? "bg-zinc-800 text-zinc-200"
                                                : "text-zinc-500 hover:text-zinc-300"
                                            }`}
                                        style={
                                            filter === f && f !== "all"
                                                ? { color: style.text }
                                                : undefined
                                        }
                                    >
                                        {f === "all" ? "All" : f}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Auto-scroll toggle */}
                        <button
                            onClick={() => setLivePolling(!livePolling)}
                            aria-pressed={livePolling}
                            title={
                                livePolling
                                    ? "Refreshing the feed every 10s — click to pause"
                                    : "Paused — click to resume"
                            }
                            className={`inline-flex items-center px-2 py-1 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-sm ${livePolling
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "text-zinc-500 border border-zinc-800"
                                }`}
                        >
                            <span
                                aria-hidden
                                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                                    livePolling
                                        ? "bg-emerald-400 animate-pulse"
                                        : "bg-zinc-600"
                                }`}
                            />
                            Auto-refresh
                        </button>
                    </div>
                </div>

                {/* Feed */}
                <div
                    className="px-5 max-h-[480px] overflow-y-auto"
                    style={{ scrollbarGutter: "stable" }}
                >
                    {filteredFeed.length > 0 ? (
                        filteredFeed.map((event) => (
                            <FeedEvent key={event.id} event={event} />
                        ))
                    ) : (
                        <div className="py-12 text-center text-sm">
                            <p className="text-zinc-400">
                                {!live
                                    ? "Loading activity…"
                                    : feed.length === 0
                                      ? "Nothing yet"
                                      : `No ${filter} events`}
                            </p>
                            {live && feed.length === 0 && (
                                <p className="text-zinc-500 mt-1">
                                    The swarm records what it does here. Most
                                    messages never reach it — the filter handles
                                    those, and they cost nothing.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Feed legend */}
                <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-xs font-medium text-zinc-400">Nodes</span>
                    {Object.entries(nodeNames).map(([key, name]) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <NodeBubble node={key} size={22} />
                            <span className="text-xs text-zinc-300">{name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
