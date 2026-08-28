"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import { VIGILS, type VigilName, type Platform } from "@/types";
import { PageHeader, VigilAvatar, SkeletonRow } from "@/components/vigils";

const VIGIL_ROLES: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

const MAX_CULTURE_NOTES = 2000;

/** Mirrors `LANGUAGES` in the onboarding wizard. Any BCP-47 tag the API accepts works. */
const LANGUAGES: { tag: string; label: string }[] = [
    { tag: "", label: "Not set — infer it" },
    { tag: "en", label: "English" },
    { tag: "es", label: "Español" },
    { tag: "pt-BR", label: "Português (BR)" },
    { tag: "fr", label: "Français" },
    { tag: "de", label: "Deutsch" },
    { tag: "it", label: "Italiano" },
    { tag: "nl", label: "Nederlands" },
    { tag: "pl", label: "Polski" },
    { tag: "tr", label: "Türkçe" },
    { tag: "ru", label: "Русский" },
    { tag: "ar", label: "العربية" },
    { tag: "hi", label: "हिन्दी" },
    { tag: "id", label: "Bahasa Indonesia" },
    { tag: "ja", label: "日本語" },
    { tag: "ko", label: "한국어" },
    { tag: "zh", label: "中文" },
];

interface Community {
    communityId: string;
    platform: Platform;
    language?: string;
    blockedTerms?: string[];
    cultureNotes?: string;
    /** Undefined when the count could not be read — the prompt says so. */
    escalationCount?: number;
}

interface MindOption {
    mindId: string;
    name: string | null;
    email: string | null;
    isEnabled: boolean;
    cognition: number | null;
}

type Tab = "communities" | "swarm";

/**
 * The left column of a settings row: what this section is and why it matters.
 *
 * Same rule as the wizard's `WhyItMatters` — say what breaks, not what it
 * helps with. A creator who does not know that the culture keeper only sees
 * flagged messages has no reason to fill in a long text field.
 */
function SectionIntro({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="md:w-64 shrink-0">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{children}</p>
        </div>
    );
}

