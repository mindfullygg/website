"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { VIGILS } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Band 4 — three weeks in the life of one member.
 *
 * This is the argument of the whole site drawn rather than asserted: a member
 * joins, lurks, gets piled on, nearly leaves, is checked in on, and ends up
 * greeting newcomers — with each Keeper's contribution appearing at the moment
 * it happened. A filter would have seen six unrelated days. Memory sees an arc.
 *
 * Geometry notes, because they are easy to break:
 *
 * - The chart is a `viewBox="0 0 1000 200"` with `preserveAspectRatio="none"`,
 *   so **x is a percentage of the container**, not a pixel. Day `d` sits at
 *   `x = 20 + d * 45.95`, which puts day 0 at x=20 and day 21 at x=985. The
 *   inset used to be 40/960, and the trace visibly stopped short of the right
 *   edge while the labels ran to it.
 * - Chips and marks are positioned in **percentages of the same box**, so they
 *   line up with the trace only as long as both use the mapping above.
 * - `y` is participation inverted: `y = 180 - participation * 1.6`.
 *
 * Motion runs once when the band scrolls into view, and again on Replay. Under
 * `prefers-reduced-motion` every element renders in its final state and nothing
 * animates — the band still makes its point as a static chart.
 */

/** Day → x, in the chart's coordinate space. Keep chips and marks in step. */
const dayX = (day: number) => 20 + day * 45.95;

/** Percentage across the container for day `d`, for absolutely-placed labels. */
const dayPct = (day: number) => `${(dayX(day) / 1000) * 100}%`;

const TRACE_D =
    "M20 167 L66 177 L158 177 L296 177 L342 124 L388 175 L434 164 L526 135 L663 116 L801 92 L985 65";

/** The trace, closed down to the baseline and back, for the area fill. */
const AREA_D = `${TRACE_D} L985 185 L20 185 Z`;

/**
 * Every delay below is a position on the 3s draw, not a free parameter.
 *
 * The trace takes `TRACE_SECONDS` to cross the chart, so a node at day `d`
 * has to appear when the line reaches it — `d / 21 * TRACE_SECONDS` — or the
 * dot lands on empty canvas and the sequence stops reading as one motion.
 * Chips and marks are then nudged a beat after their node.
 *
 * It ran at 5.4s and lost people: a visitor scrolling at normal speed saw a
 * line half-drawn and moved on before Mira's chip — the payoff — ever landed.
 */
export const TRACE_SECONDS = 3;

/** When the trace reaches day `d`, in seconds. */
const at = (day: number) => +(day / 21 * TRACE_SECONDS).toFixed(2);

const NODES = [
    { x: 20, y: 167, color: VIGILS.vera.textColor, delay: at(0) + 0.15, filled: false },
    { x: 342, y: 124, color: VIGILS.kira.textColor, delay: at(7), filled: false },
    { x: 388, y: 175, color: VIGILS.nova.textColor, delay: at(8), filled: false },
    { x: 526, y: 135, color: "#a1a1aa", delay: at(11), filled: false },
    { x: 985, y: 65, color: VIGILS.sage.textColor, delay: at(21) - 0.1, filled: true },
];

/** What each Keeper learned, at the moment it learned it. */
const CHIPS = [
    { keeper: "sage", label: "this room jokes about rug pulls", left: "12%", top: "4%", delay: at(4) },
    { keeper: "kira", label: "flagged the pile-on, and said why", left: "31%", top: "25%", delay: at(7) + 0.15 },
    { keeper: "nova", label: "checked in", left: "42%", top: "54%", delay: at(8) + 0.15 },
    { keeper: "mira", label: "participation recovering", left: "63%", top: "13%", delay: at(14) },
] as const;

/** What the member did, pinned under the chart. Desktop only — see MOBILE_TIMELINE. */
const MARKS = [
    { day: 0, label: "Joined", align: "start" as const, delay: at(0) + 0.25 },
    { day: 7, label: "Piled on in #general", align: "center" as const, delay: at(7) + 0.1 },
    { day: 11, label: "Posted again", align: "center" as const, delay: at(11) + 0.1 },
    { day: 21, label: "Greets newcomers", align: "end" as const, delay: at(21) },
];

/**
 * The same events as one sequence, for screens too narrow to pin labels to a
 * chart. Derived from MARKS and CHIPS rather than retyped, so the mobile story
 * cannot drift from the desktop one — sorted by day, with the member's own
 * actions and the Keepers' observations interleaved the way they happened.
 *
 * CHIPS carries no day, only an x-percentage, so the day is recovered from it:
 * `left` is a share of the chart's 0–21 span.
 */
