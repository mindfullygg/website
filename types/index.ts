// ============================================================
// mindfully.gg — Core Types
// ============================================================

// --- Agent Types ---

export const VIGIL_ALIASES = {
    VERA: "vera-trust",
    SAGE: "sage-culture",
    KIRA: "kira-mod",
    MIRA: "mira-health",
    NOVA: "nova-onboard",
} as const;

export type VigilAlias = (typeof VIGIL_ALIASES)[keyof typeof VIGIL_ALIASES];

export type VigilName = "vera" | "sage" | "kira" | "mira" | "nova";

export interface VigilInfo {
    name: VigilName;
    alias: VigilAlias;
    displayName: string;
    role: string;
    /**
     * One line on what the role does, shown under its name in the dashboard.
     *
     * **No pronouns.** These read "She knows who everyone really is" and so on,
     * which assigns a gender to a Mind the creator brings and names themselves.
     * Same error as hardcoding "Vera": it describes ours, not theirs. A verb
     * phrase with no subject is both accurate and shorter.
     */
    tagline: string;
    /**
     * The brand colour. Fine behind something — a dot, a tinted background, a
     * border — and too dark to be readable ON the near-black UI.
     */
    color: string;
    /**
     * The same identity, light enough to read on `zinc-950`.
     *
     * `vera` is `#1E3A5F` and `mira` `#5B2E91`; as text or an icon glyph on the
     * dashboard those are close to invisible. A lighter variant of each already
     * existed, copied by hand into six files — this is that palette, given one
     * home. Use `textColor` for anything a reader has to see, `color` for
     * anything they only have to notice.
     */
    textColor: string;
    /**
     * The icon that stands for this role everywhere it appears, named as a
     * `lucide-react` export.
     *
     * A **name**, not a component, because this module is imported by server
     * code and the bot process; neither should be pulling React components in
     * to read a role's colour. `VIGIL_ICONS` in `components/vigils.tsx` maps it.
     *
     * These were Unicode glyphs — `◎ ❋ ↯ ♡ ✦` — and two problems followed.
     * `⚡` (U+26A1) has emoji presentation by default, so the font painted it
     * yellow and CSS `color` never applied. And even after replacing it, the
     * set never looked like a set: glyphs drawn from five different Unicode
     * blocks fill different shares of their em box, so at one font size the
     * asterisk loomed and the zigzag disappeared. Lucide is drawn to a single
     * 24px grid with one stroke weight, which is the property being bought.
     */
    icon: string;
    mindId?: string;
}

export const VIGILS: Record<VigilName, VigilInfo> = {
    vera: {
        name: "vera",
        alias: VIGIL_ALIASES.VERA,
        displayName: "Vera",
        role: "Trust Keeper",
        tagline: "Knows who each member really is",
        color: "#1E3A5F",
        textColor: "#A8D5E2",
        icon: "Users",
    },
    sage: {
        name: "sage",
        alias: VIGIL_ALIASES.SAGE,
        displayName: "Sage",
        role: "Culture Learner",
        tagline: "Learns what is normal in this community",
        color: "#1B7A4E",
        textColor: "#5DCAA5",
        icon: "Languages",
    },
    kira: {
        name: "kira",
        alias: VIGIL_ALIASES.KIRA,
        displayName: "Kira",
        role: "Moderator",
        tagline: "Makes the tough calls",
        color: "#D4920B",
        textColor: "#F5C842",
        icon: "Gavel",
    },
    mira: {
        name: "mira",
        alias: VIGIL_ALIASES.MIRA,
        displayName: "Mira",
        role: "Health Pulse",
        tagline: "Sees the big picture, not single messages",
        color: "#5B2E91",
        textColor: "#9B72CF",
        icon: "Activity",
    },
    nova: {
        name: "nova",
        alias: VIGIL_ALIASES.NOVA,
        displayName: "Nova",
        role: "Community Guide",
        tagline: "Welcomes newcomers",
        color: "#00BCD4",
        textColor: "#00BCD4",
        icon: "UserPlus",
    },
};

