// ============================================================
// mindfully.gg — Pre-Filter Module
//
// Lightweight local classifier that runs BEFORE the Minds swarm.
// Catches obviously safe messages (no cognition cost) and only
// sends ambiguous/suspicious messages through the full
// Vera → Sage → Kira chain.
//
// Goal: reduce cognition consumption by ~80% without
// sacrificing moderation quality.
// ============================================================

import type { CommunityMessageEvent } from "@/types";

// --- Types ---

export type PreFilterResult =
    | { pass: true; reason: string }                    // Skip the swarm — clearly safe
    | { pass: false; reason: string; flags: string[] }; // Send to swarm — needs evaluation

export interface PreFilterConfig {
    /** Trust score threshold — members above this skip the filter (default: 60) */
    trustedThreshold: number;

    /** Minimum message length to bother checking (default: 3) */
    minLength: number;

    /** Maximum age of cached trust score in ms before re-querying Vera (default: 1 hour) */
    trustCacheTtlMs: number;

    /** Channels to always filter (never skip) regardless of trust (default: []) */
    alwaysFilterChannels: string[];

    /** Channels to never filter (always skip) — e.g. mod-only channels (default: []) */
    neverFilterChannels: string[];

    /**
     * Terms this community's creator will not tolerate, from
     * `CommunityBinding.blockedTerms`.
     *
     * Matched at the **hard** tier — always flagged, trust ignored. The creator
     * chose these deliberately, so a good reputation should not buy a pass on
     * them. Whole-word, case-insensitive, and escaped before compiling.
     */
    blockedTerms: string[];

    /** Enable/disable specific filter stages */
    enableHardPatterns: boolean;
    enableSoftPatterns: boolean;
    enableSpamDetection: boolean;
    enableLinkDetection: boolean;
}

const DEFAULT_CONFIG: PreFilterConfig = {
    trustedThreshold: 60,
    minLength: 3,
    trustCacheTtlMs: 60 * 60 * 1000, // 1 hour
    alwaysFilterChannels: [],
    neverFilterChannels: [],
    blockedTerms: [],
    enableHardPatterns: true,
    enableSoftPatterns: true,
    enableSpamDetection: true,
    enableLinkDetection: true,
};

// --- Trust Score Cache ---

interface CachedScore {
    score: number;
    timestamp: number;
}

const trustCache = new Map<string, CachedScore>();

/**
 * Cache a member's trust score locally.
 * Called after Vera responds, so subsequent messages
 * from the same member don't need to query Vera again.
 */
export function cacheTrustScore(
    communityId: string,
    userId: string,
    score: number
): void {
    const key = `${communityId}:${userId}`;
    trustCache.set(key, { score, timestamp: Date.now() });
}

/**
 * Get a cached trust score. Returns null if not cached or expired.
 */
export function getCachedTrustScore(
    communityId: string,
    userId: string,
    ttlMs: number = DEFAULT_CONFIG.trustCacheTtlMs
): number | null {
    const key = `${communityId}:${userId}`;
    const cached = trustCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > ttlMs) {
        trustCache.delete(key);
        return null;
    }
    return cached.score;
}

/**
 * Invalidate a member's cached trust score.
 * Called after mod actions that change their score.
 */
export function invalidateTrustCache(
    communityId: string,
    userId: string
): void {
    trustCache.delete(`${communityId}:${userId}`);
}

/**
 * Clear all cached scores for a community.
 */
export function clearCommunityCache(communityId: string): void {
    for (const key of trustCache.keys()) {
        if (key.startsWith(`${communityId}:`)) {
            trustCache.delete(key);
        }
    }
}

// --- Hard Pattern Detection ---
// These ALWAYS trigger the full swarm regardless of trust score.
// False negatives here are dangerous — keep patterns tight.

