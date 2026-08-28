// ============================================================
// mindfully.gg — Vigil Skill catalog
//
// Maps each Vigil role to the Bazaar Skill ids equipped on the creator's
// assigned Mind during setup (see provisionSwarm in lib/minds-client.ts).
//
// Ids are pinned here rather than discovered at runtime. Creators bring their
// own Minds and their own API key, and setup equips on their behalf — there is
// no step where a creator browses the Bazaar and installs anything, so the id
// has to be known to the code. Pinning is also what makes a run verifiable:
// `--expect-skill <id>` can assert the exact artifact under test, which is what
// caught an eleven-case eval silently measuring the prompt instead of the Skill.
//
// **Only list a PUBLISHED id.** An unlisted Skill can be equipped by the account
// that owns it and nobody else, so putting one here makes `equipSkills` fail for
// every other creator and breaks their onboarding — while working perfectly for
// you. Equip an unpublished draft directly on your own Mind instead.
//
// **And list the `skillId`, not the `skillArtifactId`.** They are different
// fields of identical shape, and a Mind asked for "the skill id" may hand you
// either — both of ours did, first time. Read it from
// `bazaar.listSkills({ search: "Mindfully" })`, which is the field a creator's
// code calls to equip. Case differs by endpoint: the Bazaar returns lowercase,
// `listEquippedSkills` uppercase. Same id.
//
// A role with no id is not a failure: the equip step is skipped and the Vigil
// runs on the orchestrator prompt alone, which produces good decisions already.
// ============================================================

import type { VigilName } from "@/types";

export const VIGIL_SKILL_IDS: Record<VigilName, string[]> = {
    vera: ["E4CF503E-F36B-1410-8466-00039CE7DF11"], // Trust Keeper
    sage: ["B347513E-F36B-1410-8466-00039CE7DF11"], // Culture Learner
    kira: ["6BA7503E-F36B-1410-8466-00039CE7DF11"], // Moderator
    mira: ["AFB3513E-F36B-1410-8466-00039CE7DF11"], // Health Pulse
    nova: ["9819503E-F36B-1410-8466-00039CE7DF11"], // Community Guide
};

/**
 * Skill ids to equip for a given role. An empty list means the role has no
 * published Skill yet and `provisionSwarm` skips the equip — it does not
 * unequip anything, so a Skill equipped by hand on a Mind survives setup.
 */
export function skillsForRole(role: VigilName): string[] {
    return VIGIL_SKILL_IDS[role] ?? [];
}
