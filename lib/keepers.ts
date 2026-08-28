import { VIGILS, type VigilName } from "@/types";
import { skillsForRole } from "@/lib/skills-config";

/**
 * Marketing copy for the five Keepers — copy v3, the shipping version.
 *
 * Separate from `VIGILS` in `types/index.ts` on purpose. That module is
 * imported by the bot process and by every server route; it holds the facts a
 * running system needs (alias, colour, icon name) and must stay free of prose.
 * This module is prose, imported only by pages.
 *
 * It also has one job `vigilDetails` in the keepers page could not do: the
 * landing page and the Keepers page now say the same things about the same
 * five roles, and previously each held its own copy of that text. The pair
 * drifted — the landing said "The swarm", the Keepers page said "Meet the
 * keepers", and the nav on each linked to the other under a third name.
 *
 * **The wording here is the contract with copy v3.** "Swarm" is gone; these are
 * the Keepers. Claims removed during the v3 pass are removed for a reason —
 * see the "Claims held back" table in the copy doc before adding a bullet.
 */

export interface KeeperStep {
    /** Display only. The array index is the real order. */
    n: string;
    title: string;
    body: string;
}

export interface KeeperContent {
    name: VigilName;
    /**
     * The one-line characterisation, from copy v3's band 6 — the half after the
     * em dash in "Vera — Trust you can watch accumulate". Sentence case, no full
     * stop, because call sites punctuate it differently: the hero cards add one,
     * the Keepers index does not.
     */
    tagline: string;
    /**
     * The longer opening on the Keepers page. Two sentences at most.
     *
     * Its first sentence used to be duplicated into a `summary` field for band
     * 6's index rows. That band is gone from the landing (the hero grid already
     * introduces the five), and storing the same sentence twice was a drift
     * waiting to happen — edit one, the other silently disagrees. Anything
     * needing the short form takes the first sentence of this.
     */
    description: string;
    /**
     * Etymology — "Slavic", "faith, truth". **Currently rendered nowhere.**
     *
     * These sat under each name on the Keepers page until that line was cut.
     * Kept on purpose rather than deleted, but flagged here because nothing else
     * will flag them: an unused interface field is still "used" as far as
     * TypeScript and ESLint are concerned, so it looks deliberate forever. If a
     * surface for the names' meanings never appears, delete both.
     */
    origin: string;
    meaning: string;
    /**
     * The verb in the heading over `tracks` — "tracks", "learns", "does" — used
     * as `What <name> <verb>` via `tracksHeading()`.
     *
     * Per-Keeper on purpose: "tracks" is right for Vera and wrong for Sage, who
     * learns rather than tracks. The distinction says something true about how
     * each one differs, so it is worth carrying.
     *
     * The verb is stored, not the finished phrase, for two reasons. The name
     * comes from `VIGILS` so it cannot drift from the rest of the site; and the
     * phrase used to be stored whole as "What **it** tracks", which is the thing
     * being fixed — see `tracksHeading()`.
     */
    tracksVerb: string;
    tracks: string[];
    /** What this Keeper takes from the shared history. */
    reads: string;
    /** What it puts back, and who reads it. */
    gives: string;
    /** How one message moves through this Keeper. A real sequence. */
    steps: KeeperStep[];
    /** Published Skill id on the Bazaar, role-named and never Keeper-named. */
    skill: string;
}

export const KEEPER_ORDER: VigilName[] = ["vera", "sage", "kira", "mira", "nova"];

