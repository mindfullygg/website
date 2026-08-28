"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import Link from "next/link";
import { VIGILS, type VigilName, type Platform } from "@/types";
import { PageHeader, VigilAvatar, StatusDot, Skeleton } from "@/components/vigils";

const VIGIL_ROLES: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

const STEP_TITLES = ["Connect API Key", "Assign Minds", "Verify", "Done"];

/**
 * The one line saying what breaks if a field is skipped or set wrong.
 *
 * Every input on this page has a real consequence behind it and none of them
 * were visible: the language tag decides what language a warned member reads,
 * the blocked terms decide what a trusted member cannot bypass, and the culture
 * notes are the only description of a community the culture keeper gets that is
 * not made of flagged messages.
 *
 * Phrased as a **consequence, not a benefit**, deliberately. "This helps us
 * customise your experience" is a sentence a creator skips past; "without this
 * it is judging your community on its worst moments" is not. Every claim here
 * is something that has actually happened or is enforced in code — none of it
 * is persuasion.
 */
function WhyItMatters({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-zinc-700 pl-3 mb-6 max-w-2xl">
            <p className="text-sm text-zinc-300">{children}</p>
        </div>
    );
}

interface MindOption {
    mindId: string;
    name: string | null;
    email: string | null;
    isEnabled: boolean;
    /** Null when the balance could not be read — the estimate says so. */
    cognition: number | null;
}

/**
 * Cognition per call, per role, measured on our own stage-2 eval runs.
 *
 * These are **measurements, not a price list**, and two of the five have never
 * been measured because those Skills are not built yet. Guessing a number for
 * them and presenting it beside three real ones would make the whole estimate
 * read as more precise than it is, so the unmeasured roles are marked and the
 * estimate says how many of its inputs are guesses.
 *
 * The eval figure is also a **ceiling**: every eval case gets its own
 * conversation so every case pays `SKILL_LoadPlaybook`, where production reuses
 * one alias per role and amortises it across a community's traffic.
 */
const COST_PER_CALL: Record<VigilName, { credits: number; measured: boolean }> = {
    vera: { credits: 4.16, measured: true },
    kira: { credits: 3.09, measured: true },
    nova: { credits: 6.03, measured: true },
    sage: { credits: 5.0, measured: false },
    mira: { credits: 5.0, measured: false },
};

/** The roles a flagged message actually runs: trust + culture, then moderator. */
const MESSAGE_PATH: VigilName[] = ["vera", "sage", "kira"];
/** A join runs trust, culture and health for context, then the guide writes. */
const JOIN_PATH: VigilName[] = ["vera", "sage", "mira", "nova"];

interface RoleProvision {
    conversation: boolean;
    skills: string[];
    skillsSkipped: boolean;
    error?: string;
}

interface ProvisionResult {
    roleMap: Partial<Record<VigilName, string>>;
    provision: Record<string, RoleProvision>;
    swarm: Record<string, boolean>;
}

interface Community {
    communityId: string;
    platform: Platform;
    language?: string;
    blockedTerms?: string[];
    cultureNotes?: string;
}

function mindLabel(m: MindOption): string {
    return m.name || m.email || m.mindId;
}

interface Check {
    label: string;
    done: boolean;
    /** What actually breaks. Shown only when the check is not satisfied. */
    symptom: string;
}

/**
 * What is still missing, and what each gap actually costs.
 *
 * Deliberately **not** progress dots. Dots suit a flow whose steps are optional
 * preference-collection — a user who skips gets a less personalised product.
 * None of these are optional: without a key, five roles and a bound community,
 * the swarm does not run at all, and the symptom of each is silence rather than
 * an error a creator could act on.
 *
 * So every unmet item names its consequence instead of its position in a
 * sequence, and blocking gaps are separated from degrading ones — "nothing
 * works" and "works worse than it should" are different problems and a single
 * completion percentage hides which one you have.
 */
