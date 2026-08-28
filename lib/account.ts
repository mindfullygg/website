// ============================================================
// mindfully.gg — Accounts & API Key Management
// Identity + login are owned by Clerk. An Account is keyed by the
// creator's Clerk `userId` and holds their connection to Minds: the
// AES-256-GCM encrypted Builder API key and their role → Mind map.
// The plaintext key is decrypted only at the point of use.
// ============================================================

import {
    type Account,
    type CommunityBinding,
    type Platform,
    type RoleMap,
} from "@/types";
import { decrypt, encrypt } from "@/lib/crypto";
import { keys, redis } from "@/lib/kv";
import { purgeForAccount, purgeForCommunity } from "@/lib/escalations";
import { purgeDigests } from "@/lib/health-digest";

/**
 * Connect (or re-connect) a creator's Builder API key to their account.
 *
 * Validates the key two ways before storing it:
 *   1. It must be a Builder API key JWT with a `humanId` claim.
 *   2. A live `listMinds()` call must succeed — proving the key is real and
 *      reachable, not just well-formed.
 *
 * The plaintext key is encrypted before it ever reaches Redis. Re-connecting
 * preserves an existing roleMap so a creator can rotate their key without
 * re-running the whole setup wizard.
 */
export async function connectApiKey(
    clerkUserId: string,
    apiKey: string
): Promise<Account> {
    // Loaded on demand rather than at module scope. The SDK is ESM-only and
    // its `exports` map has no `require` condition, so a static import makes
    // this whole module unloadable by any CJS-resolving tool — which broke
    // scripts/check-escalations.ts the moment it imported the purge helpers
    // from here. It is needed by this function alone, so importing it here
    // also keeps it out of the bundle for routes that only touch bindings.
    const { createMindsClient, parseHumanIdFromBuilderApiKey } = await import(
        "@animocabrands/minds-client-lib"
    );

    const humanId = parseHumanIdFromBuilderApiKey(apiKey);
    if (!humanId) {
        throw new Error("That does not look like a Builder API key.");
    }

    // Prove the key actually works before we store it.
    const client = createMindsClient({ builderApiKey: apiKey });
    await client.listMinds();

    const existing = await getAccount(clerkUserId);
    const now = new Date().toISOString();

    const account: Account = {
        clerkUserId,
        humanId,
        apiKeyEncrypted: encrypt(apiKey),
        roleMap: existing?.roleMap ?? {},
        connectedAt: existing?.connectedAt ?? now,
        lastActive: now,
    };

    await redis()
        .pipeline()
        .set(keys.account(clerkUserId), account)
        .sadd(keys.accountsIndex, clerkUserId)
        .exec();

    return account;
}

/**
 * Load a creator's account by Clerk userId. Returns null if they have not
 * connected a Builder API key yet.
 */
export async function getAccount(
    clerkUserId: string
): Promise<Account | null> {
    return (await redis().get<Account>(keys.account(clerkUserId))) ?? null;
}

/**
 * Decrypt the Builder API key for an account.
 * Kept separate from `getAccount` so the plaintext key is only ever
 * materialised where it is actually needed, never on an account object
 * that might get logged or serialised into a response.
 */
export async function getApiKeyForAccount(account: Account): Promise<string> {
    return decrypt(account.apiKeyEncrypted);
}

/**
 * Save the role → Mind map after the creator assigns each Vigil role to one
 * of their existing Minds during setup.
 */
export async function setRoleMap(
    clerkUserId: string,
    roleMap: RoleMap
): Promise<Account> {
    const account = await getAccount(clerkUserId);
    if (!account) {
        throw new Error("No account. Connect a Builder API key first.");
    }

    account.roleMap = roleMap;
    account.lastActive = new Date().toISOString();
    await redis().set(keys.account(clerkUserId), account);
    return account;
}

/**
 * Update last-active timestamp.
 */
export async function touchAccount(clerkUserId: string): Promise<void> {
    const account = await getAccount(clerkUserId);
    if (!account) return;
    account.lastActive = new Date().toISOString();
    await redis().set(keys.account(clerkUserId), account);
}

