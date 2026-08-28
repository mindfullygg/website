// ============================================================
// mindfully.gg — Skill eval harness
//
//   npx tsx --env-file=.env.local scripts/eval-skill.ts skills/moderator/fixtures.json
//
// Flags — the three ZERO-token modes come first for a reason:
//   --check-reply <f> score a reply you wrote by hand against --case. ZERO.
//   --dry             print the exact prompts and exit. ZERO.
//   --replay <file>   re-score a saved run. ZERO.
//
//   --case <ids>      run a subset: `--case a,b` or `--case a --case b`.
//   --limit <n>       run only the first n cases.
//   --mind <id>       bind the alias to this Mind (wires it if unwired).
//   --fresh           reset the conversation first. Use after editing a Skill.
//   --expect-skill <id>  fail unless that Skill is equipped on the Mind.
//   --timeout <ms>    override the reply wait (default 120000; measured 45-60s).
//   --no-vary-names   keep the fixture's own names. Names are otherwise varied
//                     ALWAYS — a different one per case, different again next
//                     run — because a Vigil that sees the same person "join"
//                     repeatedly correctly reads it as a replayed event and
//                     stops welcoming them. Ours did, emailed about it, and
//                     confirmed it would do so again knowing it was a harness.
//                     Use this flag to exercise that hold on purpose.
//
// A Mind's MEMORY outlives its conversations, so `--fresh` does not reset it and
// a display name is single-use. That is also why two silent replies in a row
// abandon the run: it means the Vigil is holding, not that a case is bad.
//
// A conversation carries memory. Re-running a fixture in the same conversation
// means the Mind sees its own earlier answers, so a Skill edit can look like it
// worked when the Mind is only remembering being corrected. `--fresh` is what
// makes a comparison between two Skill revisions honest.
//
// Every live run reports cognition spent, measured from the Mind's balance
// before and after — so the cost of an iteration is a number, not a guess.
//
// Cost model. Each case is ONE call to ONE Mind: upstream context is canned
// in the fixture rather than produced live, so a moderator eval does not also
// pay for the trust and culture roles, and results do not drift when those
// change. Every raw response is written to <fixture-dir>/.runs/, so re-scoring
// after a change to the scoring rules costs nothing — use --replay. Most
// iteration is scoring iteration.
//
// Pre-filter cases are pure local function calls and never cost anything.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
    queryVigil,
    getCreatorClient,
    isVigilFailure,
    STATUS_CHECK_PROMPT,
    VIGIL_TIMEOUT_MS,
} from "@/lib/minds-client";
import {
    buildCultureEvaluationPrompt,
    buildCultureOverridePrompt,
    buildCultureSummaryPrompt,
    buildModerationPrompt,
    buildHealthDigestPrompt,
    buildNormUpdatePrompt,
    buildWelcomePrompt,
    parseKiraDecision,
    parseTrustScore,
    CHANNELS_QUESTION_PROMPT,
    CULTURE_DIGEST_PROMPT,
} from "@/lib/orchestrator";
import { preFilterWithMetrics } from "@/lib/pre-filter";
import { toPlainText, containsMarkup } from "@/lib/normalize";
import type {
    CommunityMessageEvent,
    ModerationAction,
    ModerationClassification,
    VigilAlias,
} from "@/types";

/**
 * Stand-in display names, generated rather than listed.
 *
 * A fixed list does not survive contact with a Mind that has memory. The first
 * version held ten names; after a few runs every one of them had "joined"
 * several times, and the Vigil started holding welcomes for all of them. The
 * pool has to be large enough that a name is effectively never reused.
 *
 * Still whole plausible names, never a mechanical suffix on a fixed stem —
 * that is what caused the original incident: the Vigil read "the same display
 * name with a different hash each time" and concluded joins were being replayed.
 * Three shapes, because real communities contain both `Elena R.` and `mei_lin`.
 */
const FIRST_NAMES = [
    "Marco", "Elena", "Tom", "Sara", "Nils", "Priya", "Jonas", "Mei", "Ade",
    "Kasia", "Luca", "Ines", "Omar", "Ruth", "Bo", "Farah", "Dmitri", "Anouk",
    "Teo", "Yara", "Hugo", "Nadia", "Sami", "Lena", "Kwame", "Iris", "Rafa",
];
const LAST_NAMES = [
    "T.", "R.", "Bexley", "H.", "W.", "Z.", "Okafor", "Lindqvist", "Moreau",
    "Dasgupta", "Varga", "Ionescu", "Marsh", "Nakamura", "Brandt", "Silva",
    "Kovac", "Aliyev", "Whitlock", "Ferrer",
];
const HANDLE_TAILS = ["dev", "eth", "trades", "btc", "xyz", "hq", "sol", "labs"];

function pick<T>(xs: T[]): T {
    return xs[Math.floor(Math.random() * xs.length)];
}

/**
 * `n` plausible display names, no two sharing a first name.
 *
 * Distinctness of the whole string is not enough. A first draft produced
 * `nils.trades`, `nils_ferr` and `nils.btc` in one eleven-case run — three
 * different strings that a Vigil would reasonably read as one person arriving
 * three times, which is precisely the pattern that makes it hold. Draw first
 * names without replacement; the shape and suffix only add variety on top.
 */
function standInNames(n: number): string[] {
    const pool = [...FIRST_NAMES];
    // Fisher-Yates, so the first names are a random subset in a random order
    // rather than always the head of the list.
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return Array.from({ length: n }, (_, i) => {
        // Falls back to reusing a first name only if a suite ever exceeds the
        // pool, which would need 28 cases.
        const first = pool[i % pool.length];
        switch (Math.floor(Math.random() * 3)) {
            case 0:
                return `${first} ${pick(LAST_NAMES)}`;
            case 1:
                return `${first.toLowerCase()}_${pick(LAST_NAMES)
                    .replace(/[^a-z]/gi, "")
                    .toLowerCase()
                    .slice(0, 4)}`;
            default:
                return `${first.toLowerCase()}.${pick(HANDLE_TAILS)}`;
        }
    });
}

const CLASSIFICATIONS: ModerationClassification[] = [
    "CLEAR_SAFE",
    "CLEAR_VIOLATION",
    "AMBIGUOUS",
    "EDGE_CASE",
];

