// ============================================================
// mindfully.gg — read a conversation's history
//
//   npx tsx --env-file=.env.local scripts/check-conversation.ts <alias>
//   npx tsx --env-file=.env.local scripts/check-conversation.ts --run <run.json>
//
// No cognition. `getHistory` is a plain read.
//
// Exists to answer one question that nothing else can: when a call comes back
// with no reply, did the Mind answer late, or not at all? Those look identical
// from the harness and need opposite responses — raise the timeout, or go and
// find out why the Vigil declined. Guessing between them has already cost this
// project three wrong diagnoses.
// ============================================================

import { readFileSync } from "node:fs";
import { getCreatorClient } from "@/lib/minds-client";

function short(text: string, n = 110): string {
    const one = text.replace(/\s+/g, " ").trim();
    return one.length > n ? `${one.slice(0, n)}…` : one;
}

async function main() {
    const apiKey = process.env.MINDS_BUILDER_API_KEY;
    if (!apiKey) {
        console.error("MINDS_BUILDER_API_KEY is not set. Pass --env-file=.env.local");
        process.exit(1);
    }

    const runFlag = process.argv.indexOf("--run");
    let aliases: string[];

    if (runFlag !== -1) {
        // Every conversation a run touched, in case order.
        const run = JSON.parse(readFileSync(process.argv[runFlag + 1], "utf8")) as {
            recorded: { id: string; alias?: string; reply: string }[];
        };
        aliases = run.recorded.map((r) => r.alias).filter((a): a is string => !!a);
        if (aliases.length === 0) {
            console.error(
                "That run recorded no aliases — it predates alias recording.\n" +
                "Re-run the cases you care about, then inspect the new run file."
            );
            process.exit(1);
        }
    } else {
        aliases = process.argv.slice(2).filter((a) => !a.startsWith("--"));
        if (aliases.length === 0) {
            console.error("Usage: check-conversation.ts <alias> [<alias>…]\n       check-conversation.ts --run <run.json>");
            process.exit(1);
        }
    }

    const client = await getCreatorClient(apiKey);

    for (const alias of aliases) {
        console.log(`\n${"─".repeat(66)}\n${alias}\n${"─".repeat(66)}`);
        try {
            const history = await client.getHistory(alias, { limit: 50 });
            const rows = (Array.isArray(history) ? history : []) as {
                messageText?: string | null;
                senderType?: number | null;
            }[];

            if (rows.length === 0) {
                console.log("  (empty)");
                continue;
            }

            for (const row of rows) {
                const who = row.senderType === 1 ? "sent " : "MIND ";
                console.log(`  ${who} ${short(row.messageText ?? "")}`);
            }

            const replies = rows.filter(
                (r) => r.senderType !== 1 && r.messageText
            ).length;
            console.log(
                replies === 0
                    ? "  → no reply in this conversation. The Mind never answered it."
                    : `  → ${replies} reply/replies present. If the harness saw none, it answered AFTER the wait — raise --timeout.`
            );
        } catch (err) {
            console.log(`  unreadable: ${(err as Error).message}`);
        }
    }
    console.log();
}

main().catch((err) => {
    console.error("\nInspect threw:", err);
    process.exit(1);
});