export const KEEPERS: Record<VigilName, KeeperContent> = {
    vera: {
        name: "vera",
        tagline: "Trust you can watch accumulate",
        description:
            "Tracks reputation, prior interactions, and how a member's behaviour changes over time. Asked about a member, Vera gives the picture as it accumulated — not a binary good/bad label.",
        origin: "Slavic",
        meaning: "faith, truth",
        tracksVerb: "tracks",
        tracks: [
            "Reputation, built from how a member has actually shown up here",
            "Prior interactions, and how they were resolved",
            "Change over time — the direction, not just the current state",
            "Members whose standing is high enough to lean on",
        ],
        reads: "the shared history every Keeper writes to",
        gives: "member standing to Kira before a call is made, regulars to Nova, participation to Mira",
        steps: [
            { n: "01", title: "Observe", body: "Every interaction lands in memory as behaviour, not as text." },
            { n: "02", title: "Accumulate", body: "Standing moves with what a member does, in both directions." },
            { n: "03", title: "Answer", body: "Kira asks who this is; Vera replies with the arc, not a score alone." },
            { n: "04", title: "Update", body: "What happened next writes back, including your overrides." },
        ],
        skill: "Mindfully_Trust_Keeper",
    },

    sage: {
        name: "sage",
        tagline: "Learns the in-jokes before the rulebook",
        description:
            "Picks up norms, recurring language, and the conventions a generic model reads as violations. Sage learns the culture behind the rulebook, not just the wordlist.",
        origin: "English",
        meaning: "wisdom",
        tracksVerb: "learns",
        tracks: [
            "Recurring language and the in-jokes that carry it",
            "Norms that differ from one channel to the next",
            "Conventions a generic model would flag as violations",
            "Where your line actually sits, from the policies you define",
        ],
        reads: "your rules and exceptions, plus what happened after each intervention",
        gives: "the norm at stake to Kira, the room's conventions to Nova and Mira",
        steps: [
            { n: "01", title: "Start from you", body: "Your policies, exceptions, and tolerated language come first." },
            { n: "02", title: "Listen", body: "Reads the room as it is, and notices what it keeps doing." },
            { n: "03", title: "Propose", body: "Surfaces a norm it thinks it has found, and how sure it is." },
            { n: "04", title: "Revise", body: "Every override moves the line, and it stays moved." },
        ],
        skill: "Mindfully_Culture_Learner",
    },

    kira: {
        name: "kira",
        tagline: "Acts early, explains itself, can be overruled",
        description:
            "Makes the call, says why, and leaves you in control of anything that matters. Kira never decides in a vacuum — who is speaking and what is normal here arrive before the verdict does.",
        origin: "English, common in Hong Kong",
        meaning: "beam of light",
        tracksVerb: "does",
        tracks: [
            "Detects harmful, abusive, spammy, and policy-breaking content as it happens",
            "Weighs the call against member standing and the norm at stake",
            "Explains every decision in terms you can argue with",
            "Sends the ambiguous and sensitive calls to you, context attached",
        ],
        reads: "member standing from Vera, the norm at stake from Sage",
        gives: "the outcome back to Vera and Sage, incident rates to Mira",
        steps: [
            { n: "01", title: "Ask first", body: "Pulls the member's history and the room's norm before forming a view." },
            { n: "02", title: "Decide", body: "Acts early where it is clear, and says how confident it is." },
            { n: "03", title: "Explain", body: "Every call arrives with its reasoning, never as a bare verdict." },
            { n: "04", title: "Escalate", body: "Anything ambiguous or sensitive reaches you, with what it already tried." },
        ],
        skill: "Mindfully_Moderator",
    },

    mira: {
        name: "mira",
        tagline: "Reads the room",
        description:
            "Tracks conversation dynamics, participation, and conflict at the room level — mood, not members. Mira watches whether the place still feels like somewhere people want to be.",
        origin: "Sanskrit",
        meaning: "ocean, admirable",
        tracksVerb: "watches",
        // Room level, always. The copy doc is explicit: mood, participation,
        // whether the place feels safe — never an individual member's state.
        tracks: [
            "Conversation dynamics — how a room is talking, not who is talking",
            "Participation, and where it is thinning out",
            "Conflict at the room level, including disputes that keep resurfacing",
            "Channel-by-channel differences in how a community feels",
        ],
        reads: "signals from all four other Keepers",
        gives: "the room's state to you, and to Nova before it points a newcomer anywhere",
        steps: [
            { n: "01", title: "Aggregate", body: "Pulls participation, tone, and conflict from the shared history." },
            { n: "02", title: "Compare", body: "Against this room's own baseline, never an industry average." },
            { n: "03", title: "Surface", body: "Raises what changed, with the evidence still attached." },
            { n: "04", title: "Report", body: "One readable summary, in the language your community speaks." },
        ],
        skill: "Mindfully_Health_Pulse",
    },

    nova: {
        name: "nova",
        // Nova ACTS — she checks in. This matches the member timeline in band 4,
        // where she checks in after the pile-on. If the build ever only surfaces
        // the moment for a human, this line AND the timeline change together;
        // the page must not claim two different things.
        tagline: "Checks in on the people drifting out",
        description:
            "Notices when newcomers or quieter members are falling out of the conversation, and follows up. Moderation doesn't end when a post disappears — Nova checks back on the people involved.",
        origin: "Latin",
        meaning: "new, bright",
        tracksVerb: "notices",
        tracks: [
            "Newcomers who arrived and then went quiet",
            "Regulars whose participation is falling away",
            "People left at the edge of a conversation after an incident",
            "Which rooms are worth pointing someone at right now",
        ],
        reads: "the room's conventions from Sage, standing from Vera, room state from Mira",
        gives: "who is drifting, and whether the check-in landed",
        steps: [
            { n: "01", title: "Notice", body: "Spots the drop-off before it becomes a member who never came back." },
            { n: "02", title: "Check in", body: "In your community's voice, and only where it would be welcome." },
            { n: "03", title: "Follow up", body: "Tracks whether the issue recurs, not just whether the post went away." },
            { n: "04", title: "Learn", body: "Keeps what brought people back, drops what didn't." },
        ],
        skill: "Mindfully_Community_Guide",
    },
};