/**
 * Bind a community to an account so the bot can route inbound events to the
 * right creator. A community maps to exactly one account — attempting to bind
 * a community already owned by someone else is rejected (no hijacking).
 */
export async function bindCommunity(
    clerkUserId: string,
    platform: Platform,
    communityId: string,
    language?: string,
    blockedTerms?: string[],
    cultureNotes?: string
): Promise<void> {
    const existing = await redis().get<CommunityBinding>(
        keys.community(communityId)
    );
    if (existing && existing.clerkUserId !== clerkUserId) {
        throw new Error(
            `Community ${communityId} is already connected to another account.`
        );
    }

    // An empty array means "the creator cleared the list" and must be stored;
    // `undefined` means the caller did not mention terms and whatever is there
    // should survive. That is why this checks for undefined rather than
    // truthiness — `[]` is falsy and would otherwise resurrect the old list.
    const terms =
        blockedTerms !== undefined ? blockedTerms : existing?.blockedTerms;

    // Same distinction for the culture notes: "" is the creator clearing them
    // and must be stored as absent, `undefined` means this call did not mention
    // them and whatever is there should survive a re-bind.
    const notes =
        cultureNotes !== undefined ? cultureNotes : existing?.cultureNotes;

    const binding: CommunityBinding = {
        clerkUserId,
        platform,
        // Re-binding without a language must not silently erase one already set.
        ...(language ? { language } : existing?.language ? { language: existing.language } : {}),
        ...(terms && terms.length > 0 ? { blockedTerms: terms } : {}),
        ...(notes ? { cultureNotes: notes } : {}),
    };
    await redis()
        .pipeline()
        .set(keys.community(communityId), binding)
        .sadd(keys.accountCommunities(clerkUserId), communityId)
        .exec();
}

/**
 * Community ids as they come back out of a Redis set, coerced to the strings
 * they are declared to be.
 *
 * The Upstash client JSON-parses every set member, so a Telegram chat id like
 * `-1004395595935` returns as the **number** -1004395595935 while the type says
 * `string`. Nothing complains: `keys.community(id)` interpolates either into the
 * same key, so reads keep working, and React renders a number as happily as a
 * string. It surfaces much further away, as `===` against a real string
 * returning false and `.trim()` throwing — which is how it broke unbinding and
 * saving an edit, both of them silently.
 *
 * `String()` is lossless here, verified against Upstash rather than assumed: a
 * 19-digit Discord snowflake exceeds `Number.MAX_SAFE_INTEGER`, and the client
 * leaves values it cannot hold exactly as strings. Only ids that fit safely are
 * parsed, and those convert back digit-for-digit.
 *
 * Coerced here, at the one boundary where ids re-enter untyped, rather than at
 * each comparison. The other sets are safe by their contents — Clerk ids
 * (`user_…`) and UUIDs never parse as numbers — but this set holds raw platform
 * chat ids, so it is the one that needs it.
 */
function communityIds(members: unknown[]): string[] {
    return members.map(String);
}

/**
 * List the communities an account has bound. Prunes reverse-index entries
 * whose forward pointer has been removed or reassigned.
 */
export async function listCommunities(
    clerkUserId: string
): Promise<
    {
        communityId: string;
        platform: Platform;
        language?: string;
        blockedTerms?: string[];
        cultureNotes?: string;
    }[]
> {
    const kv = redis();
    const ids = communityIds(
        await kv.smembers(keys.accountCommunities(clerkUserId))
    );
    if (ids.length === 0) return [];

    const bindings = await kv.mget<(CommunityBinding | null)[]>(
        ...ids.map((id) => keys.community(id))
    );

    const out: {
        communityId: string;
        platform: Platform;
        language?: string;
        blockedTerms?: string[];
        cultureNotes?: string;
    }[] = [];
    const stale: string[] = [];
    ids.forEach((id, i) => {
        const b = bindings[i];
        if (b && b.clerkUserId === clerkUserId) {
            out.push({
                communityId: id,
                platform: b.platform,
                language: b.language,
                blockedTerms: b.blockedTerms,
                cultureNotes: b.cultureNotes,
            });
        } else {
            stale.push(id);
        }
    });

    if (stale.length > 0) {
        await kv.srem(keys.accountCommunities(clerkUserId), ...stale);
    }

    return out;
}