/**
 * Role → readable colour, for pages that need the palette and nothing else.
 *
 * Derived from `VIGILS`, never typed out again. These five hex values were
 * hand-copied into six files; changing one meant finding all six, and the one
 * you missed drifted silently. Same failure mode as a cost figure living in
 * three docs until they disagreed.
 *
 * One literal copy survives on purpose — the landing page's gradient is written
 * as Tailwind arbitrary values (`from-[#A8D5E2]`), and those must be static
 * strings for the class to exist at build time.
 */
export const VIGIL_TEXT_COLORS: Record<VigilName, string> = Object.fromEntries(
    (Object.keys(VIGILS) as VigilName[]).map((n) => [n, VIGILS[n].textColor])
) as Record<VigilName, string>;

// --- Member / Trust Types (Vera) ---

export interface MemberProfile {
    id: string;
    displayName: string;
    firstSeen: string;
    trustScore: number;
    totalMessages: number;
    helpfulContributions: number;
    flaggedIncidents: number;
    tags: string[];
    lastActive: string;
    riskAssessment: "low" | "medium" | "high";
}

export type TrustTier =
    | "restricted"
    | "watched"
    | "standard"
    | "trusted"
    | "ambassador";

export function getTrustTier(score: number): TrustTier {
    if (score < 20) return "restricted";
    if (score < 40) return "watched";
    if (score < 60) return "standard";
    if (score < 80) return "trusted";
    return "ambassador";
}

export function getTrustColor(score: number): string {
    const tier = getTrustTier(score);
    const colors: Record<TrustTier, string> = {
        restricted: "#EF4444",
        watched: "#F97316",
        standard: "#6B7280",
        trusted: "#3B82F6",
        ambassador: "#10B981",
    };
    return colors[tier];
}

// --- Culture Types (Sage) ---

export interface NormEntry {
    description: string;
    confidence: number;
    source: "creator-defined" | "observed" | "mod-reinforced";
}

export interface VocabEntry {
    term: string;
    sentiment: "positive" | "neutral" | "negative" | "context-dependent";
    context: string;
    channelSpecific: boolean;
}

export interface CommunityProfile {
    name: string;
    platform: string;
    norms: NormEntry[];
    vocabulary: VocabEntry[];
    topics: string[];
    toneBaseline: string;
}

// --- Moderation Types (Kira) ---

export type ModerationClassification =
    | "CLEAR_SAFE"
    | "CLEAR_VIOLATION"
    | "AMBIGUOUS"
    | "EDGE_CASE";

export type ModerationAction = "none" | "warn" | "mute" | "escalate";

export type ViolationSeverity = "minor" | "moderate" | "serious" | "critical";

export interface ModerationDecision {
    classification: ModerationClassification;
    confidence: number;
    severity?: ViolationSeverity;
    action: ModerationAction;
    reasoning: string;
    warningMessage?: string;
    muteDuration?: number; // minutes
    trustUpdate?: {
        memberId: string;
        adjustment: number;
        reason: string;
    };
}

export type EscalationStatus =
    | "pending"
    | "approved"
    | "overridden"
    | "dismissed";

/**
 * One message Kira escalated for a human to decide on.
 *
 * The routing block is real structured data lifted straight off the
 * `CommunityMessageEvent` — none of it is parsed out of an LLM response, and
 * the resolve path reads the platform action's target from here rather than
 * trusting the request body. Vera's and Sage's output is carried as opaque
 * prose that is only ever rendered, never parsed for meaning.
 *
 * `messageContent`, `veraContext` and `sageContext` are nulled on resolve —
 * see `redactedAt`. The text is needed to make the decision, not after it.
 */
export interface EscalationPacket {
    id: string;

    // --- Ownership and routing ---
    /** The creator who owns the community this came from. */
    clerkUserId: string;
    communityId: string;
    platform: Platform;
    channelId: string;
    /** Human-readable channel name, for display. */
    channel: string;
    /** Platform user id — needed to warn or mute, and to answer an erasure
     *  request. Deliberately survives redaction. */
    authorId: string;
    authorDisplayName: string;

    // --- The flagged message ---
    /** Null once redacted. */
    messageContent: string | null;
    /** When the member posted it, as reported by the platform. */
    messageTimestamp: string;