function buildChecks(
    connected: boolean,
    assignment: Record<string, string>,
    minds: MindOption[],
    communities: Community[]
): { blocking: Check[]; warnings: Check[] } {
    const byId = new Map(minds.map((m) => [m.mindId, m]));
    const assigned = VIGIL_ROLES.filter((r) => assignment[r]);
    const assignedMinds = assigned
        .map((r) => byId.get(assignment[r]))
        .filter((m): m is MindOption => !!m);

    const offline = assignedMinds.filter((m) => !m.isEnabled);
    const broke = assignedMinds.filter(
        (m) => m.cognition !== null && m.cognition <= 0
    );
    const noLanguage = communities.filter((c) => !c.language);
    const undescribed = communities.filter((c) => !c.cultureNotes);

    const blocking: Check[] = [
        {
            label: "Builder API key connected",
            done: connected,
            symptom: "Nothing can reach your Minds until this is set.",
        },
        {
            label: "All five roles assigned",
            done: assigned.length === VIGIL_ROLES.length,
            symptom: `${assigned.length} of ${VIGIL_ROLES.length} assigned. An unassigned role has no Mind to answer for it.`,
        },
        {
            label: "A community connected",
            done: communities.length > 0,
            symptom:
                "The bot receives messages and does nothing with them, with no error to tell you why.",
        },
    ];

    const warnings: Check[] = [
        {
            label: "Assigned Minds are online",
            done: offline.length === 0,
            symptom: `${offline.length} of the Minds you assigned ${offline.length === 1 ? "is" : "are"} switched off and cannot answer the swarm.`,
        },
        {
            label: "Assigned Minds have cognition",
            done: broke.length === 0,
            symptom: `${broke.length} ${broke.length === 1 ? "Mind has" : "Minds have"} no cognition left. An unfunded Mind accepts the call and never answers — the moderator then judges without it.`,
        },
        {
            label: "Every community has a language",
            done: communities.length === 0 || noLanguage.length === 0,
            symptom: `${noLanguage.length} without one. Each keeper will infer a language instead, which has silently got it wrong before.`,
        },
        {
            label: "Every community is described",
            done: communities.length === 0 || undescribed.length === 0,
            symptom: `${undescribed.length} without a description. The culture keeper judges those on flagged messages alone.`,
        },
    ];

    return { blocking, warnings };
}

function SetupChecklist({
    connected,
    assignment,
    minds,
    communities,
}: {
    connected: boolean;
    assignment: Record<string, string>;
    minds: MindOption[];
    communities: Community[];
}) {
    const { blocking, warnings } = buildChecks(
        connected,
        assignment,
        minds,
        communities
    );
    const missing = blocking.filter((c) => !c.done);
    const degraded = warnings.filter((c) => !c.done);

    if (missing.length === 0 && degraded.length === 0) {
        return (
            <div className="mb-6 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-4 py-3">
                <p className="text-sm text-emerald-300">
                    Swarm ready — key connected, five roles assigned, and every
                    community bound, described and set to a language.
                </p>
            </div>
        );
    }

    return (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 max-w-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-3">
                {missing.length > 0
                    ? "The swarm will not run yet"
                    : "The swarm will run, but not at its best"}
            </h3>

            <ul className="space-y-2">
                {missing.map((c) => (
                    <li key={c.label} className="flex gap-2.5">
                        <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
                        />
                        <p className="text-sm text-zinc-300">
                            {c.label}
                            <span className="block text-zinc-400">{c.symptom}</span>
                        </p>
                    </li>
                ))}
                {degraded.map((c) => (
                    <li key={c.label} className="flex gap-2.5">
                        <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                        />
                        <p className="text-sm text-zinc-300">
                            {c.label}
                            <span className="block text-zinc-400">{c.symptom}</span>
                        </p>
                    </li>
                ))}
            </ul>

            {missing.length === 0 && (
                <p className="text-xs text-zinc-500 mt-3">
                    None of these stop the swarm. Each one makes it work on less
                    than it could.
                </p>
            )}
        </div>
    );
}

/**
 * What this swarm will do before it runs dry, recomputed as roles are assigned.
 *
 * The headroom figure is deliberately **the minimum across the roles on a
 * path, not the total divided by the total cost.** Each Mind spends from its
 * own balance, so a swarm with 1200 credits on the moderator and 40 on the
 * trust keeper stops after roughly nine flagged messages — a total would report
 * hundreds and be wrong in the direction that matters.
 */
