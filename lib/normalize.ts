// ============================================================
// mindfully.gg — Outbound text normalisation
//
// Minds return HTML. Not always, not documented, and not stoppable from the
// prompt: the Skill demands plain text, the prompt demands plain text, and
// replies still come back wrapped in <p> with <br> between paragraphs. Three
// rounds of rewording changed nothing.
//
// So stop asking. The reply is HTML-ish; convert it at the boundary that knows
// where the text is going. That is the adapter, and it holds regardless of what
// any Skill does next — including a Skill nobody here wrote.
// ============================================================

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
};

function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
        if (body[0] === "#") {
            const code =
                body[1] === "x" || body[1] === "X"
                    ? parseInt(body.slice(2), 16)
                    : parseInt(body.slice(1), 10);
            // Reject non-characters and anything out of range rather than
            // emitting a replacement char into someone's welcome message.
            if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return match;
            try {
                return String.fromCodePoint(code);
            } catch {
                return match;
            }
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });
}

/**
 * HTML from a Vigil → plain text a human can read in a chat client.
 *
 * Deliberately not a parser. The input is a short conversational message, not a
 * document, and a real parser would be a dependency plus a bundle cost for
 * roughly eleven tags. Anything unrecognised is dropped rather than escaped,
 * because a member should never see markup either way.
 *
 * Structure is preserved where it carries meaning — paragraph and list breaks —
 * and discarded where it does not. Bold and italics are dropped rather than
 * translated: the markdown that would represent them differs per platform, and
 * an unstyled sentence beats a stray asterisk.
 */
export function toPlainText(input: string): string {
    // Nothing to do, and no risk of mangling text that merely contains "<".
    if (!/[<&]/.test(input)) return input.trim();

    let text = input;

    // Blocks that vanish entirely, contents included.
    text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

    // Line breaks.
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/(p|div|h[1-6]|blockquote|tr)\s*>/gi, "\n\n");
    text = text.replace(/<(p|div|h[1-6]|blockquote|tr)\b[^>]*>/gi, "");

    // Lists. A bullet reads as a bullet on every platform; a <li> does not.
    text = text.replace(/<li\b[^>]*>/gi, "\n• ");
    text = text.replace(/<\/li\s*>/gi, "");
    text = text.replace(/<\/(ul|ol)\s*>/gi, "\n\n");

    text = text.replace(/<hr\s*\/?>/gi, "\n\n");

    // Everything else: drop the tag, keep the words inside it.
    text = text.replace(/<\/?[a-z][^>]*>/gi, "");

    text = decodeEntities(text);

    // Tidy up. Trailing spaces before a newline come from tag removal, and
    // three or more blank lines are always an artefact, never intent.
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
}

/** True when `toPlainText` would change this string — i.e. it carried markup. */
export function containsMarkup(input: string): boolean {
    return toPlainText(input) !== input.trim();
}

/**
 * Escape for Telegram's `parse_mode: "HTML"`.
 *
 * Only needed on the one path that uses it — the inline-mention fallback. An
 * unescaped "&" or "<" in the message body makes Telegram reject the *whole*
 * send with a 400, so the member would get nothing at all. Telegram documents
 * exactly these three characters.
 */
export function escapeTelegramHtml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