export default function SettingsPage() {
    const [tab, setTab] = useState<Tab>("communities");
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    // Separate from `loading`: `connected` is answered by /api/account, and the
    // "no swarm connected" card must not flash while that request is still in
    // flight just because the communities request came back first.
    const [accountLoading, setAccountLoading] = useState(true);
    const [roleMap, setRoleMap] = useState<Record<string, string>>({});
    const [minds, setMinds] = useState<MindOption[]>([]);
    const [mindsLoading, setMindsLoading] = useState(true);
    const [communities, setCommunities] = useState<Community[]>([]);

    // Which community is open for editing. `null` means the add form.
    const [editing, setEditing] = useState<string | null>(null);
    const [form, setForm] = useState({
        platform: "telegram" as Platform,
        communityId: "",
        language: "",
        blockedTerms: "",
        cultureNotes: "",
    });
    // Which community is awaiting a delete confirmation. Inline rather than a
    // native `confirm()`: this is a destructive action that also deletes the
    // moderation history, and the prompt needs to say so and name the number.
    const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    /**
     * Three requests, resolved independently rather than with `Promise.all`.
     *
     * `/api/minds` reads a cognition balance **per Mind** — five round trips to
     * Animoca — so it is reliably the slowest of the three. Awaiting all three
     * together made the Communities tab, which is the default and does not use
     * Minds at all, wait on data it never reads.
     *
     * So each sets its own state as it lands, and the two tabs have separate
     * loading flags. Communities appears as soon as communities arrive.
     */
    const load = useCallback(() => {
        fetch("/api/account")
            .then((r) => r.json())
            .then((acc) => {
                if (acc?.connected) {
                    setConnected(true);
                    setRoleMap(acc.roleMap ?? {});
                }
            })
            .catch(() => {})
            .finally(() => setAccountLoading(false));

        fetch("/api/account/communities")
            .then((r) => r.json())
            .then((com) => setCommunities(com?.communities ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));

        fetch("/api/minds")
            .then((r) => r.json())
            .then((mnd) => setMinds(mnd?.minds ?? []))
            .catch(() => {})
            .finally(() => setMindsLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openEdit = (c: Community) => {
        setEditing(c.communityId);
        setError(null);
        setSaved(null);
        setForm({
            platform: c.platform,
            communityId: c.communityId,
            language: c.language ?? "",
            blockedTerms: (c.blockedTerms ?? []).join("\n"),
            cultureNotes: c.cultureNotes ?? "",
        });
    };

    const openAdd = () => {
        setEditing(null);
        setError(null);
        setSaved(null);
        setForm({
            platform: "telegram",
            communityId: "",
            language: "",
            blockedTerms: "",
            cultureNotes: "",
        });
    };

    /**
     * Save is the same POST that binds a community.
     *
     * `bindCommunity` merges onto whatever is stored, so re-posting an existing
     * id is an update rather than a duplicate — which is why editing needed no
     * new endpoint. It was always possible; there was simply no way to ask for
     * it that did not look like adding the community a second time.
     */
    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(null);
        try {
            const res = await fetch("/api/account/communities", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    platform: form.platform,
                    communityId: form.communityId.trim(),
                    // Omitted when empty: the API rejects a malformed tag and ""
                    // is not a valid one.
                    ...(form.language ? { language: form.language } : {}),
                    // Always sent. "" normalises to "cleared" — omitting would
                    // mean "keep what is there", leaving no way to empty them.
                    blockedTerms: form.blockedTerms,
                    cultureNotes: form.cultureNotes,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Could not save.");
                return;
            }
            setCommunities(data.communities ?? []);
            setSaved(form.communityId.trim());
            if (!editing) openAdd();
        } catch {
            setError("Could not save.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (communityId: string) => {
        setConfirmingRemove(null);
        try {
            const res = await fetch(
                `/api/account/communities?communityId=${encodeURIComponent(communityId)}`,
                { method: "DELETE" }
            );
            const data = await res.json();
            if (res.ok) {
                setCommunities(data.communities ?? []);
                if (editing === communityId) openAdd();
            }
        } catch {
            // no-op
        }
    };

    // No whole-page loading branch: the header, the tabs and the section
    // headings are known before any request resolves, and swapping them out for
    // the word "Loading…" throws that away and reflows everything when the data
    // lands. Skeletons sit in the data regions instead.
    if (!accountLoading && !connected) {
        return (
            <div>
                <PageHeader
                    title="Settings"
                    description="Nothing to configure yet"
                    icon={Settings}
                />
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 max-w-xl">
                    <p className="text-zinc-300">
                        No swarm connected yet.
                    </p>
                    <p className="text-sm text-zinc-400 mt-2">
                        Onboarding connects your Builder key and assigns the five
                        roles. You only run it once — everything after that is
                        changed here.
                    </p>
                    <Link
                        href="/dashboard/setup"
                        className="inline-block mt-4 px-5 py-2 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors"
                    >
                        Go to onboarding
                    </Link>
                </div>
            </div>
        );
    }

    const byId = new Map(minds.map((m) => [m.mindId, m]));

    return (
        <div>
            <PageHeader
                title="Settings"
                description="Change how the swarm reads and moderates your communities"
                icon={Settings}
            />

            {/* Tabs */}
            <div className="flex gap-6 border-b border-zinc-800 mb-8">
                {(
                    [
                        ["communities", "Communities"],
                        ["swarm", "Swarm"],
                    ] as [Tab, string][]
                ).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`pb-3 -mb-px text-sm transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-sm ${
                            tab === key
                                ? "border-zinc-100 text-zinc-100"
                                : "border-transparent text-zinc-400 hover:text-zinc-300"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === "communities" && (
                <div className="space-y-10">
                    {/* --- list --- */}
                    <div className="flex flex-col md:flex-row gap-6">
                        <SectionIntro title="Connected communities">
                            One community belongs to exactly one account. Removing
                            one also deletes every moderation record it owns.
                        </SectionIntro>

                        <div className="flex-1 min-w-0">
                            {loading ? (
                                // One row, one line. Guessing two meant the
                                // list shrank when the real single community
                                // arrived — a skeleton that causes the jump it
                                // exists to prevent. One is also the honest
                                // guess: most creators bind a single community.
                                <div className="space-y-2">
                                    <SkeletonRow lines={1} />
                                </div>
                            ) : communities.length === 0 ? (
                                <p className="text-sm text-zinc-400">
                                    None connected. The bot will receive messages
                                    and do nothing with them until one is.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {communities.map((c) => (
                                        <div
                                            key={c.communityId}
                                            className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                                        >
                                            <span className="text-xs uppercase tracking-wide text-zinc-400">
                                                {c.platform}
                                            </span>
                                            <span className="font-mono text-sm text-zinc-300">
                                                {c.communityId}
                                            </span>
                                            <span
                                                className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"
                                                title={
                                                    c.language
                                                        ? "Every keeper writes in this language"
                                                        : "No language set — each keeper infers one"
                                                }
                                            >
                                                {c.language ?? "lang: inferred"}
                                            </span>
                                            {c.blockedTerms &&
                                                c.blockedTerms.length > 0 && (
                                                    <span
                                                        className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"
                                                        title={c.blockedTerms.join(", ")}
                                                    >
                                                        {c.blockedTerms.length} blocked
                                                    </span>
                                                )}
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded ${
                                                    c.cultureNotes
                                                        ? "bg-zinc-800 text-zinc-300"
                                                        : "bg-amber-900/40 text-amber-300/90"
                                                }`}
                                                title={
                                                    c.cultureNotes ??
                                                    "The culture keeper is judging this community on flagged messages alone"
                                                }
                                            >
                                                {c.cultureNotes
                                                    ? "described"
                                                    : "not described"}
                                            </span>
                                            <div className="ml-auto flex items-center gap-3">
                                                <button
                                                    onClick={() => openEdit(c)}
                                                    className="text-xs text-zinc-300 hover:text-white"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setConfirmingRemove(
                                                            confirmingRemove === c.communityId
                                                                ? null
                                                                : c.communityId
                                                        )
                                                    }
                                                    className="text-xs text-red-400 hover:text-red-300"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                            {confirmingRemove === c.communityId && (
                                                <div className="w-full mt-3 pt-3 border-t border-zinc-800">
                                                    <p className="text-sm text-zinc-200">
                                                        Remove{" "}
                                                        <span className="font-mono">
                                                            {c.communityId}
                                                        </span>
                                                        ?
                                                    </p>
                                                    <p className="text-sm text-zinc-400 mt-1">
                                                        This also permanently deletes{" "}
                                                        {c.escalationCount === undefined
                                                            ? "every moderation record it owns"
                                                            : c.escalationCount === 0
                                                              ? "its moderation history, which is currently empty"
                                                              : `${c.escalationCount} moderation record${
                                                                    c.escalationCount === 1
                                                                        ? ", including the member message inside it"
                                                                        : "s, including the member messages inside them"
                                                                }`}
                                                        . It cannot be undone.
                                                    </p>
                                                    <p className="text-sm text-zinc-500 mt-1">
                                                        Your Minds keep what they have
                                                        learned about this community either
                                                        way — this clears the queue, not
                                                        their memory.
                                                    </p>
                                                    <div className="flex gap-3 mt-3">
                                                        <button
                                                            onClick={() => remove(c.communityId)}
                                                            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                                                        >
                                                            Remove permanently
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmingRemove(null)}
                                                            className="px-4 py-2 rounded-lg text-sm text-zinc-300 border border-zinc-800 hover:bg-zinc-800 transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {editing !== null && (
                                <button
                                    onClick={openAdd}
                                    className="mt-3 text-sm text-zinc-300 hover:text-zinc-200"
                                >
                                    + Connect another community
                                </button>
                            )}
                        </div>
                    </div>

                    {/* --- editor --- */}
                    <div className="flex flex-col md:flex-row gap-6 pt-10 border-t border-zinc-800">
                        <SectionIntro
                            title={
                                editing
                                    ? "Edit this community"
                                    : "Connect a community"
                            }
                        >
                            {editing ? (
                                <>
                                    Changes take effect on the next message the
                                    swarm evaluates. Nothing is re-provisioned and
                                    no cognition is spent.
                                </>
                            ) : (
                                <>
                                    Paste the Discord guild ID or the Telegram chat
                                    ID. A Telegram supergroup starts with{" "}
                                    <span className="font-mono">-100</span>.
                                </>
                            )}
                        </SectionIntro>

                        <div className="flex-1 min-w-0 max-w-2xl space-y-5">
                            <div className="flex flex-wrap items-end gap-3">
                                <div>
                                    <label className="block text-sm text-zinc-300 mb-1">
                                        Platform
                                    </label>
                                    <select
                                        value={form.platform}
                                        disabled={!!editing}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                platform: e.target.value as Platform,
                                            })
                                        }
                                        className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
                                    >
                                        <option value="discord">Discord</option>
                                        <option value="telegram">Telegram</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-sm text-zinc-300 mb-1">
                                        Community ID
                                    </label>
                                    <input
                                        type="text"
                                        value={form.communityId}
                                        disabled={!!editing}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                communityId: e.target.value,
                                            })
                                        }
                                        placeholder="e.g. -1004395595935"
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 font-mono text-sm focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-zinc-300 mb-1">
                                    Language
                                </label>
                                <select
                                    value={form.language}
                                    onChange={(e) =>
                                        setForm({ ...form, language: e.target.value })
                                    }
                                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                                >
                                    {LANGUAGES.map((l) => (
                                        <option key={l.tag} value={l.tag}>
                                            {l.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="border-l-2 border-zinc-700 pl-3 mt-2">
                                    <p className="text-sm text-zinc-300">
                                        <span className="text-zinc-300">
                                            Set this even for an English community.
                                        </span>{" "}
                                        Left unset, each keeper infers one from the
                                        culture keeper&apos;s prose — which has
                                        already produced an English welcome for a
                                        Spanish community, with nothing detecting it.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-zinc-300 mb-1">
                                    Blocked words
                                </label>
                                <textarea
                                    value={form.blockedTerms}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            blockedTerms: e.target.value,
                                        })
                                    }
                                    rows={3}
                                    placeholder={"One per line, or comma separated\n$RUGTOKEN\ncompetitor name\ndm me for signals"}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 font-mono text-sm focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                                />
                                <div className="border-l-2 border-zinc-700 pl-3 mt-2">
                                    <p className="text-sm text-zinc-300">
                                        A message containing one of these always
                                        reaches the swarm, whatever the member&apos;s
                                        trust score. A trusted member normally skips
                                        evaluation entirely — these are the words
                                        where a good reputation should not buy a pass.
                                    </p>
                                </div>
                                <p className="text-zinc-500 text-sm mt-2">
                                    Matched whole-word and case-insensitively, so{" "}
                                    <span className="font-mono">scam</span> does not
                                    fire on <span className="font-mono">scampi</span>.
                                    Tickers and handles work too.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm text-zinc-300 mb-1">
                                    About this community
                                </label>
                                <textarea
                                    value={form.cultureNotes}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            cultureNotes: e.target.value,
                                        })
                                    }
                                    rows={7}
                                    maxLength={MAX_CULTURE_NOTES}
                                    placeholder={
                                        "What is this community for? How do people talk here?\n\n" +
                                        "What sounds rude elsewhere but is normal here?\n" +
                                        "What will you not tolerate, even said politely?\n\n" +
                                        "e.g. Traders, mostly European afternoons. Blunt about each\n" +
                                        "other's positions — that is banter, not an attack. Going after\n" +
                                        "the person rather than the trade is not. No paid signal groups,\n" +
                                        "however politely worded."
                                    }
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                                />
                                <div className="flex justify-between items-start gap-4 mt-2">
                                    <div className="border-l-2 border-zinc-700 pl-3">
                                        <p className="text-sm text-zinc-300">
                                            The culture keeper is only ever shown
                                            messages the filter flagged, so without
                                            this it is judging your community
                                            entirely on its worst moments — and that
                                            judgement goes to the moderator, which
                                            then flags more. This is the only account
                                            of your community the swarm gets that is
                                            not made of incidents.
                                        </p>
                                    </div>
                                    <span className="text-zinc-500 text-sm tabular-nums shrink-0">
                                        {form.cultureNotes.length}/{MAX_CULTURE_NOTES}
                                    </span>
                                </div>
                            </div>

                            {error && (
                                <p className="text-sm text-red-400">{error}</p>
                            )}
                            {saved && !error && (
                                <p className="text-sm text-emerald-400">
                                    Saved. The next message from {saved} is evaluated
                                    with these settings.
                                </p>
                            )}

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={save}
                                    disabled={!form.communityId.trim() || saving}
                                    className="px-5 py-2 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {saving
                                        ? "Saving…"
                                        : editing
                                          ? "Save changes"
                                          : "Connect"}
                                </button>
                                {editing && (
                                    <button
                                        onClick={openAdd}
                                        className="text-sm text-zinc-300 hover:text-zinc-200"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === "swarm" && (
                <div className="flex flex-col md:flex-row gap-6">
                    <SectionIntro title="Role assignments">
                        Each role is held by one Mind, and a Mind holds one role.
                        Changing an assignment means re-provisioning, which pings
                        all five Minds and spends cognition — so it lives in
                        onboarding, not here.
                    </SectionIntro>

                    <div className="flex-1 min-w-0 max-w-2xl">
                        <div className="space-y-2">
                            {mindsLoading &&
                                VIGIL_ROLES.map((role) => (
                                    <SkeletonRow key={`sk-${role}`} />
                                ))}
                            {!mindsLoading &&
                                VIGIL_ROLES.map((role) => {
                                const mind = byId.get(roleMap[role] ?? "");
                                return (
                                    <div
                                        key={role}
                                        className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                                    >
                                        <VigilAvatar name={role} />
                                        <div className="min-w-0">
                                            <p className="text-sm text-zinc-200">
                                                {VIGILS[role].role}
                                            </p>
                                            <p className="text-xs text-zinc-400">
                                                {VIGILS[role].tagline}
                                            </p>
                                        </div>
                                        <div className="ml-auto text-right">
                                            <p className="text-sm text-zinc-300 truncate max-w-[16rem]">
                                                {mind
                                                    ? mind.name || mind.email || mind.mindId
                                                    : "unassigned"}
                                            </p>
                                            <p className="text-xs text-zinc-400">
                                                {mind
                                                    ? `${mind.isEnabled ? "online" : "offline"}${
                                                          mind.cognition !== null
                                                              ? ` · ${mind.cognition.toFixed(0)} credits`
                                                              : ""
                                                      }`
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Link
                            href="/dashboard/setup"
                            className="inline-block mt-4 text-sm text-zinc-300 hover:text-zinc-200"
                        >
                            Change assignments in onboarding →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