const HARD_PATTERNS: RegExp[] = [
    // Slurs and hate speech markers (abbreviated — expand for production)
    /\bn[i1!][g9][g9][e3]r/i,
    /\bf[a@]g+[o0]t/i,
    /\bk[i1!]ke\b/i,
    /\btr[a@]nn[yi1!e3]/i,

    // Threats
    /\b(kill|murder|shoot|stab|bomb)\s+(you|him|her|them|everyone)/i,
    /\bi('?ll|will)\s+(kill|murder|shoot|stab|hurt)\b/i,
    /\bdeath\s+threat/i,

    // Doxxing patterns
    /\b(doxx|dox)(ed|ing)?\b/i,
    /\bhome\s+address\b/i,
    /\breal\s+name\s+is\b/i,

    // NSFW in text
    /\b(porn|hentai|nsfw)\b/i,

    // Self-harm
    /\b(kill|hurt)\s+my\s*self\b/i,
];

// --- Soft Pattern Detection ---
// These flag messages for swarm review but aren't auto-violations.
// High-trust members get a pass on these; low-trust members don't.

const SOFT_PATTERNS: { pattern: RegExp; flag: string }[] = [
    // Aggression / insults
    { pattern: /\b(idiot|stupid|dumb|moron|brain\s*dead)\b/i, flag: "insult-language" },
    { pattern: /\bshut\s+(the\s+f+|up)\b/i, flag: "aggressive-language" },
    { pattern: /\bf+[u*]c*k\s+(you|off|this)/i, flag: "directed-profanity" },
    // Contempt aimed at a person, in any phrasing.
    //
    // This used to require the adjective to follow "you're" or "you are"
    // IMMEDIATELY, which meant it caught one sentence shape and nothing else.
    // `"you people are all worthless scum, get out of here"` passed the filter
    // entirely and never reached the swarm — nobody looked at it.
    //
    // Now the subject and the word can be separated. `SOFT_TERMS` below carries
    // the rest, without needing a subject at all.
    {
        pattern:
            /\byou\b[^.!?\n]{0,40}\b(trash|garbage|worthless|useless|pathetic|clueless)\b/i,
        flag: "personal-attack",
    },

    // Shilling / promotion
    { pattern: /\bDM\s+me\b/i, flag: "dm-solicitation" },
    { pattern: /\b(buy|invest|check out)\s+(my|this|our)\b/i, flag: "promotion" },
    { pattern: /\b(airdrop|whitelist|presale|mint)\b/i, flag: "crypto-promotion" },
    { pattern: /\b(earn|make)\s+\$?\d+/i, flag: "financial-claim" },
    { pattern: /\b(join|click|sign\s+up)\b.*https?:\/\//i, flag: "link-promotion" },

    // Scam patterns
    { pattern: /\b(send|transfer)\s+\d+\s*(eth|btc|sol|usdt|usdc)/i, flag: "fund-request" },
    { pattern: /\bwallet\s+(address|connect)/i, flag: "wallet-solicitation" },
    { pattern: /\bdouble\s+your\b/i, flag: "scam-pattern" },
    { pattern: /\bguaranteed\s+(return|profit)/i, flag: "scam-pattern" },
];

// --- Short messages ---

/**
 * Short messages that are ordinary conversation, not a flood.
 *
 * The micro-message rule flags anything under five characters. That is right in
 * principle — `kys`, `die` and `scum` all fit, and losing them is exactly the
 * gap this filter exists to close — but it also caught every `gm` in a trading
 * community whose morning ritual is saying `gm`. Each one cost three Vigil
 * calls, roughly 18 credits, and minutes of latency, to conclude that someone
 * said good morning.
 *
 * So the fix is an allowlist rather than raising the threshold: a short message
 * skips the flood check only when it is one of these exact tokens. Anything
 * short and unrecognised still goes to the swarm.
 *
 * Matched case-insensitively against the message with trailing punctuation and
 * whitespace stripped, so `GM!` and `ok.` are covered. Keep this list to
 * greetings and acknowledgements — every entry is a phrase no human moderator
 * would look at twice.
 */
// NOTE: entries of one or two characters never reach this check — `minLength`
// (3) returns pass before any spam indicator runs, so `gm` and `ok` were always
// free. They are kept anyway, because the day someone lowers minLength is the
// day this list has to already contain them. What earns its keep here is the
// 3-4 character band: `gmgm`, `lol`, `nope`, `haha`.
const SHORT_SAFE = new Set([
    "gm", "gmgm", "gmgn", "gn", "gg", "ggs", "ga", "hi", "hey", "yo", "sup",
    "hola", "ola", "ok", "okay", "k", "kk", "ty", "thx", "tks", "np", "yw",
    "yes", "yep", "yup", "ya", "no", "nope", "nah",
    "lol", "lmao", "haha", "hah", "heh", "ha",
    "+1", "same", "this", "true", "nice", "cool", "wow", "oof", "rip",
    "wb", "brb", "afk", "bye", "cya", "o7",
]);

/** True when a short message is ordinary chatter rather than a possible flood. */
function isShortSafe(message: string): boolean {
    const bare = message
        .trim()
        // Strip trailing punctuation and repeated marks: "gm!!!" → "gm".
        .replace(/[!?.,;:~\-—…]+$/u, "")
        .trim()
        .toLowerCase();

    if (bare.length === 0) return false;
    if (SHORT_SAFE.has(bare)) return true;

    // Emoji-only reactions. A thumbs-up is not a flood, and the emoji-spam rule
    // above already catches more than five of them.
    return /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u.test(bare);
}

// --- Abusive terms ---

/**
 * Dehumanising language. Always flagged, regardless of trust.
 *
 * Separate from HARD_PATTERNS because these are not slurs — they carry no
 * protected characteristic — but they are not ambiguous either. There is no
 * community whose culture makes calling a member `vermin` unremarkable, and no
 * trust score that should let it through unlooked-at.
 *
 * Deliberately short. Every entry has to survive the question *"is there a
 * reading of this that a moderator would not want to see?"* — `parasite` stays
 * because it is aimed at people; `toxic` does not, because half of crypto
 * Twitter describes charts that way.
 */
const HARD_TERMS = [
    "scum", "vermin", "subhuman", "parasite", "degenerate filth",
    "waste of oxygen", "waste of space", "worthless piece",
];

/**
 * Contempt that only ever describes a person.
 *
 * **Nouns for people, never adjectives for things.** That distinction is the
 * whole rule, and getting it wrong is expensive: an early version included
 * `trash` and `garbage`, and `"that chart is garbage"` and `"this whole sector
 * is trash"` both flagged — constant traffic in a trading community, at roughly
 * eighteen credits each. Nobody calls a chart a `clown`.
 *
 * Adjectives that *can* aim at a person are handled by the `personal-attack`
 * pattern above, which requires a "you" nearby. That is what separates
 * `"you're worthless"` from `"this sector is worthless"`.
 *
 * Trust-gated: a member the trust keeper has vouched for is not re-judged for
 * calling someone a clown, which is usually banter among people who know each
 * other. A stranger doing it gets looked at.
 */
const SOFT_TERMS = ["loser", "clown", "imbecile", "cretin", "halfwit"];

/**
 * Build a case-insensitive whole-word matcher for a list of terms.
 *
 * Terms are escaped even though these two lists are ours, because
 * `blockedTerms` from a creator will use the same helper — and an unescaped
 * `(a+)+` is a ReDoS while `.*` matches every message ever sent.
 *
 * `\b` on each side means `scum` does not fire on `scumbled`, and a
 * multi-word term still matches across its internal space.
 */
function termMatcher(terms: string[]): RegExp {
    const parts = terms
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => {
            const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // `\b` is a transition between a word and a non-word character, so
            // it only means anything next to a word character. Wrapping every
            // term unconditionally silently broke any term starting or ending
            // with punctuation — a ticker like `$RUG` or a handle like
            // `@spammer`, both of which a crypto community would plausibly
            // block, could never match. Add each boundary only where it can.
            const lead = /^\w/.test(t) ? "\\b" : "";
            const tail = /\w$/.test(t) ? "\\b" : "";
            return `${lead}${escaped}${tail}`;
        });
    return new RegExp(`(${parts.join("|")})`, "i");
}

const HARD_TERM_PATTERN = termMatcher(HARD_TERMS);
const SOFT_TERM_PATTERN = termMatcher(SOFT_TERMS);

/**
 * Compiled matchers for creator term lists, keyed by the list itself.
 *
 * Compiling a RegExp per message would be pure waste — the list changes when a
 * creator edits it, which is rarely, and the message rate is everything else.
 * Bounded because a process serving many communities would otherwise hold one
 * entry per distinct list forever.
 */
const creatorPatterns = new Map<string, RegExp | null>();
const CREATOR_PATTERN_LIMIT = 200;

function creatorMatcher(terms: string[]): RegExp | null {
    if (terms.length === 0) return null;

    const key = terms.join("\u0000");
    const cached = creatorPatterns.get(key);
    if (cached !== undefined) return cached;

    let pattern: RegExp | null = null;
    try {
        pattern = termMatcher(terms);
    } catch {
        // A term list that will not compile must not take the filter down with
        // it. Falling back to "no creator terms" degrades one community's
        // custom rules; throwing would stop moderation for everyone.
        console.error("Could not compile blockedTerms; ignoring them.");
        pattern = null;
    }

    if (creatorPatterns.size >= CREATOR_PATTERN_LIMIT) creatorPatterns.clear();
    creatorPatterns.set(key, pattern);
    return pattern;
}

// --- Spam Detection ---

const SPAM_INDICATORS: { check: (msg: string) => boolean; flag: string }[] = [
    {
        // Excessive caps (>60% of alpha chars are uppercase, min 10 chars)
        check: (msg) => {
            const alpha = msg.replace(/[^a-zA-Z]/g, "");
            if (alpha.length < 10) return false;
            const upper = alpha.replace(/[^A-Z]/g, "").length;
            return upper / alpha.length > 0.6;
        },
        flag: "excessive-caps",
    },
    {
        // Excessive emoji (>5 emoji in one message)
        check: (msg) => {
            const emojiCount = (msg.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu) || []).length;
            return emojiCount > 5;
        },
        flag: "emoji-spam",
    },
    {
        // Repeated characters (>4 of the same char in a row, excluding common cases)
        check: (msg) => /(.)\1{4,}/i.test(msg) && !/^(ha|lo|no|ye|wh|oo|ee|aa)+$/i.test(msg),
        flag: "char-repetition",
    },
    {
        // Repeated words (same word 3+ times in a row)
        check: (msg) => /\b(\w+)\s+\1\s+\1\b/i.test(msg),
        flag: "word-repetition",
    },
    {
        // Very short messages (under 5 chars — potential flood), except the
        // ordinary greetings and acknowledgements in SHORT_SAFE. Short and
        // unrecognised still flags: `kys` and `die` are four characters and
        // three, and letting those through to save a swarm call is the wrong
        // trade in both directions.
        check: (msg) =>
            msg.trim().length < 5 &&
            msg.trim().length > 0 &&
            !isShortSafe(msg),
        flag: "micro-message",
    },
];