/**
 * Resolve a community to the account that owns it, for bot event routing.
 * Returns null if the community is unbound or its account has been removed.
 */
export async function getAccountByCommunity(
    communityId: string
): Promise<{
    account: Account;
    platform: Platform;
    language?: string;
    blockedTerms?: string[];
    cultureNotes?: string;
} | null> {
    const binding = await redis().get<CommunityBinding>(
        keys.community(communityId)
    );
    if (!binding) return null;

    const account = await getAccount(binding.clerkUserId);
    if (!account) return null;

    return {
        account,
        platform: binding.platform,
        language: binding.language,
        blockedTerms: binding.blockedTerms,
        cultureNotes: binding.cultureNotes,
    };
}

/**
 * Remove a community binding owned by the given account.
 *
 * Escalations from that community go with it. They hold the community's message
 * content, and once the binding is gone they cannot be acted on anyway — the
 * override route resolves ownership through `getAccountByCommunity`, which
 * returns null, so any pending item would sit unresolvable forever.
 *
 * Purge first: if it fails, the caller sees the error and the binding is still
 * there to retry against, rather than the content being stranded with nothing
 * pointing at it.
 */
export async function unbindCommunity(
    clerkUserId: string,
    communityId: string
): Promise<void> {
    await purgeForCommunity(communityId);

    await redis()
        .pipeline()
        .del(keys.community(communityId))
        .srem(keys.accountCommunities(clerkUserId), communityId)
        .exec();
}

/**
 * Disconnect a creator's account: removes the stored key, role map, every
 * community binding (both the pointers and the reverse index), every
 * escalation the account owns, and its stored health digests.
 *
 * Both purges run, not just the account one. `purgeForAccount` works from the
 * pending and resolved sorted sets, so an escalation whose packet has expired
 * leaves its id behind in the community index; sweeping each community as well
 * clears those. Nothing here is reachable afterwards, so anything missed would
 * be unreferenced message content sitting in Redis until its TTL — which is
 * the situation this exists to prevent.
 *
 * NOTE: nothing currently calls this. There is no delete-account endpoint and
 * no Clerk `user.deleted` webhook, so a creator deleting themselves in Clerk
 * leaves their record here. That gap predates the escalation store but matters
 * more now. See "Known gaps" in plan.md.
 */
export async function disconnectAccount(clerkUserId: string): Promise<void> {
    const kv = redis();
    // Coerced for the same reason as `listCommunities` — these ids are passed
    // to `purgeForCommunity`, which compares them.
    const ids = communityIds(
        await kv.smembers(keys.accountCommunities(clerkUserId))
    );

    for (const id of ids) {
        await purgeForCommunity(id);
    }
    await purgeForAccount(clerkUserId);
    // Digests are Vigil prose about this creator's community. They carry a
    // 30-day TTL, which is a retention control and not a substitute for
    // erasure — the account is unreachable after this, so anything left would
    // be orphaned text sitting in Redis until it aged out.
    await purgeDigests(clerkUserId);

    const pipeline = kv.pipeline();
    for (const id of ids) {
        pipeline.del(keys.community(id));
    }
    pipeline.del(keys.accountCommunities(clerkUserId));
    pipeline.del(keys.account(clerkUserId));
    pipeline.srem(keys.accountsIndex, clerkUserId);
    await pipeline.exec();
}

/**
 * List all connected accounts (digest cron, admin). Prunes index entries
 * whose account records have been removed, mirroring the old listSessions.
 */
export async function listAccounts(): Promise<Account[]> {
    const kv = redis();
    const ids = await kv.smembers(keys.accountsIndex);
    if (ids.length === 0) return [];

    const accounts = await kv.mget<(Account | null)[]>(
        ...ids.map((id) => keys.account(id))
    );

    const stale = ids.filter((_, i) => accounts[i] === null);
    if (stale.length > 0) {
        await kv.srem(keys.accountsIndex, ...stale);
    }

    return accounts.filter((a): a is Account => a !== null);
}