/**
 * The Bazaar page for a Keeper's published Skill, or `null` if the role has
 * none yet.
 *
 * The id comes from `VIGIL_SKILL_IDS`, which is what `provisionSwarm` actually
 * equips — **not** a second copy pasted in here. CLAUDE.md is explicit that a
 * Skill's description cannot be edited after publication and the correction
 * path is "republish under a new id and one line in `lib/skills-config.ts`";
 * with the id duplicated, that one line would leave this link pointing at the
 * withdrawn Skill.
 *
 * `skillsForRole` returns a list because a role may equip more than one. The
 * first is the role's own Skill and the one worth linking; the rest, if they
 * ever exist, are supporting and have no place on a marketing page.
 */
export function skillUrl(name: VigilName): string | null {
    const [id] = skillsForRole(name);
    return id ? `https://ethoswarm.ai/bazaar/skills/${id}` : null;
}

/**
 * "Mindfully Trust Keeper" — the Skill's name as a reader should see it.
 *
 * `skill` stores the underscored form because that is the Skill's real name on
 * the Bazaar, the string `bazaar.listSkills({ search: "Mindfully" })` matches.
 * Spacing it is a display concern, so it happens here rather than by loosening
 * the stored value.
 */
export function skillLabel(name: VigilName): string {
    return KEEPERS[name].skill.replace(/_/g, " ");
}

/**
 * "What Vera tracks", "What Sage learns" — the heading over a Keeper's list.
 *
 * These read "What **it** tracks" until now. `it` was not a slip: `VIGILS`
 * already forbids pronouns in role copy, because "She knows who everyone really
 * is" assigns a gender to a Mind the creator brings and names themselves. That
 * rule's stated answer is to drop the *subject*, not to swap one pronoun for
 * another — and `it` kept a subject while making these five sound like
 * equipment, directly under portraits of characters with names, origins and
 * meanings.
 *
 * The name is the subject instead. No gender is asserted, nothing is claimed
 * about anyone else's Minds, and the sentence stops fighting the art.
 *
 * Taken from `VIGILS`, so renaming a role in one place renames it everywhere.
 */
export function tracksHeading(name: VigilName): string {
    return `What ${VIGILS[name].displayName} ${KEEPERS[name].tracksVerb}`;
}

/**
 * Character art, by convention rather than by table: `public/avatars/<name>.png`
 * (256² square, head and shoulders) and `public/cards/<name>.png` (600×797, 3:4
 * three-quarter length). Both are dark-ground paintings rim-lit in roughly the
 * Keeper's own hue, which is why they sit on `zinc-900` without fighting the
 * palette.
 *
 * `keeperCardArt`, not `keeperCard`: the landing page's Keeper *cards* are UI
 * components that show the **avatar**, so an unqualified `keeperCard` would name
 * the one asset those cards do not use.
 *
 * **Marketing surfaces only. Never the dashboard.** These five faces are *ours*
 * — the landing page and the Keepers page name Vera, Sage, Kira, Mira and Nova
 * outright, so a face is accurate there. Inside the dashboard the five roles are
 * filled by Minds the creator brought and named themselves, and `VigilAvatar`
 * shows a role glyph for exactly that reason: putting a face there would assert
 * that someone else's trust agent is a pale blonde woman called Vera. That is
 * the same mistake as the `displayName[0]` initials it already replaced.
 */
export const keeperAvatar = (name: VigilName) => `/avatars/${name}.png`;
export const keeperCardArt = (name: VigilName) => `/cards/${name}.png`;

/** Intrinsic sizes, so `next/image` can reserve space and never shift layout. */
export const AVATAR_DIMS = { width: 256, height: 256 } as const;
export const CARD_ART_DIMS = { width: 600, height: 797 } as const;

/**
 * The two colours a Keeper needs on a marketing surface.
 *
 * `hue` is the brand colour — correct behind something (a tint, a glow, a
 * border) and too dark to read on `zinc-950`. `text` is the readable variant.
 * Both come from `VIGILS`, never retyped: five hex values were hand-copied into
 * six files once already, and the one that got missed drifted silently.
 */
export function keeperColors(name: VigilName): { hue: string; text: string } {
    return { hue: VIGILS[name].color, text: VIGILS[name].textColor };
}