/**
 * Every prompt a Vigil receives in production has a builder, and every builder
 * has a style here. A style that sends hand-typed text — "raw" — is the one
 * shape that can rot without failing: the fixture goes on testing a prompt the
 * product no longer sends, and reports green. Reach for it only where no
 * builder exists.
 */
type PromptStyle =
    | "moderation"
    | "welcome"
    | "culture"
    | "culture-summary"
    | "culture-norm-update"
    | "culture-override"
    | "culture-digest"
    | "health-channels"
    | "health-digest"
    | "status"
    | "raw";

interface PrefilterCase {
    id: string;
    message: string;
    channel: string;
    displayName: string;
    userId: string;
    /** true = the pre-filter should handle it and the swarm never runs. */
    expectPass: boolean;
}

interface EvalCase {
    id: string;
    displayName: string;
    /** moderation style only. */
    message?: string;
    channel?: string;
    /** Canned upstream context. Fixed on purpose — see the cost model above. */
    trustContext?: string;
    culturalContext?: string;
    /** welcome style only. */
    activityContext?: string;
    ambassadorContext?: string;
    /** Override the fixture's prompt style for this case.
     *
     *  A role receives more than one shape of message: the moderator gets a
     *  moderation request, a creator override, a summary request and a status
     *  check, and only the first uses `buildModerationPrompt`. Without this the
     *  suite could only ever test one of the four. */
    promptStyle?: PromptStyle;
    /** `culture-norm-update` only: the decision whose outcome is being reported.
     *  `action` selects the outcome wording, including the escalate branch where
     *  nothing happened to the member. */
    decision?: { action: ModerationAction; reasoning: string };
    /** `culture-override` only: what the creator decided, and why. */
    creator?: { decision: string; reasoning: string };
    /** `health-digest` only: the four upstream summaries the digest compiles.
     *  Any omitted section becomes "No data available.", which is what
     *  `usableContext` supplies in production when a Vigil fails or is silent. */
    digest?: {
        members?: string;
        culture?: string;
        moderation?: string;
        onboarding?: string;
    };
    /** Override the fixture's contract for this case. An override or a summary
     *  must NOT carry an anchored classification, so the moderation contract
     *  would fail them for being correct. */
    contract?: "moderation" | "none";
    /** The creator's description of the community, as `CommunityBinding.cultureNotes`
     *  supplies in production. Omit to exercise the "not described" branch,
     *  which is a different prompt and a different correct answer. */
    cultureNotes?: string;
    /** Canned "what this role has observed" context, appended after the real
     *  prompt. Test scaffolding only — production has no such field, and the
     *  builder deliberately does not take one. */
    observed?: string;
    /** BCP-47 tag, as `CommunityBinding.language` would supply in production.
     *  Overrides the fixture-level default. Set it to "" to test the absent
     *  case even when the fixture sets one. */
    language?: string;
    expect: {
        classification?: ModerationClassification;
        action?: ModerationAction;
        /** Substrings that must / must not appear in the raw reply. */
        contains?: string[];
        excludes?: string[];
        /** Forbidden **whole words**, matched on word boundaries rather than as
         *  substrings. For names, and only for names.
         *
         *  `excludes` is a substring test, which is right for markup fragments
         *  (`**`, `&#`, `/100`) and wrong for a short name: `Vera` matches inside
         *  "o**vera**ll", "se**vera**l", "a**vera**ge"; `Sage` inside "mes**sage**";
         *  `Nova` inside "in**nova**tion". That is not hypothetical on the health
         *  role — its digest prompt literally asks for an "overall health score",
         *  so a correct reply opening "Overall, …" failed as though it had named
         *  one of our Minds. It would have been read at stage 2 as the naming rule
         *  breaking, at ~5 credits a case, and the Skill would have been "fixed"
         *  to stop doing something it never did.
         *
         *  Kept separate from `excludes` rather than changing how that matches,
         *  because the four published suites were validated under substring
         *  semantics and their saved runs replay identically this way. */
        excludesWord?: string[];
        /** At least one of these must appear. For "name one of the ambassadors"
         *  or "point at one of the channels that actually exist".
         *
         *  A list of lists requires one match from EACH group, which is the only
         *  way to assert two independent properties of a single reply. The case
         *  that needs it is the non-English one: "is this Spanish" and "does the
         *  Spanish carry its accents" are separate questions, and a suite that
         *  merges them into one flat list answers neither — a reply satisfying
         *  the language half passes while the accents are silently gone. That is
         *  the moderator's §23, which was found by reading a reply because no
         *  fixture on this project could express it. */
        containsAny?: string[] | string[][];
        /** Reply length ceiling. A welcome that is delivered as a DM should not
         *  be a wall of text; nothing else in the suite can see that. */
        maxChars?: number;
        /** Word ceiling, which is what a Skill body states when it states a
         *  limit at all. Characters are a proxy for it and a bad one across
         *  languages: the same reply in Spanish runs longer than in English, so
         *  a char cap tuned on English either fails good Spanish or is raised
         *  until it stops testing anything. Assert the rule the body actually
         *  gives. Set it fixture-wide to match the body's number. */
        maxWords?: number;
        /** For trust-role fixtures: the score the parser must extract. */
        trustScore?: number | null;
        /**
         * Set false when the reply is *not* expected to mention the member.
         *
         * The pairing check flags a reply that never names the person it is
         * about, on the theory that it probably belongs to another case. That
         * is exactly backwards for an injection fixture, where refusing to echo
         * attacker-supplied text is the behaviour under test — one of ours was
         * reported SUSPECT for getting it right, while a second passed by
         * accident because its hostile display name began with the word
         * "Trust" and the reply mentioned the trust keeper.
         */
        namesMember?: boolean;
    };
}

