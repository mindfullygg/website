// ============================================================
// mindfully.gg — Mind inventory
//
//   npx tsx --env-file=.env.local scripts/check-minds.ts
//   npx tsx --env-file=.env.local scripts/check-minds.ts --enable <mindId>
//
// Read-only by default. No cognition — balances and status are plain reads.
//
// Exists because an unfunded Mind does not announce itself. It accepts the
// message and never answers, so the call costs a full 240s timeout and returns
// nothing — and `handleMessage` makes three of those in series. One overdrawn
// keeper turns a flagged message into twelve minutes of waiting, and the symptom
// (silence, then AMBIGUOUS, then escalate) looks exactly like a Skill problem.
// One free read tells you instead.
// ============================================================

import { getCreatorClient } from "@/lib/minds-client";
import { VIGIL_ALIASES } from "@/types";

async function main() {
    const apiKey = process.env.MINDS_BUILDER_API_KEY;
    if (!apiKey) {
        console.error("MINDS_BUILDER_API_KEY is not set. Pass --env-file=.env.local");
        process.exit(1);
    }

    const client = await getCreatorClient(apiKey);

    // --enable flips isEnabled and exits.
    const enableAt = process.argv.indexOf("--enable");
    if (enableAt !== -1) {
        const mindId = process.argv[enableAt + 1];
        if (!mindId) {
            console.error("Usage: --enable <mindId>");
            process.exit(1);
        }
        const updated = await client.updateMindStatus(mindId, { isEnabled: true });
        console.log(
            `\n${updated.name ?? mindId}: isEnabled = ${updated.isEnabled}\n\n` +
            `Enabling does not add cognition. Re-run without --enable to see the balance.\n`
        );
        return;
    }

    const minds = await client.listMinds();
    if (minds.length === 0) {
        console.log("\nNo Minds on this API key.\n");
        return;
    }

    // Which alias each Mind is wired to, so a Mind's role is visible rather
    // than inferred from its name.
    const boundTo = new Map<string, string>();
    for (const alias of Object.values(VIGIL_ALIASES)) {
        try {
            const id = await client.getMindIdForAlias(alias);
            if (id) boundTo.set(id, alias);
        } catch {
            // No conversation for that alias yet — expected before setup runs.
        }
    }

    console.log(`\n${minds.length} Mind(s)\n`);
    console.log("  status    cognition  role            name");

    let usable = 0;
    for (const mind of minds) {
        let cognition: number | null = null;
        try {
            cognition = (await client.getCognitionBalance(mind.mindId)).cognition;
        } catch {
            cognition = null;
        }

        // `isEnabled` mirrors the online/offline toggle in the Minds dashboard.
        // Being online carries an ongoing cost, so the working practice is to
        // bring a Mind online for a run and put it back offline afterwards.
        //
        // Reported, never counted toward "can answer a call": whether an
        // OFFLINE Mind replies has not actually been tested — every successful
        // run so far was made with the Mind online. Do not assume either way.
        // Cognition is the signal this script is confident about.
        const funded = (cognition ?? 0) > 0;
        if (funded) usable++;

        const status = funded ? "ok     " : "NO FUEL";
        const balance = cognition === null ? "       ?" : cognition.toFixed(2).padStart(8);
        const role = (boundTo.get(mind.mindId) ?? "—").padEnd(15);
        const flag = mind.isEnabled === false ? "  (isEnabled=false)" : "";

        console.log(
            `  ${status}  ${balance}   ${role} ${mind.name ?? mind.mindId}${flag}`
        );
    }

    console.log(`\n${usable} of ${minds.length} can answer a call.`);

    if (usable < minds.length) {
        console.log(
            "\nAn unfunded Mind does not fail fast. queryVigil waits the full\n" +
            "VIGIL_TIMEOUT_MS (240s), so handleMessage — trust, then culture, then\n" +
            "moderator — burns up to 12 minutes before escalating with empty context.\n" +
            "Top up the roles you intend to demo, or demo only the funded paths.\n\n" +
            "A negative balance is overdrawn, not a reporting quirk: the balance is\n" +
            "eventually consistent around a call, but it does not settle below zero\n" +
            "on its own.\n"
        );
    } else {
        console.log();
    }
}

main().catch((err) => {
    console.error("\nInventory threw:", err);
    process.exit(1);
});
