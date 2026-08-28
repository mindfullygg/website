"use client";

import {
    useState,
    useEffect,
    useCallback,
    useRef,
    useSyncExternalStore,
} from "react";
import {
    VIGILS,
    getTrustTier,
    getTrustColor,
    type EscalationPacket,
    type ModerationAction,
} from "@/types";
import { VigilIcon } from "@/components/vigils";

// --- Data loading ---

/**
 * How often to ask whether anything changed. Deliberately not faster: Upstash
 * bills per command and a poll runs whether or not anything is happening. One
 * tab at 5s would exceed the free tier's monthly budget on its own; at 30s it
 * costs ~86K/month. The poll hits `?type=count`, a single ZCARD, and only
 * refetches packets when the number actually moves.
 */
const POLL_MS = 30_000;

type OverrideDecision =
    | "approve"
    | "override_safe"
    | "override_action"
    | "dismiss";

async function getJson(url: string) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    return body;
}

// --- Components ---

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
}

/** Trust score is a best-effort parse of the trust keeper's prose, so it can be absent.
 *  Absent is not zero — say so rather than implying a score of 0. */
function TrustBadge({ score }: { score: number | null }) {
    if (score === null) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
                trust unknown
            </span>
        );
    }

    const tier = getTrustTier(score);
    const color = getTrustColor(score);
    return (
        <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md"
            style={{ backgroundColor: color + "20", color }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
            />
            {score} · {tier}
        </span>
    );
}

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    const color =
        value >= 0.7 ? "#10B981" : value >= 0.4 ? "#F59E0B" : "#EF4444";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
            <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
        </div>
    );
}

/**
 * The wall clock, as an external store.
 *
 * Reading `Date.now()` during render is impure and mismatches on hydration.
 * The snapshot is bucketed to the minute so it stays stable between ticks, and
 * the server snapshot is null so nothing time-dependent is prerendered.
 */
function useMinuteTick(): number | null {
    return useSyncExternalStore(
        (onChange) => {
            const id = setInterval(onChange, 60_000);
            return () => clearInterval(id);
        },
        () => Math.floor(Date.now() / 60_000),
        () => null
    );
}

function TimeAgo({ timestamp }: { timestamp: string }) {
    const minute = useMinuteTick();
    if (minute === null) return <span className="text-xs text-zinc-500" />;

    const mins = Math.floor(
        (minute * 60_000 - new Date(timestamp).getTime()) / 60_000
    );
    const display =
        mins < 1
            ? "just now"
            : mins < 60
                ? `${mins}m ago`
                : `${Math.floor(mins / 60)}h ago`;

    return <span className="text-xs text-zinc-500">{display}</span>;
}

function ContextBlock({
    label,
    color,
    body,
}: {
    label: string;
    color: string;
    body: string | null;
}) {
    return (
        <div className="rounded-lg bg-zinc-800/30 border border-zinc-800 p-3">
            <p
                className="text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color }}
            >
                {label}
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {body ?? "Redacted when this escalation was resolved."}
            </p>
        </div>
    );
}