// --- Link Detection ---

const LINK_PATTERNS: { pattern: RegExp; flag: string }[] = [
    { pattern: /https?:\/\/[^\s]+/i, flag: "contains-link" },
    { pattern: /discord\.(gg|com\/invite)\/[^\s]+/i, flag: "discord-invite" },
    { pattern: /t\.me\/[^\s]+/i, flag: "telegram-link" },
    { pattern: /bit\.ly|tinyurl|shorturl|is\.gd/i, flag: "url-shortener" },
];

// --- Rate Limiting ---

interface RateEntry {
    count: number;
    windowStart: number;
}

const rateTracker = new Map<string, RateEntry>();

/**
 * Check if a member is sending messages too quickly.
 * Returns true if rate limit exceeded.
 */
function checkRateLimit(
    communityId: string,
    userId: string,
    maxPerMinute: number = 10
): boolean {
    const key = `${communityId}:${userId}`;
    const now = Date.now();
    const entry = rateTracker.get(key);

    if (!entry || now - entry.windowStart > 60_000) {
        rateTracker.set(key, { count: 1, windowStart: now });
        return false;
    }

    entry.count++;
    return entry.count > maxPerMinute;
}

// --- Main Pre-Filter ---

/**
 * Pre-filter a community message before sending to the Minds swarm.
 *
 * Returns:
 *   { pass: true }  → message is clearly safe, skip the swarm
 *   { pass: false }  → message needs swarm evaluation, with flags
 *
 * The filter runs these checks in order:
 *   1. Skip check: is this a channel/context we should never filter?
 *   2. Hard patterns: slurs, threats, doxxing → always flag
 *   3. Rate limit: flooding → always flag
 *   4. Trust check: high-trust member + no hard flags → pass
 *   5. Soft patterns: insults, promotion, scam → flag if not trusted
 *   6. Spam detection: caps, emoji, repetition → flag if not trusted
 *   7. Link detection: URLs, invites → flag if not trusted
 *   8. Default: no flags found → pass
 */
