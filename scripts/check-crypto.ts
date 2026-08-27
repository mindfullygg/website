// ============================================================
// mindfully.gg — verify ENCRYPTION_KEY
//
//   npx tsx --env-file=.env.local scripts/check-crypto.ts
//
// No network, no cognition. Confirms the key is present, the right length, and
// that a value round-trips — before anything real is encrypted with it.
//
// Worth doing once, deliberately. This key encrypts creator Minds API keys at
// rest and nothing implements rotation, so a wrong or later-changed key does
// not fail loudly at write time: it fails at read time, looking like a broken
// account rather than a config mistake.
// ============================================================

import { encrypt, decrypt } from "@/lib/crypto";

function fail(message: string): never {
    console.error(`\n  FAIL  ${message}\n`);
    process.exit(1);
}

const raw = process.env.ENCRYPTION_KEY;

console.log("\nENCRYPTION_KEY\n");

if (!raw) {
    fail(
        "not set.\n" +
        "        Generate one with:  openssl rand -base64 32\n" +
        "        then add it to .env.local as ENCRYPTION_KEY=<value>\n" +
        "        (keep the trailing = padding, and do not quote it)"
    );
}

const isHex = raw.length === 64 && /^[0-9a-f]+$/i.test(raw);
const bytes = Buffer.from(raw, isHex ? "hex" : "base64").length;
console.log(`  ok    present — ${isHex ? "hex" : "base64"}, decodes to ${bytes} bytes`);

// The real check. getKey() throws on a wrong length, so this covers it too.
// Shapes that resemble what actually gets stored — a long opaque token, text
// with multi-byte characters, and the empty string. Deliberately NOT written to
// look like a real credential: a sample beginning `sk-` or `xoxb-` trips secret
// scanners on push, and a blocked push over a fake value in a test script is a
// waste of everyone's afternoon.
const samples = [
    "hello",
    "TOKEN-PLACEHOLDER-" + "0".repeat(40),
    "unicode: café · 日本語 · 🔐",
    "",
];

for (const plaintext of samples) {
    let ciphertext: string;
    try {
        ciphertext = encrypt(plaintext);
    } catch (err) {
        fail((err as Error).message);
    }

    const back = decrypt(ciphertext);
    if (back !== plaintext) {
        fail(`round-trip mismatch: sent ${JSON.stringify(plaintext)}, got ${JSON.stringify(back)}`);
    }
}
console.log(`  ok    ${samples.length} values round-tripped (including unicode and empty)`);

// Two encryptions of the same value must differ — a fresh IV each time. If they
// match, the IV is being reused, which leaks equality between stored secrets.
if (encrypt("same") === encrypt("same")) {
    fail("identical ciphertext for identical input — the IV is not random");
}
console.log("  ok    same input encrypts differently each time (fresh IV)");

// Tampering must be rejected, not silently decrypted. That is the point of GCM.
const [version, iv, tag, body] = encrypt("tamper me").split(".");
const flipped = Buffer.from(body, "base64");
flipped[0] ^= 0x01;
try {
    decrypt([version, iv, tag, flipped.toString("base64")].join("."));
    fail("a modified ciphertext decrypted — the auth tag is not being checked");
} catch {
    console.log("  ok    modified ciphertext is rejected");
}

console.log(
    "\nKey is good. Use this exact value on Vercel too — a different key there\n" +
    "cannot decrypt anything stored locally, and vice versa.\n"
);