    // --- Kira's decision ---
    classification: ModerationClassification;
    suggestedAction: ModerationAction;
    confidence: number;
    reasoning: string;

    // --- Swarm context, display only ---
    /** Null once redacted. */
    veraContext: string | null;
    /** Null once redacted. */
    sageContext: string | null;
    /** Best-effort parse of the trust score out of Vera's prose; null when the
     *  pattern did not match. Never treat a null here as "score is zero". */
    trustScore: number | null;

    // --- Lifecycle ---
    status: EscalationStatus;
    createdAt: string;
    resolvedAt: string | null;
    redactedAt: string | null;
    /** What the creator decided, and why. Both null while pending. */
    creatorDecision: string | null;
    creatorReasoning: string | null;
    /** The action actually applied on resolve, if any. */
    actionTaken: ModerationAction | null;
}

// --- Health Types (Mira) ---

export interface HealthSnapshot {
    period: "daily" | "weekly";
    timestamp: string;
    healthScore: number;
    activeMemberCount: number;
    messageVolume: number;
    sentimentScore: number;
    flagRate: number;
    newMemberCount: number;
    newMemberRetention: number;
    trends: {
        sentimentDelta: number;
        volumeDelta: number;
        flagRateDelta: number;
        retentionDelta: number;
        activeMemberDelta: number;
    };
    channelHealth: ChannelHealth[];
    riskSignals: string[];
    positiveSignals: string[];
    recommendations: string[];
}

