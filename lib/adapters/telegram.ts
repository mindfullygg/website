// ============================================================
// mindfully.gg — Telegram receiver
// Translates grammY events into CommunityEvents and hands them to
// the orchestrator. Inbound only — moderation actions go out over
// REST from lib/adapters/rest.ts, which works in any process rather
// than only in one that has started a bot.
// ============================================================

import { Bot, type Context } from "grammy";
import type {
    CommunityMessageEvent,
    CommunityMemberJoinEvent,
} from "@/types";
import { processMessage, processNewMember } from "./index";

// --- Event Conversion ---

function messageToEvent(ctx: Context): CommunityMessageEvent | null {
    const msg = ctx.message;
    if (!msg) return null;
    if (!("text" in msg) || !msg.text) return null;
    if (!msg.chat || msg.chat.type === "private") return null;
    if (msg.from?.is_bot) return null;

    const displayName =
        msg.from?.first_name +
        (msg.from?.last_name ? ` ${msg.from.last_name}` : "");

    return {
        platform: "telegram",
        communityId: msg.chat.id.toString(),
        channelId: msg.chat.id.toString(),
        channel: "title" in msg.chat ? msg.chat.title ?? "group" : "group",
        userId: msg.from?.id.toString() ?? "unknown",
        displayName: displayName || msg.from?.username || "Unknown",
        content: msg.text,
        timestamp: new Date(msg.date * 1000).toISOString(),
        replyToMessageId: msg.reply_to_message?.message_id?.toString(),
    };
}

function memberJoinToEvent(
    ctx: Context,
    userId: number,
    displayName: string
): CommunityMemberJoinEvent | null {
    const msg = ctx.message;
    if (!msg) return null;

    return {
        platform: "telegram",
        communityId: msg.chat.id.toString(),
        userId: userId.toString(),
        displayName,
        timestamp: new Date(msg.date * 1000).toISOString(),
    };
}

// --- Telegram Bot ---

/**
 * Initialize and start the Telegram bot.
 * Call this from your bot entry point (separate process from Next.js).
 */
export async function startTelegramBot(token: string): Promise<Bot> {
    const bot = new Bot(token);

    // Log handler errors instead of letting them be swallowed.
    bot.catch((err) => {
        console.error("[Telegram] Handler error:", err.error);
    });

    // --- Message Handler ---

    bot.on("message:text", async (ctx) => {
        const event = messageToEvent(ctx);
        if (!event) return;

        try {
            const { decision } = await processMessage(event);

            // communityId is the Telegram chat id, and it is what the setup
            // flow asks for when binding a community. Logging the title alone
            // means going hunting for it elsewhere.
            console.log(
                `[Telegram] ${event.channel} (${event.communityId}) ${event.displayName}: ${event.content.slice(0, 50)}... → ${decision.classification} (${decision.action})`
            );
        } catch (err) {
            if ((err as Error).message?.includes("No creator connected")) return;
            console.error("[Telegram] Message processing error:", err);
        }
    });

    // --- New Member Handler ---

    bot.on("message:new_chat_members", async (ctx) => {
        for (const member of ctx.message.new_chat_members) {
            if (member.is_bot) continue;

            const displayName =
                member.first_name + (member.last_name ? ` ${member.last_name}` : "");

            const event = memberJoinToEvent(ctx, member.id, displayName);
            if (!event) continue;

            try {
                const { sent } = await processNewMember(event);

                console.log(
                    `[Telegram] New member: ${displayName} → Welcome ${sent ? "sent" : "failed"}`
                );
            } catch (err) {
                if ((err as Error).message?.includes("No creator connected")) return;
                console.error("[Telegram] Member join processing error:", err);
            }
        }
    });

    // --- Member Left Handler ---

    bot.on("message:left_chat_member", async (ctx) => {
        const member = ctx.message.left_chat_member;
        const displayName =
            member.first_name + (member.last_name ? ` ${member.last_name}` : "");

        console.log(
            `[Telegram] Member left: ${displayName} from ${"title" in ctx.message.chat ? ctx.message.chat.title : "group"
            }`
        );
        // TODO: notify Vera to update member profile (mark inactive)
    });

    // --- Slash Commands ---

    bot.command("keepers", async (ctx) => {
        await ctx.reply(
            "🛡️ *Your keepers*\n\n" +
            "Five minds protecting your community:\n" +
            "• Vera — Trust Keeper\n" +
            "• Sage — Culture Learner\n" +
            "• Kira — Moderator\n" +
            "• Mira — Health Pulse\n" +
            "• Nova — Community Guide\n\n" +
            "Use /trust @username to check a member's trust score.\n" +
            "Use /health for a community health check.",
            { parse_mode: "Markdown" }
        );
    });

    bot.command("trust", async (ctx) => {
        const mention = ctx.match.trim();
        if (!mention) {
            await ctx.reply("Usage: /trust @username");
            return;
        }

        await ctx.reply(
            `🔍 Querying Vera about ${mention}...\n\n` +
            `Connect your swarm at mindfully.gg/dashboard/setup to enable live trust lookups.`
        );
    });

    bot.command("health", async (ctx) => {
        await ctx.reply(
            "📊 Querying Mira for community health...\n\n" +
            "Connect your swarm at mindfully.gg/dashboard/setup to enable live health reports."
        );
    });

    // --- Launch ---

    // init() verifies the token and populates bot.botInfo; start() then runs
    // the long-polling loop in the background (it only resolves on stop).
    await bot.init();

    void bot.start({
        onStart: (info) => console.log(`[Telegram] Bot started as @${info.username}`),
    });

    // Graceful shutdown
    process.once("SIGINT", () => bot.stop());
    process.once("SIGTERM", () => bot.stop());

    return bot;
}
