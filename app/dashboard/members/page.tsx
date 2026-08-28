"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    PageHeader,
    EmptyState,
    TrustBadge,
    Skeleton,
} from "@/components/vigils";

interface MemberRow {
    authorId: string;
    displayName: string;
    flags: number;
    trustScore: number | null;
    trustScoreAt: string | null;
    trustAsked: boolean;
    trustNote: string | null;
    communityId: string;
    lastSeen: string;
    lastOutcome: string;
    channel: string;
}

/**
 * Members the app has actually seen.
 *
 * The columns are chosen by what can be answered honestly rather than by what
 * a members table usually shows. There is no message count and no last-active
 * here because nothing records them: the 24h metrics are aggregate by design
 * and the swarm feed carries no member content, so the only member-identifying
 * store is the escalation index — which exists so an erasure request can find
 * someone's records, not to build a roster from.
 *
 * That means this lists members who were **flagged**, and cannot see the quiet
 * majority. Showing a "Messages" column full of dashes would imply the number
 * exists and is merely missing.
 *
 * The score shown is the one recorded when the escalation was raised, so the
 * page costs a Redis read and no cognition. A live reading is a button, one
 * member at a time — `cachedVerifySwarm` established the rule that opening a
 * dashboard must not bill the creator for looking at it.
 */
export default function MembersPage() {
    const [members, setMembers] = useState<MemberRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [asking, setAsking] = useState<string | null>(null);
    const [fresh, setFresh] = useState<
        Record<string, { score: number | null; note: string }>
    >({});

    useEffect(() => {
        fetch("/api/dashboard/members")
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((d) => setMembers(d.members ?? []))
            .catch(() => setFailed(true));
    }, []);

    async function askKeeper(m: MemberRow) {
        setAsking(m.authorId);
        try {
            const res = await fetch("/api/dashboard/members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    authorId: m.authorId,
                    displayName: m.displayName,
                    communityId: m.communityId,
                }),
            });
            const d = await res.json();
            setFresh((f) => ({
                ...f,
                [m.authorId]: {
                    score: res.ok ? d.trustScore : null,
                    note: res.ok ? d.note : (d.error ?? "No reply."),
                },
            }));
        } catch {
            setFresh((f) => ({
                ...f,
                [m.authorId]: { score: null, note: "Could not reach the trust keeper." },
            }));
        } finally {
            setAsking(null);
        }
    }

    return (
        <div>
            <PageHeader
                title="Members"
                description="reputation & trust tracking"
                vigil="vera"
            />

            {failed && (
                <EmptyState
                    message="Could not load members"
                    sub="The escalation store did not answer. The trust keeper is unaffected."
                />
            )}

            {!failed && members === null && (
                <Card className="p-6 space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-5/6" />
                    <Skeleton className="h-5 w-4/6" />
                </Card>
            )}

            {!failed && members !== null && members.length === 0 && (
                <EmptyState
                    message="No members seen yet"
                    sub="A member appears here once the swarm has looked at one of their messages. Nothing is recorded for members who have never been flagged."
                />
            )}

            {!failed && members !== null && members.length > 0 && (
                <Card className="overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Member</TableHead>
                                <TableHead>Trust score</TableHead>
                                <TableHead>Flags</TableHead>
                                <TableHead>Last flagged</TableHead>
                                <TableHead>Outcome</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((m) => {
                                const live = fresh[m.authorId];
                                const score = live ? live.score : m.trustScore;
                                // `trustAsked` is the same reading, reloaded
                                // from the store after a refresh.
                                const asked = Boolean(live) || m.trustAsked;

                                return (
                                    <TableRow key={m.authorId}>
                                        <TableCell>
                                            <div className="text-zinc-100">
                                                {m.displayName}
                                            </div>
                                            <div className="text-xs text-zinc-500 font-mono">
                                                {m.authorId}
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            {score === null ? (
                                                <span
                                                    className="text-zinc-500 text-sm"
                                                    title="The trust keeper's reply carried no score. That is not the same as zero."
                                                >
                                                    not stated
                                                </span>
                                            ) : (
                                                <TrustBadge score={score} />
                                            )}
                                            <div className="text-xs text-zinc-500 mt-1">
                                                {live
                                                    ? "asked just now"
                                                    : m.trustScoreAt
                                                        ? `${asked ? "asked" : "recorded"} ${when(m.trustScoreAt)}`
                                                        : "never recorded"}
                                            </div>
                                        </TableCell>

                                        <TableCell className="text-zinc-300">
                                            {m.flags}
                                        </TableCell>

                                        <TableCell className="text-zinc-400 text-sm">
                                            {when(m.lastSeen)}
                                            <div className="text-xs text-zinc-500">
                                                {m.channel}
                                            </div>
                                        </TableCell>

                                        <TableCell className="text-zinc-400 text-sm">
                                            {m.lastOutcome}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={asking === m.authorId}
                                                onClick={() => askKeeper(m)}
                                            >
                                                {asking === m.authorId
                                                    ? "Asking… (up to a minute)"
                                                    : "Ask the trust keeper"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Card>
            )}

            {!failed && members !== null && members.length > 0 && (
                <div className="mt-4 space-y-3">
                    {members
                        .filter((m) => fresh[m.authorId]?.note ?? m.trustNote)
                        .map((m) => (
                            <Card key={m.authorId} className="p-4">
                                <div className="text-xs text-zinc-500 mb-1">
                                    The trust keeper on {m.displayName}
                                </div>
                                <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                                    {fresh[m.authorId]?.note ?? m.trustNote}
                                </p>
                            </Card>
                        ))}
                </div>
            )}

            <div className="mt-6 border-l-2 border-zinc-800 pl-4 text-sm text-zinc-500 max-w-3xl space-y-2">
                <p>
                    <span className="text-zinc-400">
                        Only flagged members appear here.
                    </span>{" "}
                    Tracking everyone would mean logging every message — which is
                    also why there is no message count or last-active. What is kept
                    is short-lived: unresolved cases expire after 30 days, and
                    resolving one strips the message straight away, keeping the
                    redacted record for 90.
                </p>
                <p>
                    <span className="text-zinc-400">
                        Trust scores are not stored here.
                    </span>{" "}
                    They live in the trust keeper&apos;s own memory — your Mind, your
                    API key — so mindfully.gg is a processor for them, not the
                    controller. The score shown was taken when that message was
                    judged; a current one has to be asked for.
                </p>
            </div>
        </div>
    );
}

/** Coarse relative time. Precision here would imply a precision we do not have. */
function when(iso: string): string {
    const ms = Date.now() - Date.parse(iso);
    if (Number.isNaN(ms)) return "—";
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