function pathHeadroom(
    path: VigilName[],
    assignment: Record<string, string>,
    byId: Map<string, MindOption>
): { runs: number | null; limiter: VigilName | null; unknown: VigilName[] } {
    let runs: number | null = null;
    let limiter: VigilName | null = null;
    const unknown: VigilName[] = [];

    for (const role of path) {
        const mind = byId.get(assignment[role] ?? "");
        if (!mind || mind.cognition === null) {
            unknown.push(role);
            continue;
        }
        const possible = Math.floor(mind.cognition / COST_PER_CALL[role].credits);
        if (runs === null || possible < runs) {
            runs = possible;
            limiter = role;
        }
    }
    return { runs, limiter, unknown };
}

function SwarmEstimate({
    assignment,
    minds,
}: {
    assignment: Record<string, string>;
    minds: MindOption[];
}) {
    const byId = new Map(minds.map((m) => [m.mindId, m]));
    const assignedCount = MESSAGE_PATH.filter((r) => assignment[r]).length;
    if (assignedCount === 0) return null;

    const msg = pathHeadroom(MESSAGE_PATH, assignment, byId);
    const join = pathHeadroom(JOIN_PATH, assignment, byId);

    const perMessage = MESSAGE_PATH.reduce(
        (sum, r) => sum + COST_PER_CALL[r].credits,
        0
    );
    const estimatedRoles = [...MESSAGE_PATH, ...JOIN_PATH]
        .filter((r, i, a) => a.indexOf(r) === i)
        .filter((r) => assignment[r] && !COST_PER_CALL[r].measured);

    const partial = assignedCount < MESSAGE_PATH.length;

    return (
        <div className="mt-6 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-baseline justify-between gap-4 mb-3">
                <h3 className="text-sm font-semibold text-zinc-100">
                    What this swarm will do
                </h3>
                <span className="text-xs text-zinc-400">
                    ~{perMessage.toFixed(0)} credits per flagged message
                </span>
            </div>

            {partial ? (
                <p className="text-sm text-zinc-400">
                    Assign the trust, culture and moderator roles to see how far
                    your balances go.
                </p>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-zinc-300">
                            Flagged messages before a Mind runs dry
                        </span>
                        <span className="text-lg text-zinc-100 tabular-nums">
                            {msg.runs === null ? "—" : `~${msg.runs}`}
                        </span>
                    </div>
                    {msg.limiter && (
                        <p className="text-xs text-zinc-400">
                            Bounded by{" "}
                            <span className="text-zinc-300">
                                {VIGILS[msg.limiter].name}
                            </span>{" "}
                            — each Mind spends from its own balance, so the
                            smallest one decides, not the total.
                        </p>
                    )}
                    {join.runs !== null && (
                        <div className="flex items-baseline justify-between gap-4 pt-1">
                            <span className="text-sm text-zinc-300">
                                New-member welcomes
                            </span>
                            <span className="text-sm text-zinc-300 tabular-nums">
                                ~{join.runs}
                            </span>
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800">
                <span className="text-zinc-300">Most messages cost nothing.</span>{" "}
                A filter runs first and only sends on what looks concerning, and a
                member the trust keeper already rates highly skips evaluation
                entirely. These numbers are what the messages that
                <em> do</em> reach the swarm will cost.
            </p>

            {(estimatedRoles.length > 0 || msg.unknown.length > 0) && (
                <p className="text-xs text-zinc-500 mt-2">
                    {estimatedRoles.length > 0 && (
                        <>
                            Measured on our own runs, except{" "}
                            {estimatedRoles
                                .map((r) => VIGILS[r].name)
                                .join(" and ")}
                            , whose Skill is not built yet — those are estimates.{" "}
                        </>
                    )}
                    {msg.unknown.length > 0 && (
                        <>
                            {msg.unknown
                                .map((r) => VIGILS[r].name)
                                .join(" and ")}
                            &apos;s balance could not be read, so the real figure
                            may be lower.
                        </>
                    )}
                </p>
            )}
        </div>
    );
}

export default function SetupPage() {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);

    // Step 0 — connect
    const [apiKey, setApiKey] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);

    // Step 1 — assign
    const [minds, setMinds] = useState<MindOption[]>([]);
    const [mindsError, setMindsError] = useState<string | null>(null);
    const [assignment, setAssignment] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Step 2 — result
    const [result, setResult] = useState<ProvisionResult | null>(null);

    // Communities are read, never edited here — the checklist needs to know
    // whether one is bound, and step 3 links onward to Settings for the rest.
    const [communities, setCommunities] = useState<Community[]>([]);

    const loadCommunities = useCallback(async () => {
        try {
            const res = await fetch("/api/account/communities");
            const data = await res.json();
            if (res.ok) setCommunities(data.communities ?? []);
        } catch {
            // leave list as-is
        }
    }, []);

    const loadMinds = useCallback(async () => {
        setMindsError(null);
        try {
            const res = await fetch("/api/minds");
            const data = await res.json();
            if (!res.ok) {
                setMindsError(data.error || "Could not load your Minds.");
                return;
            }
            setMinds(data.minds ?? []);
        } catch {
            setMindsError("Could not load your Minds.");
        }
    }, []);

    // On mount, figure out where the creator is in the flow.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/account");
                const data = await res.json();
                if (res.ok && data.connected) {
                    setConnected(true);
                    if (data.roleMap) setAssignment(data.roleMap);
                    // Communities too, not just on step 3 — the checklist is
                    // shown on every step and "no community bound" is a
                    // blocking gap wherever the creator happens to be.
                    await Promise.all([loadMinds(), loadCommunities()]);

                    // Land on what is left to do, not always on step 1.
                    //
                    // `roleMapComplete` has always been returned by
                    // /api/account and nothing read it, so a fully provisioned
                    // account and a half-finished one landed in the same place
                    // — on "Assign Minds", where the only obvious action is to
                    // press Continue and re-provision.
                    //
                    // Re-provisioning is idempotent but **not free**:
                    // `verifySwarm` pings all five Minds and waits for replies,
                    // and this route sits deliberately close to the 300s Vercel
                    // ceiling. Doing that on every login costs real cognition
                    // and is the likeliest place to hit a timeout on a deployed
                    // instance. Setup is already done; show what is missing.
                    setStep(data.roleMapComplete ? 3 : 1);
                }
            } catch {
                // fall through to step 0
            } finally {
                setLoading(false);
            }
        })();
    }, [loadMinds, loadCommunities]);

    const handleConnect = async () => {
        setConnecting(true);
        setConnectError(null);
        try {
            const res = await fetch("/api/auth/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey }),
            });
            const data = await res.json();
            if (!res.ok) {
                setConnectError(data.error || "Connection failed.");
                return;
            }
            setConnected(true);
            await loadMinds();
            setStep(1);
        } catch {
            setConnectError("Failed to connect. Check your API key.");
        } finally {
            setConnecting(false);
        }
    };

    // True when this account already has a full, provisioned role map — used to
    // label the action honestly rather than inviting a needless re-provision.
    const alreadyProvisioned =
        connected && VIGIL_ROLES.every((r) => !!assignment[r]);

    const assignedIds = VIGIL_ROLES.map((r) => assignment[r]).filter(Boolean);
    const allAssigned = assignedIds.length === VIGIL_ROLES.length;
    const allDistinct = new Set(assignedIds).size === assignedIds.length;
    const canSubmit = allAssigned && allDistinct && !submitting;

    const handleAssign = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch("/api/account/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roleMap: assignment }),
            });
            const data = await res.json();
            if (!res.ok) {
                setSubmitError(data.error || "Could not save your assignment.");
                return;
            }
            // Provisioning spends cognition and can flip a Mind's state, so
            // re-read rather than showing the balances we loaded minutes ago.
            await loadMinds();
            setResult(data);
            setStep(2);
        } catch {
            setSubmitError("Could not save your assignment.");
        } finally {
            setSubmitting(false);
        }
    };

    const goToCommunities = async () => {
        await loadCommunities();
        setStep(3);
    };

    return (
        <div>
            <PageHeader
                title="Setup Wizard"
                description="Connect your Minds and put the swarm to work"
                icon={Plug}
            />

            {!loading && (
                <SetupChecklist
                    connected={connected}
                    assignment={assignment}
                    minds={minds}
                    communities={communities}
                />
            )}

            {/* Step indicators */}
            <div className="flex gap-2 mb-8">
                {STEP_TITLES.map((title, i) => (
                    <button
                        key={title}
                        type="button"
                        // Navigable only once the key is connected: before that
                        // there is genuinely nothing to go back to. Landing a
                        // provisioned creator on step 3 would otherwise strand
                        // them with no way to reassign a role.
                        disabled={!connected || i === step}
                        onClick={() => {
                            if (i === 3) void goToCommunities();
                            else setStep(i);
                        }}
                        className={`flex-1 p-3 rounded-lg text-left transition-colors ${
                            i === step
                                ? "bg-zinc-800 border border-zinc-700"
                                : i < step
                                    ? "bg-zinc-900/50 border border-zinc-800 opacity-60"
                                    : "bg-zinc-900/20 border border-zinc-800/50 opacity-40"
                        } ${connected && i !== step ? "hover:opacity-100 hover:border-zinc-700 cursor-pointer" : ""} disabled:cursor-default`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-zinc-300">
                                {i < step ? "✓" : i + 1}
                            </span>
                            <span
                                className={`text-sm font-medium ${
                                    i === step ? "text-zinc-100" : "text-zinc-400"
                                }`}
                            >
                                {title}
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
                {loading ? (
                    // Same reasoning as Settings: the card, the step indicators
                    // and the heading are all known before /api/account
                    // answers. Hold the shape rather than blanking it.
                    <div className="max-w-lg space-y-3">
                        <Skeleton className="h-6 w-56" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-10 w-full mt-6" />
                    </div>
                ) : (
                    <>
                        {step === 0 && (
                            <div className="max-w-lg">
                                <h2 className="text-xl font-semibold mb-4">
                                    Connect your Builder API Key
                                </h2>
                                <p className="text-zinc-300 mb-6">
                                    Paste your Minds Builder API key. It&apos;s validated
                                    against your account, encrypted at rest, and never exposed
                                    to the browser. You&apos;ll pick which Minds to use next.
                                </p>

                                <label className="block text-sm text-zinc-300 mb-1">
                                    Builder API Key
                                </label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="eyJ… (your Builder API key)"
                                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                                />

                                {connectError && (
                                    <p className="text-sm text-red-400 mt-3">{connectError}</p>
                                )}

                                <button
                                    onClick={handleConnect}
                                    disabled={!apiKey || connecting}
                                    className="mt-6 px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {connecting ? "Connecting…" : "Connect"}
                                </button>
                            </div>
                        )}

                        {step === 1 && (
                            <div>
                                <h2 className="text-xl font-semibold mb-2">
                                    Assign each role to a Mind
                                </h2>
                                <p className="text-zinc-300 mb-6">
                                    Pick which of your Minds plays each keeper role. Create them
                                    on{" "}
                                    <a
                                        href="https://hellominds.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 underline"
                                    >
                                        hellominds.ai
                                    </a>{" "}
                                    first if you haven&apos;t — a namespaced set like{" "}
                                    <code className="text-zinc-300">vera_yourbrand</code> avoids
                                    name clashes. Each Mind can hold only one role.
                                </p>

                                <WhyItMatters>
                                    Five roles need five Minds because a Mind&apos;s memory is
                                    the product, not a detail. The trust keeper accumulates who
                                    each member is; the culture keeper accumulates what is normal
                                    here. Put both in one Mind and those two histories blend —
                                    a member&apos;s bad week starts reading as a shift in the
                                    community&apos;s norms, and there is no way to separate them
                                    afterwards.
                                </WhyItMatters>

                                {mindsError && (
                                    <p className="text-sm text-red-400 mb-4">{mindsError}</p>
                                )}

                                {minds.length === 0 && !mindsError ? (
                                    <p className="text-zinc-400 mb-4">
                                        No Minds found on this account yet. Create them on
                                        hellominds.ai, then{" "}
                                        <button
                                            onClick={loadMinds}
                                            className="text-blue-400 underline"
                                        >
                                            refresh
                                        </button>
                                        .
                                    </p>
                                ) : (
                                    <div className="space-y-3 max-w-2xl">
                                        {VIGIL_ROLES.map((role) => {
                                            const v = VIGILS[role];
                                            const chosen = assignment[role];
                                            const dupe =
                                                chosen &&
                                                assignedIds.filter((id) => id === chosen).length > 1;
                                            return (
                                                <div
                                                    key={role}
                                                    className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50"
                                                >
                                                    <VigilAvatar name={role} />
                                                    <div className="w-28">
                                                        <div
                                                            className="text-sm font-medium"
                                                            style={{ color: v.textColor }}
                                                        >
                                                            {v.role}
                                                        </div>
                                                        <div className="text-xs text-zinc-400">
                                                            {v.tagline}
                                                        </div>
                                                    </div>
                                                    <select
                                                        value={chosen ?? ""}
                                                        onChange={(e) =>
                                                            setAssignment((prev) => ({
                                                                ...prev,
                                                                [role]: e.target.value,
                                                            }))
                                                        }
                                                        className={`flex-1 px-3 py-2 bg-zinc-800 border rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                                                            dupe ? "border-red-500" : "border-zinc-700"
                                                        }`}
                                                    >
                                                        <option value="">— select a Mind —</option>
                                                        {minds.map((m) => (
                                                            <option key={m.mindId} value={m.mindId}>
                                                                {mindLabel(m)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {!allDistinct && allAssigned && (
                                    <p className="text-sm text-red-400 mt-4">
                                        Each role needs a distinct Mind.
                                    </p>
                                )}
                                <SwarmEstimate assignment={assignment} minds={minds} />

                                {submitError && (
                                    <p className="text-sm text-red-400 mt-4">{submitError}</p>
                                )}

                                <button
                                    onClick={handleAssign}
                                    disabled={!canSubmit}
                                    className="mt-6 px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {submitting
                                        ? "Provisioning…"
                                        : alreadyProvisioned
                                          ? "Re-provision this swarm"
                                          : "Equip & Verify Swarm"}
                                </button>
                                {alreadyProvisioned && !submitting && (
                                    <p className="text-xs text-zinc-500 mt-2 max-w-md">
                                        Already provisioned — you only need this
                                        after changing an assignment. It pings all
                                        five Minds and waits for replies, which
                                        spends cognition and can take a couple of
                                        minutes.
                                    </p>
                                )}
                            </div>
                        )}

                        {step === 2 && result && (
                            <div>
                                <h2 className="text-xl font-semibold mb-2">Swarm ready</h2>
                                <p className="text-zinc-300 mb-6">
                                    Roles assigned, conversations wired, and Skills equipped
                                    where configured. Status per keeper:
                                </p>

                                <div className="space-y-3 max-w-2xl">
                                    {VIGIL_ROLES.map((role) => {
                                        const v = VIGILS[role];
                                        const online = result.swarm[role];
                                        const prov = result.provision[role];
                                        return (
                                            <div
                                                key={role}
                                                className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50"
                                            >
                                                <VigilAvatar name={role} />
                                                <div className="w-28">
                                                    <div
                                                        className="text-sm font-medium"
                                                        style={{ color: v.textColor }}
                                                    >
                                                        {v.role}
                                                    </div>
                                                    <div className="text-xs text-zinc-400">
                                                        {v.tagline}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 w-28">
                                                    <StatusDot status={online ? "online" : "offline"} />
                                                    <span className="text-sm text-zinc-300">
                                                        {online ? "Online" : "No response"}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-zinc-400 flex-1">
                                                    {prov?.error
                                                        ? `Provision error: ${prov.error}`
                                                        : prov?.skillsSkipped
                                                            ? "Skill pending (placeholder)"
                                                            : `${prov?.skills.length ?? 0} skill(s) equipped`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        onClick={goToCommunities}
                                        className="px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors"
                                    >
                                        Finish
                                    </button>
                                    <button
                                        onClick={() => setStep(1)}
                                        className="px-6 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                                    >
                                        Re-assign
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div>
                                <h2 className="text-xl font-semibold mb-2">
                                    Onboarding complete
                                </h2>
                                <p className="text-zinc-300 mb-6 max-w-2xl">
                                    Your key is connected and all five roles are
                                    assigned and provisioned. You do not need to run
                                    this again unless you change which Mind holds a
                                    role.
                                </p>

                                <WhyItMatters>
                                    Everything from here changes in{" "}
                                    <span className="text-zinc-300">Settings</span> —
                                    connecting a community, its language, its blocked
                                    words, and the description the culture keeper
                                    reads. None of that touches your Minds or spends
                                    cognition, which is why it does not belong in a
                                    provisioning flow.
                                </WhyItMatters>

                                <div className="flex gap-3">
                                    <Link
                                        href="/dashboard/settings"
                                        className="px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors"
                                    >
                                        {communities.length === 0
                                            ? "Connect a community"
                                            : "Go to settings"}
                                    </Link>
                                    {/* `/dashboard` redirects to Moderation now
                                        that there is no overview page, so the
                                        label names the destination. */}
                                    <Link
                                        href="/dashboard"
                                        className="px-6 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                                    >
                                        Go to dashboard
                                    </Link>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
