// ============================================================
// mindfully.gg — REST platform adapters
//
// Outbound only. Receiving events needs a persistent connection (the
// Discord gateway, Telegram long-polling); *sending* an action does
// not — every one is a plain authenticated HTTPS call. Splitting the
// two means one implementation of every action, working identically
// in the bot process and in a Vercel function.
//
// This is what fixes the silent no-op: the old adapters were reachable
// only after `registerAdapter` ran at bot startup, so any process that
// never started a bot — every Vercel function — skipped every warn and
// mute without erroring.
//
// Clients are built lazily and memoised. Never construct at module
// scope: the Next build runs on machines with no bot tokens set.
// ============================================================

// Import the standalone REST client, NOT `discord.js`. The umbrella package
// pulls in @discordjs/ws for the gateway, which references the optional native
// module `zlib-sync`; the bundler cannot resolve it and the Next build fails
// outright. The gateway is exactly what this file does not need, and skipping
// it also keeps the serverless bundle small.
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { Api } from "grammy";
import type { Platform, PlatformAction, PlatformAdapter } from "@/types";
import { toPlainText, escapeTelegramHtml } from "@/lib/normalize";

/** Discord refuses a timeout longer than 28 days. */
const DISCORD_MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

let discordRest: REST | null = null;
let telegramApi: Api | null = null;

function getDiscordRest(): REST | null {
    if (discordRest) return discordRest;
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return null;
    discordRest = new REST({ version: "10" }).setToken(token);
    return discordRest;
}

function getTelegramApi(): Api | null {
    if (telegramApi) return telegramApi;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    telegramApi = new Api(token);
    return telegramApi;
}

// ---- Discord ----

/** Open (or reuse) a DM channel with a user and return its id. */
async function discordDmChannel(rest: REST, userId: string): Promise<string> {
    const channel = (await rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
    })) as { id: string };
    return channel.id;
}

async function discordSend(
    rest: REST,
    channelId: string,
    content: string
): Promise<void> {
    await rest.post(Routes.channelMessages(channelId), { body: { content } });
}

/**
 * DM a member, falling back to a mention in the channel they posted in.
 *
 * A member with DMs closed makes Discord reject the send, which previously
 * meant the warning vanished. Telegram already had this fallback; Discord now
 * matches it. Without a `channelId` there is nowhere to fall back to, so the
 * original error propagates rather than being swallowed.
 */
async function discordDmWithFallback(
    rest: REST,
    userId: string,
    message: string,
    channelId?: string
): Promise<void> {
    try {
        await discordSend(rest, await discordDmChannel(rest, userId), message);
    } catch (err) {
        if (!channelId) throw err;
        console.warn(
            `[Discord] DM to ${userId} failed, falling back to #${channelId}`
        );
        await discordSend(rest, channelId, `<@${userId}> ${message}`);
    }
}

const discordRestAdapter: PlatformAdapter = {
    platform: "discord",

    async executeAction(action: PlatformAction): Promise<void> {
        const rest = getDiscordRest();
        if (!rest) throw new Error("DISCORD_BOT_TOKEN is not set");

        // Vigil replies arrive as HTML. Convert once, here, so no send site can
        // forget — see lib/normalize.ts.
        const message = toPlainText(action.message ?? "");

        switch (action.type) {
            case "send_message": {
                if (!action.channelId) break;
                await discordSend(rest, action.channelId, message);
                break;
            }
            case "send_dm":
            case "warn": {
                if (!action.userId) break;
                await discordDmWithFallback(
                    rest,
                    action.userId,
                    message || "You have received a warning.",
                    action.channelId
                );
                break;
            }
            case "mute": {
                if (!action.userId) break;
                const seconds = Math.min(
                    action.duration ?? 600,
                    DISCORD_MAX_TIMEOUT_SECONDS
                );
                await rest.patch(
                    Routes.guildMember(action.communityId, action.userId),
                    {
                        body: {
                            communication_disabled_until: new Date(
                                Date.now() + seconds * 1000
                            ).toISOString(),
                        },
                        reason: "Vigils moderation",
                    }
                );
                break;
            }
            case "unmute": {
                if (!action.userId) break;
                await rest.patch(
                    Routes.guildMember(action.communityId, action.userId),
                    { body: { communication_disabled_until: null } }
                );
                break;
            }
            case "kick": {
                if (!action.userId) break;
                await rest.delete(
                    Routes.guildMember(action.communityId, action.userId),
                    { reason: "Vigils moderation" }
                );
                break;
            }
        }
    },

    async sendWelcome(communityId, userId, message, channelId) {
        await this.executeAction({
            platform: "discord",
            communityId,
            channelId,
            userId,
            type: "send_dm",
            message,
        });
    },

    async sendWarning(communityId, userId, message, channelId) {
        await this.executeAction({
            platform: "discord",
            communityId,
            channelId,
            userId,
            type: "warn",
            message,
        });
    },

    async muteUser(communityId, userId, durationSeconds) {
        await this.executeAction({
            platform: "discord",
            communityId,
            userId,
            type: "mute",
            duration: durationSeconds,
        });
    },
};