interface Fixtures {
    role: string;
    alias: string;
    /** The Mind to bind this alias to. `--mind` overrides. Optional when the
     *  conversation already exists. */
    mindId?: string;
    /** Which production prompt builder to use. "raw" sends `message` as-is. */
    promptStyle?: PromptStyle;
    /** "moderation" enforces the classification/confidence contract. Roles whose
     *  output nothing parses use "none" and rely on contains/excludes.
     *  Defaults from promptStyle. */
    contract?: "moderation" | "none";
    /** Default BCP-47 tag for every case, as the community binding would supply.
     *  Omit to test the inference fallback, which is what happens for any
     *  community that never set one. */
    language?: string;
    /** The body's stated word limit, applied to every case that does not set
     *  its own. One number in one place, matching what the Skill was told. */
    maxWords?: number;
    prefilter?: PrefilterCase[];
    cases: EvalCase[];
}

type Client = Awaited<ReturnType<typeof getCreatorClient>>;

// ---- Mind inspection ----

/**
 * Which Mind sits behind this alias.
 *
 * `getMindIdForAlias` throws when no conversation exists yet, so an explicit
 * id (from `--mind` or the fixture) is the way to run an eval before the app's
 * setup flow has ever been used — which is the whole point of stage 2.
 */
async function resolveMindId(
    client: Client,
    fixtures: Fixtures,
    override?: string
): Promise<string> {
    const explicit = override ?? fixtures.mindId;

    let existing: string | undefined;
    try {
        existing = await client.getMindIdForAlias(fixtures.alias);
    } catch {
        existing = undefined;
    }

    if (explicit) {
        if (!existing) {
            await client.ensureConversation(fixtures.alias, explicit);
            console.log(`wired ${fixtures.alias} → ${explicit}`);
        } else if (existing !== explicit) {
            console.log(
                `note: ${fixtures.alias} is currently bound to ${existing}, rebinding to ${explicit}`
            );
            await client.ensureConversation(fixtures.alias, explicit);
        }
        return explicit;
    }

    if (!existing) {
        throw new Error(
            `No conversation for alias "${fixtures.alias}" and no Mind id given.\n` +
            `Pass --mind <id>, or add "mindId" to the fixture file.`
        );
    }

    return existing;
}

/**
 * Print what is actually equipped, so you never spend a run discovering you
 * were testing the version you thought you had replaced.
 */
async function reportEquipped(
    client: Client,
    mindId: string,
    expectSkill?: string
): Promise<Failure[]> {
    let equipped;
    try {
        equipped = await client.listEquippedSkills(mindId);
    } catch (err) {
        console.log(`equipped skills: unavailable (${(err as Error).message})`);
        return [];
    }

    if (equipped.length === 0) {
        console.log("equipped skills: none — this Mind is running on the prompt alone");
    } else {
        console.log("equipped skills:");
        for (const s of equipped) {
            const when = s.equippedAtUtc ? ` · equipped ${s.equippedAtUtc}` : "";
            console.log(`  ${s.skillId}${s.name ? ` — ${s.name}` : ""}${when}`);
        }
    }

    // Case-insensitive: the Bazaar returns these lowercase and
    // `listEquippedSkills` returns them uppercase, so an id pasted from the
    // wrong endpoint would abort a run that was perfectly fine.
    if (
        expectSkill &&
        !equipped.some(
            (s) => s.skillId?.toLowerCase() === expectSkill.toLowerCase()
        )
    ) {
        console.log(`  FAIL  expected skill ${expectSkill} is NOT equipped`);
        return [{ id: "_setup", reason: `skill ${expectSkill} not equipped` }];
    }

    return [];
}

/** Spendable cognition, or null when the endpoint is unavailable. */
async function balance(client: Client, mindId: string): Promise<number | null> {
    try {
        return (await client.getCognitionBalance(mindId)).cognition;
    } catch {
        return null;
    }
}

/**
 * Cognition recorded against this Mind in a time window.
 *
 * NOT a before/after balance difference. The balance is eventually consistent —
 * it rises during a call and settles downward afterwards, so reading it either
 * side of a run produces nonsense (an early version reported a *negative*
 * spend). The usage ledger is the right instrument.
 *
 * It settles asynchronously too, so an immediate read can legitimately return
 * nothing. Returns null when the endpoint fails, 0 when it has not settled.
 */
async function usageBetween(
    client: Client,
    mindId: string,
    startTime: string,
    endTime: string
): Promise<number | null> {
    try {
        // 5m buckets: the default is daily, which would bill a whole day's
        // activity to a run that took forty seconds.
        const usage = await client.getCognitionUsage(mindId, {
            interval: "5m",
            startTime,
            endTime,
        });
        return (usage.items ?? []).reduce((sum, i) => sum + (i.value ?? 0), 0);
    } catch {
        return null;
    }
}

/**
 * Where the cognition actually went, by tool.
 *
 * More useful than a total, because it separates the model turns from the
 * per-call cost of loading equipped Skills — `SKILL_LoadPlaybook` is billed on
 * every message, so a Skill is not free at runtime, and this is how you see
 * what yours adds.
 */
async function usageByTool(
    client: Client,
    mindId: string,
    startTime: string,
    endTime: string
): Promise<{ tool: string; callCount: number; creditsUsed: number }[] | null> {
    try {
        const res = await client.getCognitionUsageByTool(mindId, {
            interval: "hour",
            startTime,
            endTime,
        });
        return (res.summary ?? []).filter((r) => r.creditsUsed > 0);
    } catch {
        return null;
    }
}

interface Recorded {
    id: string;
    prompt: string;
    reply: string;
    ms: number;
    /** The conversation this case used. Without it a failed run cannot be
     *  investigated afterwards — there is nothing to go and look at. */
    alias?: string;
}

// ---- Scoring ----

interface Failure {
    id: string;
    reason: string;
    detail?: string;
}

/**
 * Contract check — the part that actually protects production.
 *
 * `parseKiraDecision` uses `includes()` in a fixed order and falls back to
 * AMBIGUOUS, so a reply naming several classifications parses "successfully"
 * while meaning something else: "this is not CLEAR_SAFE, it's a
 * CLEAR_VIOLATION" is read as CLEAR_SAFE. A Skill must therefore emit exactly
 * one classification token. Anything else is a Skill bug, even when the prose
 * reads correctly to a human.
 */
