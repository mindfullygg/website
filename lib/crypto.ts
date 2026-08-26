// ============================================================
// mindfully.gg — Encryption (AES-256-GCM)
// Creator API keys are encrypted at rest. Key material comes from
// ENCRYPTION_KEY and never leaves the server.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256
const VERSION = "v1";

const KEY_HELP = "Generate one with: openssl rand -base64 32";

let cachedKey: Buffer | null = null;

/**
 * Resolve ENCRYPTION_KEY into raw key bytes. Accepts base64 or hex.
 * Read lazily so importing this module doesn't throw during build.
 */
function getKey(): Buffer {
    if (cachedKey) return cachedKey;

    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(`ENCRYPTION_KEY is not set. ${KEY_HELP}`);
    }

    const isHex = raw.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(raw);
    const key = Buffer.from(raw, isHex ? "hex" : "base64");

    if (key.length !== KEY_BYTES) {
        throw new Error(
            `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ${KEY_HELP}`
        );
    }

    cachedKey = key;
    return key;
}

/**
 * Encrypt a secret for storage.
 * Returns `v1.<iv>.<tag>.<ciphertext>`, all base64. The version prefix
 * exists so a future key rotation can recognise the old format.
 */
export function encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    return [
        VERSION,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        ciphertext.toString("base64"),
    ].join(".");
}

/**
 * Decrypt a value produced by `encrypt`.
 * Throws if the payload is malformed or fails the GCM auth tag check —
 * a tampered ciphertext never decrypts to a usable value.
 */
export function decrypt(payload: string): string {
    const parts = payload.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error("Malformed ciphertext: expected v1.<iv>.<tag>.<data>");
    }

    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
    ]).toString("utf8");
}
