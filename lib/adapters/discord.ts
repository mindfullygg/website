// ============================================================
// mindfully.gg — Discord receiver
// Translates discord.js gateway events into CommunityEvents and
// hands them to the orchestrator. Inbound only — moderation actions
// go out over REST from lib/adapters/rest.ts, which works in any
// process rather than only in one that has started a bot.
// ============================================================

import {
    Client,
    GatewayIntentBits,
    Events,
    type Message,
    type GuildMember,
} from "discord.js";
import type {
    CommunityMessageEvent,
    CommunityMemberJoinEvent,
} from "@/types";
import { processMessage, processNewMember } from "./index";

// --- Event Conversion ---

function messageToEvent(message: Message): CommunityMessageEvent | null {
    if (!message.guild) return null;
    if (message.author.bot) return null;

    return {
        platform: "discord",
        communityId: message.guild.id,
        channelId: message.channel.id,
        channel: ("name" in message.channel ? message.channel.name : null) ?? "unknown",
        userId: message.author.id,
        displayName: message.member?.displayName ?? message.author.username,
        content: message.content,
        timestamp: message.createdAt.toISOString(),
        replyToMessageId: message.reference?.messageId ?? undefined,
    };
}

function memberJoinToEvent(member: GuildMember): CommunityMemberJoinEvent {
    return {
        platform: "discord",
        communityId: member.guild.id,
        userId: member.id,
        displayName: member.displayName ?? member.user.username,
        timestamp: new Date().toISOString(),
    };
}

// --- Discord Client ---

/**
 * Initialize and start the Discord bot.
 * Call this from your bot entry point (separate process from Next.js).
 */
export async function startDiscordBot(token: string): Promise<Client> {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent,
        ],
    });

    // --- Event Listeners ---

    client.on(Events.MessageCreate, async (message: Message) => {
        const event = messageToEvent(message);
        if (!event) return;

        try {
            const { decision, executed } = await processMessage(event);

            console.log(
                `[Discord] #${event.channel} ${event.displayName}: ${event.content.slice(0, 50)}... → ${decision.classification} (${decision.action})`
            );
        } catch (err) {
            // No session for this guild — ignore (not every guild is connected)
            if ((err as Error).message?.includes("No creator connected")) return;
            console.error("[Discord] Message processing error:", err);
        }
    });

    client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
        const event = memberJoinToEvent(member);

        try {
            const { welcomeMessage, sent } = await processNewMember(event);

            console.log(
                `[Discord] New member: ${event.displayName} → Welcome ${sent ? "sent" : "failed"}`
            );
        } catch (err) {
            if ((err as Error).message?.includes("No creator connected")) return;
            console.error("[Discord] Member join processing error:", err);
        }
    });

    client.on(Events.GuildMemberRemove, async (member) => {
        if (!member.guild) return;
        console.log(
            `[Discord] Member left: ${member.displayName ?? member.user?.username} from ${member.guild.name}`
        );
        // TODO: notify Vera to update member profile (mark inactive)
    });

    client.once(Events.ClientReady, (c) => {
        console.log(`[Discord] Bot ready as ${c.user.tag} — watching ${c.guilds.cache.size} guilds`);
    });

    // Surface gateway/client errors instead of letting them be swallowed.
    client.on(Events.Error, (err) => {
        console.error("[Discord] Client error:", err);
    });

    // Login
    await client.login(token);

    return client;
}