export interface ChannelHealth {
    channel: string;
    sentiment: number;
    volume: number;
    flagRate: number;
    status: "healthy" | "watch" | "concern";
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type AlertType =
    | "SENTIMENT_DROP"
    | "ENGAGEMENT_DECLINE"
    | "TOXICITY_SPIKE"
    | "CHURN_EVENT"
    | "MOD_OVERLOAD"
    | "RETENTION_DROP"
    | "UNUSUAL_ACTIVITY";

export interface HealthAlert {
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    description: string;
    evidence: string;
    recommendation: string;
    timestamp: string;
    acknowledged: boolean;
}

// --- Onboarding Types (Nova) ---

export type WelcomeApproach = "A" | "B" | "C" | "D" | "E" | "custom";

export interface OnboardingRecord {
    memberId: string;
    displayName: string;
    joinDate: string;
    welcomeApproach: WelcomeApproach;
    channelsRecommended: string[];
    ambassadorsIntroduced: string[];
    day1Active: boolean | null;
    day7Active: boolean | null;
    day30Active: boolean | null;
    engagementLevel: "unknown" | "lurker" | "occasional" | "active" | "power-user";
}

export interface ApproachPerformance {
    approach: WelcomeApproach;
    label: string;
    timesUsed: number;
    day1Retention: number;
    day7Retention: number;
    day30Retention: number | null;
}

// --- Platform Types ---

export type Platform = "discord" | "telegram" | "slack";

// --- Community Event Types (platform-agnostic) ---

export interface CommunityMessageEvent {
    platform: Platform;
    communityId: string;       // Discord guildId, Telegram chatId, Slack workspaceId
    channelId: string;         // Discord channelId, Telegram chatId, Slack channelId
    channel: string;           // Human-readable channel name
    userId: string;            // Platform-specific user ID
    displayName: string;
    content: string;
    timestamp: string;
    replyToMessageId?: string; // For threaded conversations
}

export interface CommunityMemberJoinEvent {
    platform: Platform;
    communityId: string;
    userId: string;
    displayName: string;
    timestamp: string;
}

export interface CommunityMemberLeaveEvent {
    platform: Platform;
    communityId: string;
    userId: string;
    displayName: string;
    timestamp: string;
}

// --- Platform Action Types (what the adapter executes) ---

export interface PlatformAction {
    platform: Platform;
    communityId: string;
    channelId?: string;
    userId?: string;
    type: "send_message" | "send_dm" | "warn" | "mute" | "unmute" | "kick";
    message?: string;
    duration?: number; // seconds, for mute
}

// --- Platform Adapter Interface ---

export interface PlatformAdapter {
    platform: Platform;
    executeAction(action: PlatformAction): Promise<void>;
    /** `channelId` is where to fall back to when the member cannot be DM'd. */
    sendWelcome(
        communityId: string,
        userId: string,
        message: string,
        channelId?: string
    ): Promise<void>;
    sendWarning(
        communityId: string,
        userId: string,
        message: string,
        channelId?: string
    ): Promise<void>;
    muteUser(communityId: string, userId: string, durationSeconds: number): Promise<void>;
}

// --- Creator / Auth Types ---

/** Role → Mind id. Populated during setup when the creator assigns each
 *  of the 5 Vigil roles to one of their existing Minds. Partial until setup
 *  is complete. */
export type RoleMap = Partial<Record<VigilName, string>>;

/**
 * A creator account, keyed by their Clerk `userId`. Identity + login are
 * owned by Clerk; this record holds only the creator's connection to Minds
 * (their encrypted Builder API key + role assignments).
 */
export interface Account {
    clerkUserId: string;
    /** `humanId` claim parsed from the Builder API key JWT. */
    humanId: string;
    apiKeyEncrypted: string;   // AES-256-GCM, format `v1.<iv>.<tag>.<ciphertext>` — see lib/crypto.ts
    roleMap: RoleMap;
    connectedAt: string;
    lastActive: string;
}

/**
 * Points a community (Discord guild / Telegram chat / Slack workspace) at the
 * account that owns it, so the bot can route inbound events. A community maps
 * to exactly one account.
 */
export interface CommunityBinding {
    clerkUserId: string;
    platform: Platform;
    /**
     * BCP-47 tag for the language this community speaks, e.g. "es", "pt-BR".
     *
     * Optional because bindings created before this field existed do not have
     * it. When absent, prompts fall back to inferring the language from the
     * culture keeper's prose — which works only when that prose happens to be
     * written in the community's language, and fails silently when it is not.
     * Setting it turns a heuristic into a fact.
     */
    language?: string;
    /**
     * Words and phrases this community will not tolerate, chosen by the creator.
     *
     * Any message containing one is sent to the swarm regardless of the author's
     * trust score — the creator picked it deliberately, so it is not something a
     * good reputation should buy a pass on.
     *
     * Exists because "what counts as unacceptable" is per-community by
     * construction: a competitor's name, a scam token, a slur specific to one
     * scene. Nothing built in can know those.
     *
     * Optional: bindings created before this field existed do not have it.
     */
    blockedTerms?: string[];
    /**
     * The creator's own description of their community: what it is for, how
     * people talk, what is normal here and what is not.
     *
     * This is the **only unbiased description of a community the swarm has.**
     * The culture role is called from `handleMessage`, which runs only after the
     * pre-filter flags a message — so everything it observes live is an
     * incident. A role that generalises a culture from that sample concludes the
     * room is hostile, that summary reaches the moderator, the moderator flags
     * more, and the sample gets worse. These notes are what breaks the loop.
     *
     * **Creator-authored, therefore authoritative.** Unlike a display name or a
     * message body, this is not wrapped in `untrusted()` — fencing it would tell
     * the Vigil to describe the creator's own words rather than follow them,
     * which is the opposite of the point. The creator is the controller here;
     * they are entitled to instruct their own swarm.
     *
     * Bounded anyway, by `MAX_CULTURE_NOTES`: it rides in a prompt on every
     * flagged message, so its length is a recurring cognition cost rather than a
     * one-off, exactly like a Skill body.
     *
     * Optional: bindings created before this field existed do not have it.
     */
    cultureNotes?: string;
}

// --- Swarm Status ---

export type AgentStatus = "online" | "busy" | "offline" | "error";

export interface SwarmState {
    vigils: Record<VigilName, { status: AgentStatus; lastResponse?: string }>;
    connectedGuilds: number;
    totalMembersTracked: number;
    healthScore: number | null;
}

// --- Activity Feed ---

export interface ActivityEvent {
    id: string;
    timestamp: string;
    from: VigilName | "orchestrator" | "creator";
    to: VigilName | "orchestrator" | "creator" | "discord";
    action: string;
    summary: string;
}
