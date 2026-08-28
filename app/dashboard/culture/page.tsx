"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, EmptyState, MetricCard, Skeleton } from "@/components/vigils";

interface CultureCommunity {
    communityId: string;
    platform: string;
    language?: string;
    cultureNotes?: string;
}

interface CultureData {
    communities: CultureCommunity[];
    calls24h: number;
    avgMs: number | null;
}

/** A count, or an em dash while it is unknown. Same rule as the Welcomes page. */
function count(value: number | undefined): string {
    return typeof value === "number" ? value.toLocaleString() : "—";
}

/**
 * What the culture keeper was told, and how often it was asked. Not what it
 * has learned.
 *
 * That distinction is the whole page. It previously rendered two hardcoded
 * empty states — "No norms learned yet" and "No vocabulary tracked yet" — with
 * no fetch behind either. They were not empty because there was no data; they
 * were string literals, and would have kept saying "none" after the role had
 * learned hundreds. A permanent false negative is worse than a mock, because
 * nothing about it ever looks wrong.
 *
 * "Community Vocabulary" went entirely. No prompt asks for vocabulary, no key
 * stores it, and it is not in the Skill draft either — it described a
 * capability that did not exist at any layer.
 *
 * What replaces them is small and true:
 *
 * - **The creator's description**, `cultureNotes`. Already stored, already the
 *   authoritative block in every culture prompt. Showing it here is not
 *   decoration: `handleMessage` runs only after the pre-filter flags a message,
 *   so an undescribed community is judged on its incidents alone, and this is
 *   the page where that should be visible.
 * - **Calls in the last 24 hours**, from the hourly buckets in
 *   lib/swarm-metrics.ts — what this app asked of the role, which is not the
 *   Mind's cognition spend. See the SCOPE note in that file.
 *
 * Learned norms are absent because nothing writes them down. They would have to
 * be recorded as structured records when formed, not recited by a Mind on
 * request — see the route's own comment.
 */
export default function CulturePage() {
    const [data, setData] = useState<CultureData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/dashboard/culture")
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d?.communities)) setData(d);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const described = data?.communities.filter((c) => c.cultureNotes) ?? [];
    const undescribed = data?.communities.filter((c) => !c.cultureNotes) ?? [];

    return (
        <div>
            <PageHeader
                title="Culture"
                description="community norms & language"
                vigil="sage"
            />

            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 className="text-lg font-semibold">
                            What you&rsquo;ve described
                        </h2>
                        <Link
                            href="/dashboard/settings"
                            className="text-sm text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 rounded"
                        >
                            Edit in Settings
                        </Link>
                    </div>

                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-28 w-full rounded-xl" />
                            <Skeleton className="h-28 w-full rounded-xl" />
                        </div>
                    ) : data && data.communities.length === 0 ? (
                        <EmptyState
                            message="No communities connected"
                            sub="Connect one in Onboarding, then describe it here"
                        />
                    ) : !data ? (
                        <EmptyState
                            message="Could not load your communities"
                            sub="Reload the page, or check that your swarm is connected"
                        />
                    ) : (
                        <div className="space-y-3">
                            {described.map((c) => (
                                <div
                                    key={c.communityId}
                                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs uppercase tracking-wide text-zinc-400">
                                            {c.platform}
                                        </span>
                                        <span className="font-mono text-sm text-zinc-300">
                                            {c.communityId}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                            {c.language ?? "lang: inferred"}
                                        </span>
                                    </div>
                                    {/* whitespace-pre-wrap: the creator wrote
                                        this in a textarea and their line breaks
                                        are part of what they said. */}
                                    <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                                        {c.cultureNotes}
                                    </p>
                                </div>
                            ))}

                            {undescribed.map((c) => (
                                <div
                                    key={c.communityId}
                                    className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs uppercase tracking-wide text-zinc-400">
                                            {c.platform}
                                        </span>
                                        <span className="font-mono text-sm text-zinc-300">
                                            {c.communityId}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-200">
                                            not described
                                        </span>
                                    </div>
                                    <p className="text-sm text-amber-200/90 mt-2 leading-relaxed">
                                        The culture keeper has no account of this
                                        community except the messages the filter
                                        flagged &mdash; which are all incidents.
                                        Describe it so its read is not built from
                                        those alone.
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="text-lg font-semibold mb-4">Keeper activity</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                        <MetricCard
                            label="Calls, last 24h"
                            value={loading ? "—" : count(data?.calls24h)}
                            sub="asked by this app"
                        />
                        <MetricCard
                            label="Average reply"
                            value={
                                loading || !data
                                    ? "—"
                                    : data.avgMs === null
                                        ? "—"
                                        : `${(data.avgMs / 1000).toFixed(1)}s`
                            }
                            sub="round trip, when called"
                        />
                    </div>
                </div>
            </div>

            <p className="text-sm text-zinc-400 mt-6 max-w-3xl border-l-2 border-zinc-700 pl-3">
                This page shows what the culture keeper was told and how often it
                was asked &mdash; not the norms it has formed. Those live in the
                Mind&rsquo;s own memory, and nothing writes them down as records
                this app can read back, so any list of them here would have to be
                asked for fresh and could not be relied on. Call counts are what
                this app requested; they are not the Mind&rsquo;s credit spend,
                which also covers your own conversations with it.
            </p>
        </div>
    );
}