const MOBILE_TIMELINE: {
    day: number;
    label: string;
    keeper?: (typeof CHIPS)[number]["keeper"];
    delay: number;
}[] = [
    ...MARKS.map((m) => ({ day: m.day, label: m.label, delay: m.delay })),
    ...CHIPS.map((c) => ({
        day: Math.round((parseFloat(c.left) / 100) * 21),
        label: c.label,
        keeper: c.keeper,
        delay: c.delay,
    })),
].sort((a, b) => a.day - b.day || a.delay - b.delay);

export function KeeperTimeline() {
    // 0 = not started. Each play increments, and the animated subtree is keyed
    // on it, so replaying remounts rather than fighting the CSS animation with
    // a forced reflow.
    const [run, setRun] = useState(0);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        // No observer means nothing would ever add `tl-playing`, and the band
        // would sit invisible forever. Start it on the next frame instead —
        // from a callback rather than the effect body, which would otherwise
        // cascade a second render before paint.
        if (!("IntersectionObserver" in window)) {
            const id = requestAnimationFrame(() => setRun((r) => (r === 0 ? 1 : r)));
            return () => cancelAnimationFrame(id);
        }
        const obs = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        setRun((r) => (r === 0 ? 1 : r));
                        obs.disconnect();
                    }
                }
            },
            { threshold: 0.35 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const playing = run > 0;

    return (
        <div className="mt-14">
            <div className="grid grid-cols-3 border-b border-zinc-900 pb-2.5">
                {["Week 1", "Week 2", "Week 3"].map((w) => (
                    <span
                        key={w}
                        className="font-mono text-label tracking-[0.14em] uppercase text-zinc-600"
                    >
                        {w}
                    </span>
                ))}
            </div>

            {/* `tl-playing` and the remount key belong on a wrapper around BOTH
                the chart and the day labels. They were on the chart alone, and
                the labels — its siblings — never matched `.tl-playing .tl-mark`,
                so they stayed at opacity 0 while everything else animated in. */}
            <div
                ref={stageRef}
                key={run}
                className={cn(playing && "tl-playing")}
                // The stylesheet reads the draw duration from here, so the CSS
                // and the delays above can only ever come from one number.
                style={{ "--tl-draw": `${TRACE_SECONDS}s` } as React.CSSProperties}
            >
            <div className="relative h-[300px] mt-2">
                <span className="absolute left-0 -top-0.5 font-mono text-micro tracking-[0.12em] uppercase text-zinc-600">
                    Participation
                </span>

                {/* These are the payoff — what each Keeper knew, and when — and
                    they were the smallest type in the band. Now at `text-meta`
                    with the Keeper's own hue washed through the fill and border,
                    so they read as that Keeper's note rather than as a generic
                    tooltip that happens to have a coloured dot. */}
                {CHIPS.map((c) => {
                    const v = VIGILS[c.keeper];
                    return (
                        <span
                            key={c.keeper}
                            className="tl-chip hidden sm:inline-flex absolute items-center gap-2.5 px-3.5 py-2 rounded-[10px] border text-meta text-zinc-300 whitespace-nowrap backdrop-blur-sm"
                            style={{
                                left: c.left,
                                top: c.top,
                                animationDelay: `${c.delay}s`,
                                backgroundColor: `color-mix(in srgb, ${v.color} 22%, #131317)`,
                                borderColor: `color-mix(in srgb, ${v.textColor} 28%, #27272a)`,
                            }}
                        >
                            <i
                                className="w-1.5 h-1.5 rounded-full flex-none"
                                style={{ backgroundColor: v.textColor }}
                            />
                            <b className="font-medium" style={{ color: v.textColor }}>
                                {v.displayName}
                            </b>
                            {c.label}
                        </span>
                    );
                })}

                <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 1000 200"
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    <defs>
                        <linearGradient id="tlTrace" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={VIGILS.vera.textColor} />
                            <stop offset="33%" stopColor={VIGILS.kira.textColor} />
                            <stop offset="52%" stopColor={VIGILS.nova.textColor} />
                            <stop offset="100%" stopColor={VIGILS.sage.textColor} />
                        </linearGradient>
                        <linearGradient id="tlArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={VIGILS.sage.textColor} stopOpacity=".18" />
                            <stop offset="100%" stopColor={VIGILS.sage.textColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    <line x1="20" y1="185" x2="985" y2="185" stroke="#1f1f23" strokeWidth="1" />
                    {/* The incident, marked on the axis and not only in prose. */}
                    <line
                        x1={dayX(7)}
                        y1="18"
                        x2={dayX(7)}
                        y2="185"
                        stroke={VIGILS.kira.color}
                        strokeWidth="1"
                        strokeDasharray="3 4"
                        opacity=".45"
                    />
                    <path className="tl-area" d={AREA_D} fill="url(#tlArea)" />
                    <path className="tl-trace" d={TRACE_D} />
                </svg>

                <svg
                    className="absolute inset-0 w-full h-full overflow-visible"
                    viewBox="0 0 1000 200"
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    {NODES.map((n) => (
                        <g
                            key={`${n.x}-${n.y}`}
                            className="tl-node"
                            style={{
                                animationDelay: `${n.delay}s`,
                                transformOrigin: `${n.x}px ${n.y}px`,
                            }}
                        >
                            <circle
                                cx={n.x}
                                cy={n.y}
                                r={n.filled ? 6 : 5}
                                fill={n.filled ? n.color : "#09090b"}
                                stroke={n.filled ? undefined : n.color}
                                strokeWidth={n.filled ? undefined : 2}
                            />
                        </g>
                    ))}
                </svg>
            </div>

            {/* Two spans per mark, deliberately. The outer one owns horizontal
                placement, the inner one owns the reveal — if both lived on one
                element the `tl-rise` animation would overwrite the centring
                translate the moment it started. */}
            <div className="relative h-0 sm:h-14 mt-1">
                {MARKS.map((m) => (
                    <span
                        key={m.day}
                        className="hidden sm:block absolute top-0 w-[150px]"
                        style={{
                            left: dayPct(m.day),
                            transform:
                                m.align === "center"
                                    ? "translateX(-50%)"
                                    : m.align === "end"
                                        ? "translateX(-100%)"
                                        : undefined,
                            textAlign: m.align === "start" ? "left" : m.align === "end" ? "right" : "center",
                        }}
                    >
                        <span
                            className="tl-mark block"
                            style={{ animationDelay: `${m.delay}s` }}
                        >
                            <b className="block text-meta font-medium text-zinc-100">{m.label}</b>
                            <span className="block font-mono text-label text-zinc-600 mt-0.5">
                                day {m.day}
                            </span>
                        </span>
                    </span>
                ))}
            </div>

            {/* Below `sm`, every label becomes one chronological list and none
                are pinned to the chart.

                Positioned labels never fit here. The chart is ~311px wide on a
                375px screen, and the marks are a fixed 110px, so "Joined" at day
                0 and "Piled on in #general" at day 7 overlapped by 65px no
                matter what the type size was — an earlier pass narrowed them and
                dropped day 11, but only checked days 7 and 11 against each other
                and missed this pair entirely.

                Merging the Keeper notes into the same list is what the split
                version could not do: on mobile you now read the member's story
                and the Keepers' observations as one sequence, which is closer to
                the point of the band than the chart alone. The chart stays above
                as the shape. */}
            <ol className="sm:hidden grid gap-3 mt-5">
                {MOBILE_TIMELINE.map((e) => {
                    const v = e.keeper ? VIGILS[e.keeper] : null;
                    return (
                        <li
                            key={`${e.day}-${e.label}`}
                            className="tl-chip grid grid-cols-[42px_1fr] gap-3 items-baseline text-meta"
                            style={{ animationDelay: `${e.delay}s` }}
                        >
                            <span className="font-mono text-label text-zinc-600 tabular-nums">
                                day {e.day}
                            </span>
                            {v ? (
                                <span className="text-zinc-300">
                                    <b className="font-medium" style={{ color: v.textColor }}>
                                        {v.displayName}
                                    </b>{" "}
                                    {e.label}
                                </span>
                            ) : (
                                <span className="font-medium text-zinc-100">{e.label}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-6 mt-6 pt-5 border-t border-zinc-900">
                <p className="text-lead font-medium tracking-[-0.02em] text-zinc-100 text-balance">
                    Every one of those decisions knew what came before it.
                </p>
                <button
                    type="button"
                    onClick={() => setRun((r) => r + 1)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-zinc-800 text-meta text-zinc-500 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
                >
                    <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
                    Replay
                </button>
            </div>
        </div>
    );
}