function contractFailures(reply: string): string[] {
    const problems: string[] = [];

    const anchored = reply.match(
        /^[ \t]*CLASSIFICATION:[ \t]*(CLEAR_SAFE|CLEAR_VIOLATION|AMBIGUOUS|EDGE_CASE)\b/gim
    );

    if (!anchored) {
        problems.push(
            "no anchored `CLASSIFICATION: <token>` line — the parser escalates to a human rather than guessing"
        );
    } else if (anchored.length > 1) {
        problems.push(`${anchored.length} CLASSIFICATION lines — emit exactly one`);
    }

    // Loose mentions elsewhere no longer flip the parse, but the Skill forbids
    // them and they are a reliable sign the message was quoted back verbatim —
    // which is the injection vector.
    const upper = reply.toUpperCase();
    const loose = CLASSIFICATIONS.filter((c) => upper.includes(c)).length;
    if (anchored && loose > 1) {
        problems.push(
            "mentions a classification it is not choosing — never name one you are not selecting, and never quote the member's message"
        );
    }

    if (!/^[ \t]*Confidence:[ \t]*([01](?:\.\d+)?|\.\d+)\b/im.test(reply)) {
        problems.push("no anchored `Confidence: <0-1>` line");
    }

    return problems;
}

/**
 * Score the reply as the member will receive it, not as the Mind emitted it.
 *
 * Minds return HTML, and the adapter now converts it on the way out, so a `<p>`
 * in the raw reply is no longer a delivered defect — asserting on the raw text
 * would fail runs that are fine and, worse, pass runs that are not (a `&amp;`
 * reaching a member reads as broken, and the raw string looks clean). Score
 * what ships. The raw reply is still recorded in `.runs/`, and any markup is
 * reported alongside the result.
 */
function scoreCase(
    c: EvalCase,
    rawReply: string,
    contract: "moderation" | "none",
    /** The prompt this reply answers, when it is known. Only the delimiter check
     *  needs it, and it is skipped rather than guessed when absent. */
    prompt?: string
): Failure[] {
    const failures: Failure[] = [];
    const reply = toPlainText(rawReply);

    for (const nonce of prompt ? nonceLeaks(prompt, reply) : []) {
        failures.push({
            id: c.id,
            reason: `repeated the fence delimiter "${nonce}" — it is structure, not content`,
        });
    }

    if (contract === "moderation") {
        for (const problem of contractFailures(reply)) {
            failures.push({ id: c.id, reason: `contract: ${problem}` });
        }
    }

    const decision = parseKiraDecision(reply);

    if (contract === "moderation" && c.expect.classification && decision.classification !== c.expect.classification) {
        failures.push({
            id: c.id,
            reason: `classification: expected ${c.expect.classification}, parsed ${decision.classification}`,
        });
    }

    if (contract === "moderation" && c.expect.action && decision.action !== c.expect.action) {
        failures.push({
            id: c.id,
            reason: `action: expected ${c.expect.action}, parsed ${decision.action}`,
        });
    }

    if (c.expect.trustScore !== undefined) {
        const parsed = parseTrustScore(reply);
        if (parsed !== c.expect.trustScore) {
            failures.push({
                id: c.id,
                reason: `trustScore: expected ${c.expect.trustScore}, parsed ${parsed}`,
            });
        }
    }

    // Case-insensitive: these assert on prose, where casing is not the point.
    const haystack = reply.toLowerCase();

    for (const needle of c.expect.contains ?? []) {
        if (!haystack.includes(needle.toLowerCase())) {
            failures.push({ id: c.id, reason: `missing required text: "${needle}"` });
        }
    }

    for (const needle of c.expect.excludes ?? []) {
        if (haystack.includes(needle.toLowerCase())) {
            failures.push({ id: c.id, reason: `contains forbidden text: "${needle}"` });
        }
    }

    // Whole-word forbidden terms — see `excludesWord` on the type for why a
    // substring test is wrong for a name.
    // Boundaries are letters and digits only — deliberately NOT `\b`, which
    // counts `_` as a word character and would therefore miss `Mira_Mindfully`.
    // That is the literal shape of a Mind's name, and the persona blurb these
    // assertions exist to catch reads `Name: Sage_Mindfully`, so `\bSage\b`
    // would have passed the exact failure it was added for.
    for (const needle of c.expect.excludesWord ?? []) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
        if (re.test(reply)) {
            failures.push({ id: c.id, reason: `contains forbidden name: "${needle}"` });
        }
    }

    const any = c.expect.containsAny;
    if (any?.length) {
        // A flat list is one group. Nested lists are several, each of which must
        // match — see the type. Both shapes score identically for one group, so
        // every existing fixture is unaffected.
        const groups: string[][] = Array.isArray(any[0])
            ? (any as string[][])
            : [any as string[]];

        for (const group of groups) {
            if (group.length && !group.some((n) => haystack.includes(n.toLowerCase()))) {
                failures.push({
                    id: c.id,
                    reason: `none of these appeared, expected at least one: ${group.map((n) => `"${n}"`).join(", ")}`,
                });
            }
        }
    }

    if (c.expect.maxChars !== undefined && reply.length > c.expect.maxChars) {
        failures.push({
            id: c.id,
            reason: `too long: ${reply.length} chars, limit ${c.expect.maxChars}`,
        });
    }

    const words = reply.trim().split(/\s+/).filter(Boolean).length;
    if (c.expect.maxWords !== undefined && words > c.expect.maxWords) {
        failures.push({
            id: c.id,
            reason: `too long: ${words} words, limit ${c.expect.maxWords}`,
        });
    }

    return failures;
}

/**
 * Did the reply repeat a fence delimiter back?
 *
 * Every Skill here is told the identifier on the fence lines is a random
 * delimiter — not content, not an id, carrying no meaning — and never to repeat
 * it. A Vigil that echoes it has read structure as data, which is the failure
 * that once had one reading the nonce as part of a member's identity,
 * concluding the bot was replaying joins, and refusing to welcome anyone.
 *
 * This cannot be a fixture assertion: the nonce is regenerated per prompt, so a
 * literal in `excludes` is a string that can never appear. Fixtures did carry
 * such literals, back when the prompts were transcriptions with a nonce frozen
 * into them — the assertion looked real and tested nothing the moment the
 * prompts became generated. Reading it off the prompt is the only version that
 * works.
 */