export function preFilter(
    event: CommunityMessageEvent,
    config: Partial<PreFilterConfig> = {}
): PreFilterResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { content, communityId, userId, channel } = event;
    const flags: string[] = [];

    // --- 0. Minimum length check ---
    if (content.trim().length < cfg.minLength) {
        return { pass: true, reason: "Message too short to evaluate" };
    }

    // --- 1. Channel overrides ---
    if (cfg.neverFilterChannels.includes(channel)) {
        return { pass: true, reason: `Channel #${channel} is in never-filter list` };
    }

    const forceFilter = cfg.alwaysFilterChannels.includes(channel);

    // --- 2. Hard patterns (always flag, regardless of trust) ---
    if (cfg.enableHardPatterns) {
        for (const pattern of HARD_PATTERNS) {
            if (pattern.test(content)) {
                flags.push("hard-violation");
                return {
                    pass: false,
                    reason: "Hard pattern detected — must go to swarm",
                    flags,
                };
            }
        }

        // The creator's own list, same tier and same reasoning: they chose
        // these, so trust does not override them.
        const creatorPattern = creatorMatcher(cfg.blockedTerms);
        if (creatorPattern?.test(content)) {
            flags.push("community-blocked-term");
            return {
                pass: false,
                reason: "Community blocked term detected — must go to swarm",
                flags,
            };
        }

        // Dehumanising terms. Same tier as the patterns above and for the same
        // reason: no trust score should buy a pass on calling someone vermin.
        if (HARD_TERM_PATTERN.test(content)) {
            flags.push("dehumanising-language");
            return {
                pass: false,
                reason: "Dehumanising term detected — must go to swarm",
                flags,
            };
        }
    }

    // --- 3. Rate limit check ---
    if (checkRateLimit(communityId, userId)) {
        flags.push("rate-limit-exceeded");
        return {
            pass: false,
            reason: "Member is sending messages too quickly",
            flags,
        };
    }

    // --- 4. Trust check (cached) ---
    const cachedScore = getCachedTrustScore(communityId, userId, cfg.trustCacheTtlMs);
    const isTrusted = cachedScore !== null && cachedScore >= cfg.trustedThreshold;

    // If trusted and not in a force-filter channel, run only hard patterns (done above)
    // and pass everything else
    if (isTrusted && !forceFilter) {
        return {
            pass: true,
            reason: `Trusted member (cached score: ${cachedScore}) — skipping swarm`,
        };
    }

    // --- 5. Soft patterns ---
    if (cfg.enableSoftPatterns) {
        for (const { pattern, flag } of SOFT_PATTERNS) {
            if (pattern.test(content)) {
                flags.push(flag);
            }
        }

        // Contempt that needs a target to be a problem. Trust decides, then the
        // swarm — see SOFT_TERMS.
        if (SOFT_TERM_PATTERN.test(content)) {
            flags.push("contemptuous-language");
        }
    }

    // --- 6. Spam detection ---
    if (cfg.enableSpamDetection) {
        for (const { check, flag } of SPAM_INDICATORS) {
            if (check(content)) {
                flags.push(flag);
            }
        }
    }

    // --- 7. Link detection ---
    if (cfg.enableLinkDetection) {
        for (const { pattern, flag } of LINK_PATTERNS) {
            if (pattern.test(content)) {
                flags.push(flag);
            }
        }
    }

    // --- 8. Final decision ---
    if (flags.length > 0) {
        return {
            pass: false,
            reason: `${flags.length} flag(s) detected — sending to swarm`,
            flags,
        };
    }

    // No flags, no cached trust → still pass (benefit of the doubt)
    // The member will build trust over time via Vera
    return {
        pass: true,
        reason: cachedScore === null
            ? "No flags detected, no cached trust (new member, clean message)"
            : `No flags detected (cached score: ${cachedScore})`,
    };
}

