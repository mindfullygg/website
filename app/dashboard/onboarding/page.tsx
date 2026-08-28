"use client";

import { useEffect, useState } from "react";
import { PageHeader, MetricCard } from "@/components/vigils";

/**
 * A count, or an em dash while it is unknown.
 *
 * Never `String(value)` on a field straight off a response: a missing field
 * renders the literal text "undefined", which reads as a crash rather than as
 * an absent value. The em dash matches the loading state deliberately — from a
 * reader's side "not loaded" and "not answered" are the same thing, and a
 * second placeholder like N/A would only add a distinction they cannot act on.
 */
function count(value: number | undefined): string {
    return typeof value === "number" ? value.toLocaleString() : "—";
}

/**
 * Two counters, and deliberately nothing else.
 *
 * This page showed 7-day retention and a "best approach". Neither is knowable:
 * the community guide is told when someone joins and nothing afterwards —
 * `processMessage` never notifies it — so both could only have come from asking
 * a Mind to invent them, and a creator would act on the answer. That is why
 * retention was cut from the Skill body (community-guide/learnings.md §7).
 *
 * It then showed a "recent welcomes" list read from the activity feed. That was
 * dropped too, for reasons the feed's own design makes unavoidable:
 *
 * - The feed is capped at 100 events and shared with every other kind of swarm
 *   activity. Forty flagged messages produce 120 Vigil calls, so welcomes are
 *   pushed out entirely — measured: three welcomes, zero still visible.
 * - A join event carries no channel, so every entry rendered the identical
 *   string. A list of repeated text differing only by timestamp is a count with
 *   extra steps.
 * - Names would have fixed that and cost more than they are worth: the feed has
 *   no per-member delete, so a name written there could not be erased on
 *   request.
 *
 * The counters survive all of it. `welcome:n` lives in its own hourly bucket and
 * the all-time key has no TTL, so neither depends on the feed at all.
 */
export default function WelcomesPage() {
    const [data, setData] = useState<{
        last24h: number;
        last7d: number;
        last30d: number;
        total: number;
    } | null>(null);

    useEffect(() => {
        fetch("/api/dashboard/onboarding?type=welcomes")
            .then((r) => r.json())
            .then((d) => {
                // Every field, not just one. The guard used to check `total`
                // alone — which the older two-field response also had, so a
                // stale server bundle passed it and the missing windows
                // rendered as the string "undefined".
                if (
                    ["last24h", "last7d", "last30d", "total"].every(
                        (k) => typeof d?.[k] === "number"
                    )
                ) {
                    setData(d);
                }
            })
            .catch(() => {});
    }, []);

    return (
        <div>
            <PageHeader
                title="Welcomes"
                description="new member welcomes"
                vigil="nova"
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Last 24h" value={count(data?.last24h)} />
                <MetricCard label="Last 7 days" value={count(data?.last7d)} />
                <MetricCard label="Last 30 days" value={count(data?.last30d)} />
                <MetricCard label="All time" value={count(data?.total)} />
            </div>

            <p className="text-sm text-zinc-400 mt-4 max-w-3xl border-l-2 border-zinc-700 pl-3">
                A welcome is counted when it reaches a member, not when it is
                drafted — a keeper can fail and still return text, and that is
                never sent. The 24-hour figure moves by the hour; 7 and 30 days
                are whole days, so they step at midnight UTC. Counting began when
                this was built, so the longer windows fill in over time.
            </p>
        </div>
    );
}
