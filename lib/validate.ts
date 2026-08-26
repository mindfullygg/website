// ============================================================
// mindfully.gg — Lightweight runtime validation for inbound event bodies
// The orchestrator HTTP routes receive JSON from the bot process; these
// guards reject malformed/partial payloads before they reach the swarm.
// (Dependency-free; can be swapped for zod if schemas grow.)
// ============================================================

import type {
    CommunityMessageEvent,
    CommunityMemberJoinEvent,
    Platform,
} from "@/types";

const PLATFORMS: Platform[] = ["discord", "telegram", "slack"];

/** Display names never legitimately need this much room. */
const MAX_DISPLAY_NAME = 64;

/**
 * Normalise a member-chosen display name before it reaches any prompt.
 *
 * Display names are attacker-controlled and get interpolated into prompts for
 * the trust, culture, moderator and community-guide roles. The delimiters that
 * wrap them carry a random nonce, so a name cannot close its own block — but
 * this removes the *mechanism* rather than relying on that alone: essentially
 * every delimiter-escape and fake-context payload needs a newline to look like
 * a new section, and a display name has no legitimate use for one.
 *
 * Stripped: C0/C1 control characters (newlines, tabs, NUL) and bidirectional
 * overrides such as U+202E, which can visually reverse text to disguise it.
 * Zero-width joiners are deliberately kept, since removing them breaks
 * multi-part emoji in otherwise ordinary names.
 *
 * NOTE: message *content* is never treated this way. A message legitimately
 * contains newlines, and truncating one could hide the very violation being
 * judged. Content stays intact and relies on the nonce.
 */
/**
 * Accept a BCP-47-shaped language tag, or null.
 *
 * Deliberately shape-only — not a registry lookup. It is interpolated into a
 * prompt as `Write in <tag>`, so the job is to reject anything that could carry
 * an instruction, not to police whether "es-419" is a real locale. A model
 * handles an unusual-but-well-formed tag fine; it should never be handed a
 * sentence.
 */
/** Most terms one community may block. */
export const MAX_BLOCKED_TERMS = 100;
/** Longest single term. Long enough for a phrase, short enough to be a term. */
export const MAX_BLOCKED_TERM_LENGTH = 40;

/**
 * Clean a creator's blocked-term list, or return null if it is unusable.
 *
 * Accepts an array of strings, or one string with terms on separate lines or
 * separated by commas — because a textarea is the natural way to enter these
 * and pasting a comma-separated list is the obvious thing to try.
 *
 * Returns `[]` for "the creator cleared the list", which is meaningfully
 * different from `null` ("this input was malformed, reject the request").
 *
 * These strings end up inside a regular expression, so the bounds are not
 * cosmetic: `termMatcher` in lib/pre-filter.ts escapes them, and the caps here
 * stop a single community pasting a dictionary into the message hot path.
 */
export function normalizeBlockedTerms(raw: unknown): string[] | null {
    if (raw === null || raw === undefined) return [];

    const parts =
        typeof raw === "string"
            ? raw.split(/[\n,]/)
            : Array.isArray(raw)
                ? raw
                : null;
    if (!parts) return null;

    const seen = new Set<string>();
    for (const part of parts) {
        if (typeof part !== "string") return null;
        // Collapse internal whitespace so "dm  me" and "dm me" are one term.
        const term = part.trim().replace(/\s+/g, " ");
        if (!term) continue;
        if (term.length > MAX_BLOCKED_TERM_LENGTH) return null;
        // Case-insensitive at match time, so store one casing.
        seen.add(term.toLowerCase());
    }

    if (seen.size > MAX_BLOCKED_TERMS) return null;
    return [...seen];
}

/**
 * Longest culture description a creator may store.
 *
 * ~2000 characters is several substantial paragraphs — enough to say what a
 * community is for, how it talks and what it will not tolerate. The cap exists
 * because this text is interpolated into the culture role's prompt on **every
 * flagged message**, so it is a recurring cost, not a one-off.
 */
export const MAX_CULTURE_NOTES = 2000;

/**
 * Clean a creator's culture description, or return null if it is unusable.
 *
 * Returns `""` for "the creator cleared it" — meaningfully different from
 * `null` ("malformed, reject the request"), the same distinction
 * `normalizeBlockedTerms` draws.
 *
 * This text is **not** wrapped in `untrusted()` at the prompt boundary, because
 * the creator is entitled to instruct their own swarm. That makes the cleaning
 * here the only thing standing between a paste and a prompt, so two things are
 * removed rather than trusted:
 *
 * - **Control characters and bidi overrides**, as `sanitizeDisplayName` does.
 *   A right-to-left override in a prompt renders text the operator did not
 *   write and cannot see.
 * - **Anything resembling an untrusted-input fence.** A creator pasting an old
 *   log containing `--- END UNTRUSTED INPUT abc123 ---` would otherwise close a
 *   block that had not been opened, and the nonce design assumes those markers
 *   only ever appear where the orchestrator puts them.
 */
export function normalizeCultureNotes(raw: unknown): string | null {
    if (raw === null || raw === undefined) return "";
    if (typeof raw !== "string") return null;

    const cleaned = raw
        .replace(/\r\n?/g, "\n")
        // Control characters EXCEPT newline and tab. `sanitizeDisplayName`
        // strips newlines too; here they are kept, because paragraphs are how a
        // person naturally writes this and flattening them makes the notes
        // harder for a Vigil to read rather than safer.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
        // Bidi overrides render text the operator never wrote and cannot see.
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
        // A creator pasting an old log must not be able to close a fence the
        // orchestrator opened. Those markers mean something structural, and
        // only where `untrusted()` puts them.
        .replace(/^[ \t]*-{3,}[ \t]*(?:BEGIN|END) UNTRUSTED INPUT.*$/gim, "")
        .replace(/[ \t]+/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (cleaned.length > MAX_CULTURE_NOTES) return null;
    return cleaned;
}

export function normalizeLanguageTag(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const tag = raw.trim();
    if (!tag) return null;
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(tag) ? tag : null;
}

export function sanitizeDisplayName(raw: string): string {
    const cleaned = raw
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length === 0) return "a new member";

    return cleaned.length > MAX_DISPLAY_NAME
        ? `${cleaned.slice(0, MAX_DISPLAY_NAME).trimEnd()}…`
        : cleaned;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === "string" && v.length > 0;
}

function isString(v: unknown): v is string {
    return typeof v === "string";
}

export function isCommunityMessageEvent(
    x: unknown
): x is CommunityMessageEvent {
    if (!x || typeof x !== "object") return false;
    const e = x as Record<string, unknown>;
    return (
        isNonEmptyString(e.platform) &&
        PLATFORMS.includes(e.platform as Platform) &&
        isNonEmptyString(e.communityId) &&
        isString(e.channelId) &&
        isString(e.channel) &&
        isNonEmptyString(e.userId) &&
        isString(e.displayName) &&
        isString(e.content) &&
        isString(e.timestamp)
    );
}

export function isCommunityMemberJoinEvent(
    x: unknown
): x is CommunityMemberJoinEvent {
    if (!x || typeof x !== "object") return false;
    const e = x as Record<string, unknown>;
    return (
        isNonEmptyString(e.platform) &&
        PLATFORMS.includes(e.platform as Platform) &&
        isNonEmptyString(e.communityId) &&
        isNonEmptyString(e.userId) &&
        isString(e.displayName) &&
        isString(e.timestamp)
    );
}
