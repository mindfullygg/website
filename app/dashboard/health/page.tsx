"use client";

import { useEffect, useState } from "react";
import { VIGILS } from "@/types";
// No recharts import. Every chart on this page plotted invented numbers, and
// none of the series had a source to be filled in from: nothing counts members,
// nothing computes sentiment, retention is not derivable, and a flag *rate*
// needs a message denominator that is not stored. What is left reports only
// what the health Vigil actually said. Charts return when there is something to
// plot — the escalation store can give real incident counts, which is the
// nearest candidate.
import { VigilIcon } from "@/components/vigils";
import { toPlainText } from "@/lib/normalize";

// **`toPlainText` is not optional.** Minds return `<p>` and `<br>` regardless
// of what the prompt asks, and CLAUDE.md's rule is that a new display surface
// must normalise exactly like a new adapter — otherwise the tags render
// literally. The backslash-unescape is the display-boundary half that
// `toPlainText` deliberately leaves alone, since it also runs on the parse path.
//
// There was a "Live pulse" panel here that asked the health Vigil directly, on
// a button, and it is gone. Not because it failed — because it worked. All
// three live prompts on /api/dashboard/health ask Mira to report on a community
// while telling it nothing about that community, and the published Skill
// forbids inventing what it was not given, so the honest reply is a refusal
// every time:
//
//     There is no current state in this prompt to report on … I have stopped at
//     the edge of what was actually given to me.
//
// Those prompts were written for a Mind that would answer anything, expecting
// it to hold member counts and sentiment in its head. That is
// agent-memory-as-database, which CLAUDE.md rules out — state goes in Redis, a
// Vigil is for judgment. The endpoint was always broken; fabrication was hiding
// it. The digest works precisely because it queries four roles first and hands
// Mira their summaries: it supplies the state.
function cleanForDisplay(raw: string): string {
    return toPlainText(raw).replace(/\\(["'])/g, "$1");
}

// --- Daily digest ---
//
// The 09:00 UTC cron's report, read from Redis. Free and instant — no Vigil
// call — so it loads on mount.
//
// UTC, not local. Vercel evaluates a cron expression in UTC whatever the
// deployment region is, and `vercel.json` pins `regions: ["fra1"]` — which sets
// where the function runs, not when. So `0 9 * * *` in Frankfurt is 11:00 local
// in summer and 10:00 in winter, and the copy says UTC so nobody reconciles a
// missing digest against the wrong clock.
//
// Everything a creator sees here was paid for once, by the cron, rather than
// per viewer. Before the digest was stored it was generated every morning at
// five Vigil calls per creator and discarded, because Vercel Cron drops
// response bodies.
function DailyDigest() {
    const [digest, setDigest] = useState<{
        report: string;
        generatedAt: string;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/dashboard/health?type=stored")
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d?.digests) && d.digests[0]) {
                    setDigest(d.digests[0]);
                }
                if (typeof d?.note === "string") setNote(d.note);
            })
            .catch(() => setNote("Could not read stored digests."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="mb-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <div className="h-3 w-32 rounded bg-zinc-800 animate-pulse" />
            </div>
        );
    }

    if (!digest) {
        return (
            <div className="mb-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <p className="text-sm font-medium text-zinc-200">Daily digest</p>
                <p className="text-xs text-zinc-400 mt-1">
                    {note ?? "No digest yet. The first one runs at 09:00 UTC."}
                </p>
            </div>
        );
    }

    return (
        <div className="mb-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium text-zinc-200">Daily digest</p>
                <p className="text-xs text-zinc-500 shrink-0">
                    {new Date(digest.generatedAt).toLocaleString()}
                </p>
            </div>
            {/* Stored raw, cleaned here — see cleanForDisplay. */}
            <p className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap leading-relaxed">
                {cleanForDisplay(digest.report)}
            </p>
        </div>
    );
}


// Alerts: the renderer is kept, the sample data is not.
//
// Two mock alerts used to seed this. Both were invented and both were the most
// convincing thing on the page — specific figures ("dropped 45% since Monday"),
// a narrative ("a rug pull incident"), and timestamps computed as `now - 4h`
// so they always looked freshly generated. Neither could ever have fired:
// sentiment is not measured, and nothing tracks how long a member has been
// quiet.
//
// The list is empty rather than deleted because alerts are a real thing this
// role is asked for — the dashboard route already has a `?type=alerts` prompt,
// and the stored digest is a plausible source. Emptying it costs nothing and
// keeps the surface ready; deleting it would mean rebuilding the banner, the
// acknowledge path and the severity styling later from nothing.
//
// Typed rather than inferred: an empty literal infers `never[]`, and the
// renderer handles the whole severity range on purpose because a real feed will
// carry it. The range belongs in the type, not in whatever samples happen to
// exist.
interface HealthAlert {
    id: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    recommendation: string;
    timestamp: string;
    acknowledged: boolean;
}

const alerts: HealthAlert[] = [];



function SeverityDot({ severity }: { severity: string }) {
    const color =
        severity === "critical"
            ? "#EF4444"
            : severity === "high"
                ? "#F59E0B"
                : severity === "medium"
                    ? "#3B82F6"
                    : "#6B7280";
    return (
        <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
        />
    );
}


export default function HealthPage() {
    const [alertsState, setAlertsState] = useState(alerts);

    const acknowledgeAlert = (id: string) => {
        setAlertsState((prev) =>
            prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
        );
    };

    const activeAlerts = alertsState.filter((a) => !a.acknowledged);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <VigilIcon name="mira" />
                    <div>
                        <h1 className="text-2xl font-bold">Health pulse</h1>
                        <p className="text-zinc-300 mt-0.5">
                            <span style={{ color: VIGILS.mira.color }}>Health Pulse</span> — community
                            health monitoring
                        </p>
                    </div>
                </div>
                {/* No range toggle. There was a 7d/30d one, and `timeRange` was
                    read in exactly one place — to style the selected button.
                    A control that looks like it filters and does not is worse
                    than no control. There is now nothing on this page a range
                    would apply to either; it returns with the first real
                    series. */}
            </div>

            <DailyDigest />

            {/* Alerts banner */}
            {activeAlerts.length > 0 && (
                <div className="mb-6 space-y-2">
                    {activeAlerts.map((alert) => (
                        <div
                            key={alert.id}
                            className="flex items-start gap-3 p-4 rounded-xl border"
                            style={{
                                backgroundColor:
                                    alert.severity === "high" ? "#F59E0B10" : "#3B82F610",
                                borderColor:
                                    alert.severity === "high" ? "#F59E0B30" : "#3B82F630",
                            }}
                        >
                            <SeverityDot severity={alert.severity} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-200">
                                    {alert.title}
                                </p>
                                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                                    {alert.description}
                                </p>
                                <p className="text-xs text-zinc-400 mt-1.5">
                                    → {alert.recommendation}
                                </p>
                            </div>
                            <button
                                onClick={() => acknowledgeAlert(alert.id)}
                                className="text-xs text-zinc-400 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-800 hover:bg-zinc-800 transition-colors flex-shrink-0"
                            >
                                Acknowledge
                            </button>
                        </div>
                    ))}
                </div>
            )}

        </div>
    );
}