function nonceLeaks(prompt: string, reply: string): string[] {
    const nonces = new Set(
        [...prompt.matchAll(/^--- (?:BEGIN|END) UNTRUSTED INPUT ([0-9a-f]+) ---$/gm)].map(
            (m) => m[1]
        )
    );
    const lower = reply.toLowerCase();
    return [...nonces].filter((n) => lower.includes(n.toLowerCase()));
}

/**
 * Is each reply actually the answer to its own prompt?
 *
 * Worth checking separately from scoring, because a mispaired reply does not
 * look like an error — it looks like a Skill that answered the wrong question,
 * and it will send you off editing a Skill that is behaving correctly. An
 * eleven-case run produced four of them before this existed.
 *
 * Two signals. A duplicate reply is conclusive: the same text cannot be the
 * answer to two prompts. A reply that never names the person it is welcoming is
 * suggestive rather than certain — a Skill may legitimately not use the name —
 * so it is reported and left to you.
 */
/**
 * Word-bigram overlap, 0..1. Cheap, and it does not care about the reordered
 * articles and swapped tenses that stop two answers being byte-identical.
 */
function similarity(a: string, b: string): number {
    const grams = (t: string) => {
        const w = t.toLowerCase().match(/\w+/g) ?? [];
        return new Set(w.slice(0, -1).map((x, i) => `${x} ${w[i + 1]}`));
    };
    const A = grams(a), B = grams(b);
    if (A.size === 0 || B.size === 0) return 0;
    let shared = 0;
    for (const g of A) if (B.has(g)) shared++;
    return (2 * shared) / (A.size + B.size);
}

/**
 * Above this, two replies are treated as the same answer wearing different
 * articles. Calibrated on real runs: the worst legitimate overlap measured was
 * 0.59 — three cold-start summaries that genuinely say the same thing about
 * having nothing to describe — while a reply that answered the wrong prompt
 * scored 0.94. The gap is wide, so the threshold sits in the middle of it.
 */
const NEAR_DUPLICATE = 0.75;

function pairingNotes(
    recorded: Recorded[],
    cases: EvalCase[]
): Map<string, string> {
    const notes = new Map<string, string>();
    const firstSeen = new Map<string, string>();
    const byId = new Map(cases.map((c) => [c.id, c]));

    for (const r of recorded) {
        const body = r.reply.trim();
        const earlier = firstSeen.get(body);
        if (earlier) {
            notes.set(
                r.id,
                `identical to "${earlier}" — one reply cannot answer two prompts`
            );
            continue;
        }

        // Byte-identity is too strict on its own. A Vigil that carries one
        // case's analysis over to the next rewords it just enough to slip the
        // check: two replies scored 0.94 similar, and the second described a
        // slur and an injection attempt that were in the OTHER case's message.
        // Both passed every assertion, because the vocabulary overlapped.
        //
        // Two cases may share an input on purpose, though — the moderator suite
        // sends one Spanish message twice to compare a set language tag against
        // an inferred one, and near-identical replies there are the correct
        // answer. So compare what the case was actually asked about, which is
        // the fenced member message when there is one. Prompt-level comparison
        // cannot do this: the fence preamble and instructions dominate, and
        // both pairs score about 90% either way.
        const asked = (p: string) =>
            p.match(/^MEMBER MESSAGE: (.+)$/m)?.[1].trim() ?? p;
        let worst = { id: "", score: 0 };
        for (const [seen, id] of firstSeen) {
            const other = recorded.find((x) => x.id === id);
            if (other && asked(other.prompt) === asked(r.prompt)) continue;
            const score = similarity(body, seen);
            if (score > worst.score) worst = { id, score };
        }
        if (worst.score >= NEAR_DUPLICATE) {
            notes.set(
                r.id,
                `${Math.round(worst.score * 100)}% the same answer as "${worst.id}", which was asked about a different message — check it is about ITS OWN`
            );
        }

        firstSeen.set(body, r.id);

        // A case can opt out — see `namesMember`.
        if (byId.get(r.id)?.expect.namesMember === false) continue;

        const sent = r.prompt.match(/^DISPLAY NAME:[ \t]*(.+)$/m)?.[1].trim();
        if (!sent) continue;
        // First token: "Elena Ionescu" is commonly greeted as "Elena".
        const token = sent.split(/\s+/)[0];
        if (token.length >= 3 && !r.reply.toLowerCase().includes(token.toLowerCase())) {
            notes.set(r.id, `reply never names "${sent}" — may belong to another case`);
        }
    }

    return notes;
}

// ---- Pre-filter (free) ----

function runPrefilter(cases: PrefilterCase[]): Failure[] {
    const failures: Failure[] = [];

    for (const c of cases) {
        const event: CommunityMessageEvent = {
            platform: "telegram",
            communityId: "eval",
            channelId: "eval",
            channel: c.channel,
            userId: c.userId,
            displayName: c.displayName,
            content: c.message,
            timestamp: new Date().toISOString(),
        };

        const result = preFilterWithMetrics(event);
        const ok = result.pass === c.expectPass;
        console.log(
            `  ${ok ? "ok  " : "FAIL"}  ${c.id} — ${result.pass ? "PASS (no swarm)" : "FLAG (swarm runs)"} · ${result.reason}`
        );
        if (!ok) {
            failures.push({
                id: c.id,
                reason: `pre-filter expected pass=${c.expectPass}, got ${result.pass}`,
            });
        }
    }

    return failures;
}

// ---- Main ----

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
}

/** Every value given for a repeatable flag, comma-separated lists expanded. */
function argList(name: string): string[] {
    const out: string[] = [];
    process.argv.forEach((a, i) => {
        if (a !== name) return;
        const value = process.argv[i + 1];
        if (!value || value.startsWith("--")) return;
        out.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    });
    return out;
}