function EscalationCard({
    escalation,
    busy,
    onResolve,
}: {
    escalation: EscalationPacket;
    busy: boolean;
    onResolve: (
        id: string,
        decision: OverrideDecision,
        action: ModerationAction,
        reasoning: string
    ) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [overrideAction, setOverrideAction] = useState<ModerationAction>("warn");
    const [creatorReasoning, setCreatorReasoning] = useState("");
    const [showOverridePanel, setShowOverridePanel] = useState(false);

    const isResolved = escalation.status !== "pending";
    const kiraColor = VIGILS.kira.color;

    return (
        <div
            className={`rounded-xl border bg-zinc-900/50 overflow-hidden transition-colors ${isResolved ? "border-zinc-800/50 opacity-60" : "border-zinc-700"
                }`}
        >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-zinc-400">
                            #{escalation.channel}
                        </span>
                        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                            {escalation.platform}
                        </span>
                        <TimeAgo timestamp={escalation.messageTimestamp} />
                        {isResolved && (
                            <span className="text-sm font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">
                                {escalation.status}
                            </span>
                        )}
                    </div>

                    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 mb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300">
                                {escalation.authorDisplayName[0] ?? "?"}
                            </div>
                            <span className="text-sm font-medium text-zinc-300">
                                {escalation.authorDisplayName}
                            </span>
                            <TrustBadge score={escalation.trustScore} />
                        </div>
                        {escalation.messageContent !== null ? (
                            <p className="text-sm text-zinc-200 leading-relaxed">
                                &ldquo;{escalation.messageContent}&rdquo;
                            </p>
                        ) : (
                            <p className="text-sm text-zinc-400 italic leading-relaxed">
                                Message content removed on resolution — only the
                                decision is retained.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* The moderator's assessment */}
            <div className="px-5 pb-4">
                <div className="flex items-start gap-2 mb-3">
                    <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: kiraColor + "25", color: kiraColor }}
                    >
                        K
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: VIGILS.kira.textColor }}>
                            Moderator&apos;s assessment
                        </p>
                        <p className="text-sm text-zinc-300 mt-1 leading-relaxed whitespace-pre-wrap">
                            {escalation.reasoning}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-zinc-400">Suggested:</span>
                            <span
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{ backgroundColor: kiraColor + "20", color: VIGILS.kira.textColor }}
                            >
                                {escalation.suggestedAction} · {escalation.classification}
                            </span>
                            <div className="w-20">
                                <ConfidenceBar value={escalation.confidence} />
                            </div>
                        </div>
                        {isResolved && escalation.creatorDecision && (
                            <p className="text-sm text-zinc-400 mt-2">
                                Creator: {escalation.creatorDecision}
                                {escalation.actionTaken
                                    ? ` → ${escalation.actionTaken}`
                                    : ""}
                                {escalation.creatorReasoning
                                    ? ` — ${escalation.creatorReasoning}`
                                    : ""}
                            </p>
                        )}
                    </div>
                </div>

                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors mb-3"
                >
                    {expanded ? "▾ Hide context" : "▸ Show full context"}
                </button>

                {expanded && (
                    <div className="space-y-3 mb-4">
                        <ContextBlock
                            label="Trust context"
                            color={VIGILS.vera.color}
                            body={escalation.veraContext}
                        />
                        <ContextBlock
                            label="Cultural context"
                            color={VIGILS.sage.color}
                            body={escalation.sageContext}
                        />
                    </div>
                )}

                {/* Action buttons */}
                {!isResolved && (
                    <>
                        {!showOverridePanel ? (
                            <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                                <button
                                    disabled={busy}
                                    onClick={() =>
                                        onResolve(escalation.id, "approve", "none", "")
                                    }
                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                                >
                                    ✓ Approve this call
                                </button>
                                <button
                                    disabled={busy}
                                    onClick={() => setShowOverridePanel(true)}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                                >
                                    ✎ Override
                                </button>
                                <button
                                    disabled={busy}
                                    onClick={() =>
                                        onResolve(escalation.id, "dismiss", "none", "")
                                    }
                                    className="py-2.5 px-3 rounded-lg text-sm font-medium text-zinc-300 border border-zinc-800 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                                >
                                    Dismiss
                                </button>
                            </div>
                        ) : (
                            <div className="pt-3 border-t border-zinc-800 space-y-3">
                                <p className="text-xs font-medium text-zinc-300">
                                    Override decision
                                </p>

                                <div className="flex gap-2">
                                    {/* Selected styles are written out in full:
                                        Tailwind only sees literal class strings,
                                        so an interpolated `bg-${hue}-500/20`
                                        would silently produce no CSS. */}
                                    {(
                                        [
                                            [
                                                "none",
                                                "It's fine",
                                                "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                                            ],
                                            [
                                                "warn",
                                                "Warn",
                                                "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                            ],
                                            [
                                                "mute",
                                                "Mute",
                                                "bg-red-500/20 text-red-400 border-red-500/30",
                                            ],
                                        ] as const
                                    ).map(([value, label, selectedClass]) => (
                                        <button
                                            key={value}
                                            onClick={() => setOverrideAction(value)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${overrideAction === value
                                                ? selectedClass
                                                : "text-zinc-400 border-zinc-800 hover:bg-zinc-800"
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    value={creatorReasoning}
                                    onChange={(e) => setCreatorReasoning(e.target.value)}
                                    placeholder="Why? (the swarm learns from this for next time)"
                                    rows={2}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 resize-none"
                                />

                                <div className="flex gap-2">
                                    <button
                                        disabled={busy}
                                        onClick={() =>
                                            onResolve(
                                                escalation.id,
                                                overrideAction === "none"
                                                    ? "override_safe"
                                                    : "override_action",
                                                overrideAction,
                                                creatorReasoning
                                            )
                                        }
                                        className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-colors disabled:opacity-40"
                                    >
                                        {busy ? "Submitting…" : "Submit override"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowOverridePanel(false);
                                            setCreatorReasoning("");
                                        }}
                                        className="py-2 px-4 rounded-lg text-xs text-zinc-400 border border-zinc-800 hover:bg-zinc-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// --- Page ---

export default function ModerationPage() {
    const [pending, setPending] = useState<EscalationPacket[]>([]);
    const [resolved, setResolved] = useState<EscalationPacket[]>([]);
    const [filter, setFilter] = useState<"all" | "pending" | "resolved">("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    /** Last pending count seen, so a poll only refetches when it moves. */
    const lastCount = useRef<number | null>(null);

    /** Fetch only — no state writes, so it is safe to call from anywhere. */
    const fetchQueues = useCallback(async () => {
        const [p, h] = await Promise.all([
            getJson("/api/dashboard/escalations?type=pending"),
            getJson("/api/dashboard/escalations?type=history"),
        ]);
        return {
            pending: (p.escalations ?? []) as EscalationPacket[],
            resolved: (h.escalations ?? []) as EscalationPacket[],
            total: (p.pendingTotal ?? p.escalations?.length ?? 0) as number,
        };
    }, []);

    const load = useCallback(async () => {
        try {
            const data = await fetchQueues();
            setPending(data.pending);
            setResolved(data.resolved);
            lastCount.current = data.total;
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [fetchQueues]);

    // Initial load. Guarded against unmount so a slow response cannot write
    // state into a component that is already gone.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const data = await fetchQueues();
                if (cancelled) return;
                setPending(data.pending);
                setResolved(data.resolved);
                lastCount.current = data.total;
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fetchQueues]);

    // Poll the cheap count endpoint; only reload packets when it changes, and
    // never while the tab is hidden — a backgrounded dashboard should cost
    // nothing.
    useEffect(() => {
        const id = setInterval(async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const { count } = await getJson(
                    "/api/dashboard/escalations?type=count"
                );
                if (count !== lastCount.current) await load();
            } catch {
                // A failed poll is not worth surfacing; the next one may work.
            }
        }, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    const handleResolve = useCallback(
        async (
            id: string,
            decision: OverrideDecision,
            action: ModerationAction,
            reasoning: string
        ) => {
            setResolvingId(id);
            try {
                const res = await fetch("/api/orchestrator/override", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        escalationId: id,
                        decision,
                        action,
                        reasoning,
                    }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error ?? "Override failed");

                if (body.learningTriggered === false) {
                    setError(
                        "Decision recorded, but the swarm could not be updated."
                    );
                } else if (
                    (action === "warn" || action === "mute") &&
                    body.actionExecuted === false
                ) {
                    setError(`Decision recorded, but the ${action} did not reach the platform.`);
                } else {
                    setError(null);
                }

                await load();
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setResolvingId(null);
            }
        },
        [load]
    );

    const all = [...pending, ...resolved];
    const filtered =
        filter === "pending" ? pending : filter === "resolved" ? resolved : all;

    const overrideRate = resolved.length
        ? `${Math.round(
            (resolved.filter((e) => e.creatorDecision !== "approve").length /
                resolved.length) *
            100
        )}%`
        : "—";

    return (
        <div>
            {/* Header */}
            <div className="mb-8 flex items-center gap-3">
                <VigilIcon name="kira" />
                <div>
                    <h1 className="text-2xl font-bold">Moderation</h1>
                    <p className="text-zinc-300 mt-0.5">
                        <span style={{ color: VIGILS.kira.color }}>Moderator</span> —
                        escalation &amp; decisions
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <StatCard label="Pending" value={pending.length} />
                <StatCard label="Resolved" value={resolved.length} />
                <StatCard label="Override rate" value={overrideRate} />
            </div>

            {/* Filter tabs */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Escalation queue</h2>
                <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
                    {(["all", "pending", "resolved"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === f
                                ? "bg-zinc-800 text-zinc-200"
                                : "text-zinc-400 hover:text-zinc-300"
                                }`}
                        >
                            {f === "all"
                                ? `All (${all.length})`
                                : f === "pending"
                                    ? `Pending (${pending.length})`
                                    : `Resolved (${resolved.length})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Escalation cards */}
            {loading ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
                    <p className="text-zinc-500">Loading the queue…</p>
                </div>
            ) : filtered.length > 0 ? (
                <div className="space-y-4">
                    {filtered.map((esc) => (
                        <EscalationCard
                            key={esc.id}
                            escalation={esc}
                            busy={resolvingId === esc.id}
                            onResolve={handleResolve}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
                    <p className="text-zinc-500">
                        {filter === "resolved"
                            ? "Nothing resolved yet."
                            : "Nothing needs you right now — the moderator is handling it."}
                    </p>
                </div>
            )}
        </div>
    );
}