// ---- Telegram ----

const telegramRestAdapter: PlatformAdapter = {
    platform: "telegram",

    async executeAction(action: PlatformAction): Promise<void> {
        const api = getTelegramApi();
        if (!api) throw new Error("TELEGRAM_BOT_TOKEN is not set");

        // See the Discord adapter — same reason, same single conversion point.
        const message = toPlainText(action.message ?? "");

        switch (action.type) {
            case "send_message": {
                await api.sendMessage(
                    action.channelId ?? action.communityId,
                    message
                );
                break;
            }
            case "send_dm":
            case "warn": {
                if (!action.userId) break;
                try {
                    await api.sendMessage(action.userId, message);
                } catch {
                    // Telegram only allows a DM once the user has started a
                    // conversation with the bot. Fall back to a tappable inline
                    // mention in the group — a numeric @id notifies nobody.
                    //
                    // This is the one path that sets parse_mode, so the body
                    // must be escaped: a bare "&" or "<" makes Telegram reject
                    // the entire send with a 400 and the member gets nothing.
                    await api.sendMessage(
                        action.communityId,
                        `<a href="tg://user?id=${action.userId}">member</a> ${escapeTelegramHtml(message)}`,
                        { parse_mode: "HTML" }
                    );
                }
                break;
            }
            case "mute": {
                if (!action.userId) break;
                await api.restrictChatMember(
                    action.communityId,
                    Number(action.userId),
                    {
                        can_send_messages: false,
                        can_send_audios: false,
                        can_send_documents: false,
                        can_send_photos: false,
                        can_send_videos: false,
                        can_send_video_notes: false,
                        can_send_voice_notes: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false,
                    },
                    {
                        until_date:
                            Math.floor(Date.now() / 1000) +
                            (action.duration ?? 600),
                    }
                );
                break;
            }
            case "unmute": {
                if (!action.userId) break;
                await api.restrictChatMember(
                    action.communityId,
                    Number(action.userId),
                    {
                        can_send_messages: true,
                        can_send_audios: true,
                        can_send_documents: true,
                        can_send_photos: true,
                        can_send_videos: true,
                        can_send_video_notes: true,
                        can_send_voice_notes: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                    }
                );
                break;
            }
            case "kick": {
                if (!action.userId) break;
                // Telegram "kick" is a ban; unban immediately so they can rejoin.
                await api.banChatMember(action.communityId, Number(action.userId));
                await api.unbanChatMember(
                    action.communityId,
                    Number(action.userId)
                );
                break;
            }
        }
    },

    async sendWelcome(communityId, userId, message) {
        await this.executeAction({
            platform: "telegram",
            communityId,
            userId,
            type: "send_dm",
            message,
        });
    },

    async sendWarning(communityId, userId, message) {
        await this.executeAction({
            platform: "telegram",
            communityId,
            userId,
            type: "warn",
            message,
        });
    },

    async muteUser(communityId, userId, durationSeconds) {
        await this.executeAction({
            platform: "telegram",
            communityId,
            userId,
            type: "mute",
            duration: durationSeconds,
        });
    },
};

// ---- Lookup ----

const REST_ADAPTERS: Record<Platform, PlatformAdapter | null> = {
    discord: discordRestAdapter,
    telegram: telegramRestAdapter,
    slack: null,
};

/**
 * The adapter for a platform, or undefined when there is none — either the
 * platform is unsupported or its bot token is missing from this environment.
 *
 * Unlike the registry this replaced, the answer does not depend on whether a
 * bot happens to have started in this process.
 */
export function getRestAdapter(
    platform: Platform
): PlatformAdapter | undefined {
    const adapter = REST_ADAPTERS[platform];
    if (!adapter) return undefined;

    const tokenPresent =
        platform === "discord" ? !!getDiscordRest() : !!getTelegramApi();

    return tokenPresent ? adapter : undefined;
}