async function main() {
    const fixturePath = process.argv[2];
    if (!fixturePath || fixturePath.startsWith("--")) {
        console.error(
            "Usage: eval-skill.ts <fixtures.json> [--dry] [--case id] [--replay run.json] [--limit n]"
        );
        process.exit(1);
    }

    const fixtures: Fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
    const dry = process.argv.includes("--dry");
    const replayPath = arg("--replay");
    const limit = arg("--limit");

    // `--case a,b` or `--case a --case b`. Re-running a subset is the normal
    // operation once a run has suspect or failing cases, so it should not take
    // one process per case.
    const only = argList("--case");

    let cases = fixtures.cases;
    if (fixtures.maxWords !== undefined) {
        for (const c of cases) {
            if (c.expect.maxWords === undefined) c.expect.maxWords = fixtures.maxWords;
        }
    }
    if (only.length > 0) {
        const known = new Set(fixtures.cases.map((c) => c.id));
        const unknown = only.filter((id) => !known.has(id));
        if (unknown.length > 0) {
            // A typo used to surface as "No cases matched", which reads like the
            // fixture is empty. Name what was wrong and what is available.
            console.error(
                `Unknown case id(s): ${unknown.join(", ")}\n\nAvailable:\n` +
                fixtures.cases.map((c) => `  ${c.id}`).join("\n")
            );
            process.exit(1);
        }
        // Fixture order, not command-line order, so a subset run is comparable
        // to the full suite.
        cases = cases.filter((c) => only.includes(c.id));
    }

    if (limit) cases = cases.slice(0, Number(limit));
    if (cases.length === 0) {
        console.error(`No cases matched.`);
        process.exit(1);
    }

    // A DIFFERENT name per case, and different again on the next run.
    //
    // ON BY DEFAULT, always — not just for single-case runs. A Vigil that sees
    // the same person "join" repeatedly correctly reads it as a replayed event
    // and stops welcoming them. Ours did, emailed about it, and confirmed it
    // would do the same again knowing it was a harness: "same display name plus
    // repeated joins is still suspicious from where I sit […] I'd rather slow
    // down and ask than send a seventh welcome to one person."
    //
    // The fixtures' own names are therefore single-use. `--fresh` does NOT help:
    // it starts a new conversation, but memory lives on the MIND and outlives
    // every conversation — which is the entire point of it. Once a fixture name
    // has been through a run it is burned, so the suite cannot reuse its own.
    //
    // The Vigil is right, so the harness accommodates it rather than arguing.
    // `--no-vary-names` opts out when you deliberately want to test that hold.
    const varyNames = !process.argv.includes("--no-vary-names");
    const names = standInNames(cases.length);
    const nameFor = new Map(cases.map((c, i) => [c.id, names[i] ?? c.displayName]));

    const buildPrompt = (c: EvalCase): string => {
        const displayName = varyNames
            ? (nameFor.get(c.id) ?? c.displayName)
            : c.displayName;
        // Per-case wins, fixture-level is the default. An explicit "" means
        // "unset", so a suite with a default can still test the absent path.
        const language =
            (c.language !== undefined ? c.language : fixtures.language) || undefined;

        // `observed` is appended after whichever builder ran, for every style
        // including "raw". It used to be appended inside two branches only,
        // which meant a case with another style declared it and silently got
        // nothing — the same shape as the `language` field in §7.
        const withObserved = (prompt: string) =>
            c.observed ? `${prompt}\n\n${c.observed}` : prompt;

        switch (c.promptStyle ?? fixtures.promptStyle) {
            case "raw":
                return withObserved(c.message ?? "");
            case "culture":
                return withObserved(
                    buildCultureEvaluationPrompt(
                        { content: c.message ?? "", channel: c.channel ?? "" },
                        c.cultureNotes,
                        language
                    )
                );
            case "culture-summary":
                return withObserved(buildCultureSummaryPrompt(c.cultureNotes));
            case "culture-norm-update":
                return withObserved(
                    buildNormUpdatePrompt(
                        {
                            content: c.message ?? "",
                            channel: c.channel ?? "",
                            displayName,
                        },
                        {
                            action: c.decision?.action ?? "none",
                            reasoning: c.decision?.reasoning ?? "",
                        }
                    )
                );
            case "culture-override":
                return withObserved(
                    buildCultureOverridePrompt(
                        c.channel ?? "",
                        c.message ?? "",
                        c.creator?.decision ?? "",
                        c.creator?.reasoning ?? ""
                    )
                );
            case "culture-digest":
                return withObserved(CULTURE_DIGEST_PROMPT);
            case "health-channels":
                return withObserved(CHANNELS_QUESTION_PROMPT);
            case "health-digest":
                return withObserved(
                    buildHealthDigestPrompt({
                        members: c.digest?.members ?? "No data available.",
                        culture: c.digest?.culture ?? "No data available.",
                        moderation: c.digest?.moderation ?? "No data available.",
                        onboarding: c.digest?.onboarding ?? "No data available.",
                    })
                );
            case "status":
                return withObserved(STATUS_CHECK_PROMPT);
            case "welcome":
                return buildWelcomePrompt(
                    { displayName },
                    {
                        culture: c.culturalContext ?? "",
                        activity: c.activityContext ?? "",
                        ambassadors: c.ambassadorContext ?? "",
                    },
                    language
                );
            default:
                return buildModerationPrompt(
                    {
                        content: c.message ?? "",
                        channel: c.channel ?? "",
                        displayName,
                    },
                    c.trustContext ?? "",
                    c.culturalContext ?? "",
                    language
                );
        }
    };

    const contract: "moderation" | "none" =
        fixtures.contract ??
        (fixtures.promptStyle === undefined || fixtures.promptStyle === "moderation"
            ? "moderation"
            : "none");

    console.log(`\nRole:  ${fixtures.role}  (alias ${fixtures.alias})`);
    console.log(
        `Cases: ${cases.length}${only.length > 0 ? ` (filtered to ${only.join(", ")})` : ""}\n`
    );

    // A declared language that the prompt style cannot carry is worse than no
    // language at all: the fixture reads as if it tests the tagged path while
    // sending the untagged prompt, and nothing says so. That went unnoticed on
    // the culture suite until the prompts were generated — every case declared
    // "en", the raw path returned `message` verbatim, and production was
    // appending a line the eval never sent.
    //
    // Only `moderation`, `welcome` and `culture` take a language. `raw` sends
    // the message as typed, and the culture summary genuinely has no directive
    // in production — the welcome prompt carries the language for that path, so
    // there is nothing to thread. Set `language: ""` on such a case to say
    // "untagged, deliberately".
    const TAKES_LANGUAGE: PromptStyle[] = ["moderation", "welcome", "culture"];
    const dropsLanguage = cases.filter((c) => {
        const style = c.promptStyle ?? fixtures.promptStyle ?? "moderation";
        if (TAKES_LANGUAGE.includes(style)) return false;
        return ((c.language !== undefined ? c.language : fixtures.language) || "") !== "";
    });
    if (dropsLanguage.length > 0) {
        console.log(
            `note: ${dropsLanguage.length} case(s) declare a language their prompt style discards —\n` +
            `      ${dropsLanguage.map((c) => c.id).join(", ")}\n` +
            `      The prompt sent carries no language line. Set language: "" if that is intended.\n`
        );
    }

    // --- Free checks first ---
    let failures: Failure[] = [];
    if (fixtures.prefilter?.length && only.length === 0) {
        console.log("pre-filter (local, no tokens)");
        failures = failures.concat(runPrefilter(fixtures.prefilter));
        console.log();
    }

    // --- Dry: show exactly what would be sent, spend nothing ---
    if (dry) {
        for (const c of cases) {
            console.log(`${"─".repeat(60)}\n${c.id}\n${"─".repeat(60)}`);
            console.log(buildPrompt(c));
            console.log();
        }
        console.log(`${cases.length} prompts shown. No calls made.\n`);
        process.exit(failures.length === 0 ? 0 : 1);
    }

    // --- Stage 0: score a reply you wrote by hand, before any Mind exists ---
    // If the output format you intend does not satisfy the contract, find out
    // here rather than after spending a call on it.
    const checkReplyPath = arg("--check-reply");
    if (checkReplyPath) {
        const reply = readFileSync(checkReplyPath, "utf8");
        const target = cases[0];
        console.log(`checking ${checkReplyPath} against case "${target.id}"\n`);

        const caseFailures = scoreCase(
            target,
            reply,
            target.contract ?? contract,
            buildPrompt(target)
        );
        if (caseFailures.length === 0) {
            console.log("  ok    the intended output satisfies the contract\n");
        } else {
            for (const f of caseFailures) console.log(`  FAIL  ${f.reason}`);
            console.log();
        }
        process.exit(caseFailures.length === 0 && failures.length === 0 ? 0 : 1);
    }

    // --- Get replies: from a recording, or live ---
    let recorded: Recorded[];

    if (replayPath) {
        const run = JSON.parse(readFileSync(replayPath, "utf8")) as {
            recorded: Recorded[];
        };
        const wanted = new Set(cases.map((c) => c.id));
        recorded = run.recorded.filter((r) => wanted.has(r.id));
        console.log(`replaying ${recorded.length} recorded replies (no tokens)\n`);
    } else {
        const apiKey = process.env.MINDS_BUILDER_API_KEY;
        if (!apiKey) {
            console.error("MINDS_BUILDER_API_KEY is not set. Pass --env-file=.env.local");
            process.exit(1);
        }

        const client = await getCreatorClient(apiKey);
        const mindId = await resolveMindId(client, fixtures, arg("--mind"));
        // Which alias the queries actually go to. `--fresh` swaps this for a
        // throwaway so the run starts with no conversation history.
        let alias = fixtures.alias;
        console.log(`mind:  ${mindId}`);

        // Abort, do not merely record. The entire point of --expect-skill is to
        // avoid spending a run on something that is not loaded; noting it in the
        // results after eleven calls and 66 credits is too late to be useful.
        const setupFailures = await reportEquipped(
            client,
            mindId,
            arg("--expect-skill")
        );
        if (setupFailures.length > 0) {
            console.error(
                `\nStopping before any call. The Skill you asked to test is not equipped\n` +
                `on this Mind — the ids listed above are what is actually loaded.\n` +
                `Nothing was spent.\n`
            );
            process.exit(1);
        }

        // A conversation carries memory, so a second run of the same fixture
        // sees the first — and after a Skill edit the old behaviour is still
        // sitting in the history as context. Reset between revisions or you
        // are measuring the conversation, not the Skill.
        // A conversation cannot be cleared — the SDK has createConversation,
        // ensureConversation, getConversation and getHistory, but nothing that
        // deletes or resets one. So "fresh" means a fresh ALIAS: same Mind, new
        // conversation, no prior history. Skills are equipped on the MIND, not
        // the conversation, so the Skill under test still applies.
        //
        // Side benefit: eval traffic never lands in the production alias's
        // history, so it cannot pollute the real swarm's memory of a community.
        //
        // ONE CONVERSATION PER CASE, not one per run. A conversation holds at
        // most one outstanding question, so there is nothing to mispair — which
        // is the only fix that addresses the cause rather than detecting the
        // symptom. Sharing a conversation across eleven rapid calls produced
        // seven mispaired replies in a single run, and the Vigil independently
        // reported the same thing from its side: replies matched to whichever
        // request was most recent rather than the one they were written for.
        //
        // Conversations are free — no cognition — so this costs nothing.
        const fresh = process.argv.includes("--fresh");
        if (fresh) {
            console.log(
                `conversation: one fresh alias per case (nothing to mispair)`
            );
        } else {
            console.log(
                `conversation: reusing ${alias} and its history — pass --fresh after editing the Skill`
            );
        }

        const startedAt = new Date().toISOString();

        console.log(`\nquerying ${mindId} — ${cases.length} calls\n`);
        recorded = [];

        // Two silent replies in a row is never a property of case three. It
        // means something systemic: the Mind is holding, dormant, unequipped or
        // misconfigured. Continuing costs a full timeout AND a cycle's cognition
        // per remaining case and produces nothing scoreable — an eleven-case
        // suite spends twenty minutes proving the same thing eleven times.
        let consecutiveFailures = 0;
        let abandoned = 0;

        for (const c of cases) {
            if (fresh) {
                alias = `${fixtures.alias}-eval-${crypto.randomUUID().slice(0, 8)}`;
                await client.createConversation({ alias, mindId });
            }

            const prompt = buildPrompt(c);
            const started = Date.now();
            const reply = await queryVigil(
                apiKey,
                alias as VigilAlias,
                prompt,
                Number(arg("--timeout") ?? VIGIL_TIMEOUT_MS)
            );
            recorded.push({
                id: c.id,
                prompt,
                reply,
                ms: Date.now() - started,
                alias,
            });

            if (isVigilFailure(reply)) {
                consecutiveFailures++;
                // Name the conversation on failure. A silent case is exactly
                // the one you need to go and read, and it is unreachable
                // without its alias.
                console.log(`\n  no reply — inspect: ${alias}`);
            } else {
                consecutiveFailures = 0;
                process.stdout.write(".");
            }

            if (consecutiveFailures >= 2) {
                abandoned = cases.length - recorded.length;
                console.log(
                    `\n\nstopped after ${recorded.length} of ${cases.length}: two silent replies in a row.\n` +
                    `  Not a bad case — something systemic. Check, in this order:\n` +
                    `    · is the Vigil holding? it emails the creator when it does\n` +
                    `    · is it awake? nudge it from the Minds dashboard\n` +
                    `    · are the Skills above actually the ones you meant to test?\n` +
                    `  ${abandoned} case(s) not run — that is ~${((abandoned * Number(arg("--timeout") ?? VIGIL_TIMEOUT_MS)) / 60000).toFixed(0)} min and their cognition saved.`
                );
                break;
            }
        }
        console.log("\n");

        const endedAt = new Date().toISOString();
        const used = await usageBetween(client, mindId, startedAt, endedAt);
        const left = await balance(client, mindId);
        const leftNote = left === null ? "" : ` · ~${left.toFixed(2)} left`;

        if (used === null) {
            console.log(`cognition: usage unavailable${leftNote}\n`);
        } else if (used === 0) {
            console.log(
                `cognition: nothing recorded yet for ${startedAt} … ${endedAt}${leftNote}\n` +
                `           the ledger settles asynchronously — re-check that window later,\n` +
                `           or read the Minds dashboard.\n`
            );
        } else {
            console.log(
                `cognition: ${used.toFixed(2)} used (${(used / cases.length).toFixed(2)}/case)${leftNote}`
            );
            const byTool = await usageByTool(client, mindId, startedAt, endedAt);
            for (const r of byTool ?? []) {
                console.log(
                    `           ${r.tool.padEnd(22)} calls=${String(r.callCount).padStart(3)}  credits=${r.creditsUsed.toFixed(2)}`
                );
            }
            console.log();
        }

        // Recordings live beside the fixtures they came from, so everything
        // about a role stays in that role's folder. `.runs/` is gitignored.
        const runsDir = join(dirname(fixturePath), ".runs");
        mkdirSync(runsDir, { recursive: true });
        const out = join(
            runsDir,
            `${fixtures.role}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
        );
        writeFileSync(out, JSON.stringify({ fixturePath, recorded }, null, 2));
        console.log(`recorded → ${out}`);
        console.log(`re-score for free with: --replay ${out}\n`);
    }

    // --- Score ---
    const notes = pairingNotes(recorded, cases);

    console.log("results");
    for (const c of cases) {
        const rec = recorded.find((r) => r.id === c.id);
        if (!rec) {
            failures.push({ id: c.id, reason: "no reply recorded" });
            console.log(`  FAIL  ${c.id} — no reply recorded`);
            continue;
        }

        // No reply at all — a timeout, or a duplicate the client refused to
        // hand out twice. Scoring the sentinel string produces a page of
        // "missing required text" that says nothing about the Skill.
        if (isVigilFailure(rec.reply)) {
            failures.push({ id: c.id, reason: `no reply: ${rec.reply}` });
            console.log(
                `  NO REPLY  ${c.id} (${(rec.ms / 1000).toFixed(1)}s) — ${rec.reply}\n` +
                `          cognition was still spent. Re-run this case.`
            );
            continue;
        }

        // A reply that is not this case's reply cannot tell you anything about
        // the Skill, in either direction. Say so instead of scoring it.
        const note = notes.get(c.id);
        if (note) {
            failures.push({ id: c.id, reason: `pairing: ${note}` });
            console.log(`  SUSPECT  ${c.id}\n          ${note}`);
            continue;
        }

        const caseFailures = scoreCase(c, rec.reply, c.contract ?? contract, rec.prompt);
        failures = failures.concat(caseFailures);

        // Not a failure — the adapter strips it — but worth seeing. A Skill
        // that keeps emitting markup is one regression away from a platform
        // that has no normaliser.
        const markup = containsMarkup(rec.reply) ? "  · markup stripped" : "";
        const delivered = toPlainText(rec.reply);

        if (caseFailures.length === 0) {
            console.log(
                `  ok    ${c.id}${rec.ms ? ` (${(rec.ms / 1000).toFixed(1)}s)` : ""}${markup}`
            );
        } else {
            console.log(`  FAIL  ${c.id}${markup}`);
            for (const f of caseFailures) console.log(`          ${f.reason}`);
            console.log(
                `          delivered: ${delivered.slice(0, 160).replace(/\n/g, " ⏎ ")}${delivered.length > 160 ? "…" : ""}`
            );
        }
    }

    const passed = cases.length - new Set(failures.map((f) => f.id)).size;
    // A case with no reply is counted as that, not as a mispairing — the two
    // need different actions, and a discarded duplicate has no reply to pair.
    const suspect = cases.filter((c) => {
        const rec = recorded.find((r) => r.id === c.id);
        return rec && !isVigilFailure(rec.reply) && notes.has(c.id);
    }).length;
    const noReply = cases.filter((c) => {
        const rec = recorded.find((r) => r.id === c.id);
        return rec && isVigilFailure(rec.reply);
    }).length;
    if (noReply > 0) {
        console.log(
            `${noReply} NO REPLY — timed out, or a duplicate the client refused to hand out\ntwice. Cognition was spent on each. Re-run them.`
        );
    }
    console.log(`\n${passed}/${cases.length} cases clean, ${failures.length} problems`);
    if (suspect > 0) {
        console.log(
            `${suspect} SUSPECT — replies not paired with their prompts. Do NOT edit the Skill\n` +
            `on these; re-run them. A slow reply lands after its own wait elapses and is\n` +
            `picked up by the next call, so one timeout desynchronises everything after it.`
        );
    }
    console.log();
    process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error("\nEval threw:", err);
    process.exit(1);
});
