// ============================================================
// mindfully.gg — Bot Entry Point
//
//   npx tsx --env-file=.env.local bot/start.ts
//
// Runs separately from Next.js — Telegram long-polls and Discord needs a
// persistent WebSocket, and neither survives in a serverless function.
// Starts Discord and/or Telegram based on which tokens are present; either
// one alone is enough.
// ============================================================

import { startDiscordBot } from "@/lib/adapters/discord";
import { startTelegramBot } from "@/lib/adapters/telegram";

async function main() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  mindfully.gg — Bot Manager");
    console.log("  Five minds. One community.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log();

    const discordToken = process.env.DISCORD_BOT_TOKEN;
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!discordToken && !telegramToken) {
        // Nothing here loads a .env file — this process reads process.env
        // directly, so the env file has to come from the command line. Say so:
        // the usual cause of this message is a missing flag, not a missing
        // token, and "set a token" sends you looking in the wrong place.
        console.error(
            "No bot tokens found.\n\n" +
            "  Run it with the env file:\n" +
            "    npx tsx --env-file=.env.local bot/start.ts\n\n" +
            "  If you already did, set TELEGRAM_BOT_TOKEN and/or\n" +
            "  DISCORD_BOT_TOKEN in .env.local. Either one alone is enough."
        );
        process.exit(1);
    }

    const startups: Promise<void>[] = [];

    // Start Discord bot
    if (discordToken) {
        startups.push(
            startDiscordBot(discordToken)
                .then((client) => {
                    console.log(
                        `[Discord] ✓ Online as ${client.user?.tag} — ${client.guilds.cache.size} guilds`
                    );
                })
                .catch((err) => {
                    console.error("[Discord] ✗ Failed to start:", err.message);
                })
        );
    } else {
        console.log("[Discord] Skipped — no DISCORD_BOT_TOKEN");
    }

    // Start Telegram bot
    if (telegramToken) {
        startups.push(
            startTelegramBot(telegramToken)
                .then(() => {
                    console.log("[Telegram] ✓ Online and listening");
                })
                .catch((err) => {
                    console.error("[Telegram] ✗ Failed to start:", err.message);
                })
        );
    } else {
        console.log("[Telegram] Skipped — no TELEGRAM_BOT_TOKEN");
    }

    await Promise.allSettled(startups);

    console.log();
    console.log("Vigils bot manager running. Press Ctrl+C to stop.");
}

main().catch(console.error);