// --- Metrics ---

interface FilterMetrics {
    totalProcessed: number;
    passed: number;
    flagged: number;
    passRate: number;
    flagBreakdown: Record<string, number>;
    trustedSkips: number;
    hardViolations: number;
}

let metrics: FilterMetrics = {
    totalProcessed: 0,
    passed: 0,
    flagged: 0,
    passRate: 0,
    flagBreakdown: {},
    trustedSkips: 0,
    hardViolations: 0,
};

/**
 * Run the pre-filter and track metrics.
 * Use this instead of preFilter() directly for production.
 */
export function preFilterWithMetrics(
    event: CommunityMessageEvent,
    config: Partial<PreFilterConfig> = {}
): PreFilterResult {
    const result = preFilter(event, config);

    metrics.totalProcessed++;

    if (result.pass) {
        metrics.passed++;
        if (result.reason.includes("Trusted member")) {
            metrics.trustedSkips++;
        }
    } else {
        metrics.flagged++;
        for (const flag of result.flags) {
            metrics.flagBreakdown[flag] = (metrics.flagBreakdown[flag] ?? 0) + 1;
            if (flag === "hard-violation") {
                metrics.hardViolations++;
            }
        }
    }

    metrics.passRate =
        metrics.totalProcessed > 0
            ? Math.round((metrics.passed / metrics.totalProcessed) * 100)
            : 0;

    return result;
}

/**
 * Get current filter metrics.
 * Useful for the dashboard and for Mira's health reports.
 */
export function getFilterMetrics(): FilterMetrics {
    return { ...metrics };
}

/**
 * Reset metrics (e.g., at the start of a new day).
 */
export function resetFilterMetrics(): void {
    metrics = {
        totalProcessed: 0,
        passed: 0,
        flagged: 0,
        passRate: 0,
        flagBreakdown: {},
        trustedSkips: 0,
        hardViolations: 0,
    };
}