/** Band 5. Six capabilities, in the order copy v3 lists them. */
export const PLATFORM_FEATURES = [
    {
        title: "Live moderation",
        body: "Detects harmful, abusive, spammy, and policy-breaking content as conversations happen.",
        icon: "Radar",
    },
    {
        title: "Shared memory",
        body: "Every agent works from the same history: what was said, what happened before, and which interventions already ran.",
        icon: "Brain",
    },
    {
        title: "Pattern detection",
        body: "Connects activity over time to spot behaviour a single-message filter misses — repeat offenders, recurring disputes, and behaviour that keeps resurfacing.",
        icon: "ChartSpline",
    },
    {
        title: "Follow-up that closes the loop",
        body: "Moderation doesn't end when a post disappears. The Keepers track whether an issue recurs and check back on the people involved.",
        icon: "RotateCw",
    },
    {
        title: "Your rules, your norms",
        body: "Define policies, exceptions, tolerated language, and where your line actually sits. The agents learn the culture behind the rulebook, not just the wordlist.",
        icon: "BookOpen",
    },
    {
        title: "Human escalation",
        body: "Ambiguous and sensitive calls reach you with the context already attached — member history, prior flags, what the agents already tried.",
        icon: "ArrowUp",
    },
] as const;

/** Band 7. Segment, then the promise, then how it is kept. */
export const BUILT_FOR = [
    {
        segment: "Creators",
        headline: "Your Discord shouldn't need you in it at 2am.",
        body: "Keep the conversation moving while the Keepers handle routine moderation and surface the moments that actually need you.",
    },
    {
        segment: "Web3",
        headline: "Scammers change the message. Their behaviour is harder to hide.",
        body: "Mindfully keeps context across interactions to spot impersonation, scam links, and suspicious account behaviour that keyword filters miss.",
    },
    {
        segment: "Gaming",
        headline: "Keep the banter. Catch the abuse.",
        body: "Room for players to be players, without treating every joke as an incident or every incident as a joke.",
    },
    {
        segment: "DAOs & token communities",
        headline: "Governance threads that stay readable.",
        body: "Keep big discussions usable as membership and activity outgrow a small mod team.",
    },
    {
        segment: "Brands & IP communities",
        headline: "The culture you launched with, still there at 50k members.",
        body: "Consistent moderation at scale that preserves the tone people joined for.",
    },
] as const;

/**
 * Band 8. Four controls, ordered by how far into a decision you step in —
 * before it runs, while it runs, after it ran, against what it did. The
 * numbering carries that, so it is not decoration.
 */
export const CONTROLS = [
    {
        n: "01",
        title: "Define what matters",
        body: "Your policies, exceptions, and tolerated language — before anything runs.",
    },
    {
        n: "02",
        title: "Tune how the agents respond",
        body: "Where the line sits, and how firmly the Keepers hold it.",
    },
    {
        n: "03",
        title: "Review the important decisions",
        body: "Every call the Keepers made, with the reasoning still attached.",
    },
    {
        n: "04",
        title: "Override any of them",
        body: "Reverse a decision, and the Keepers carry the correction forward.",
    },
] as const;

/**
 * The self-service band. Three steps you genuinely move through in order, so
 * the numbering describes a sequence rather than decorating a list.
 *
 * Wording is constrained by what setup actually does — see the header of
 * `lib/skills-config.ts`. Creators bring their own Minds and their own API key,
 * and setup equips the published Skills on their behalf: "there is no step
 * where a creator browses the Bazaar and installs anything." Step 02 must not
 * imply one, and none of these may imply we host anything.
 */
export const SETUP_STEPS = [
    {
        n: "01",
        title: "Connect your Minds",
        body: "Your account, your API key. The Keepers run on Minds you already own — we never hold them.",
    },
    {
        n: "02",
        title: "Assign the five roles",
        body: "Point each role at one of your Minds, under whatever name you gave it. The Skills equip themselves — you never visit the Bazaar.",
    },
    {
        n: "03",
        title: "Connect your community",
        body: "Discord or Telegram. From the first message on, they start remembering.",
    },
] as const;

/** Band 9. The last item is unshipped and says so. */
export const COMPOUNDING = [
    {
        title: "Trust that compounds",
        body: "Vera remembers how members show up over time, not just what they last posted.",
    },
    {
        title: "Newcomers don't disappear quietly",
        body: "Nova notices who's being left at the edge — the point where most churn happens.",
    },
    {
        title: "Mods stop relitigating yesterday",
        body: "Shared memory carries context forward, so the same dispute isn't argued from scratch every week.",
    },
    {
        title: "Reputation that travels",
        body: "Trust earned in one community moves with the member to the next, through Moca Network and AIR Kit.",
        roadmap: true,
    },
] as const;

/**
 * Band 3. Four events, each individually permitted, that only mean something
 * together. Illustrative — this is the argument drawn, not a real incident.
 */
export const PATTERN_EVENTS = [
    { time: "09:12", event: "Posts a link in #general" },
    { time: "09:41", event: "Posts the same link in #support" },
    { time: "10:03", event: "Changes display name to match a mod" },
    { time: "10:20", event: "Messages members one after another" },
] as const;
