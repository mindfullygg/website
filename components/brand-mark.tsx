/**
 * The mindfully.gg mark: an open ring with five nodes.
 *
 * Five nodes for the five keepers, and the ring left open at the bottom rather
 * than closed — a community that is still being joined, not a sealed circle.
 *
 * **Inlined, not loaded from `/public/mark-primary.svg`.** That file is the
 * artwork's source of truth and stays for favicon and OG use; this mirrors it.
 * The trade is deliberate: serving it as an `<img>` costs a request for 300
 * bytes and cannot be sized or hidden from assistive tech per context, and
 * `next/image` would need `dangerouslyAllowSVG`, which is a global flag for one
 * icon. If the artwork changes, change both.
 *
 * **Weighted for small sizes.** The stroke is 4.0 and the nodes r4.5, against
 * the 2.0 / 3.3 first drawn. At 20px the original resolved to a 0.63px stroke
 * and 2px nodes — sub-pixel, so it rendered as a faint smudge with no five
 * nodes in it. 4.0 is 6.3% of the mark's width, which survives the nav.
 *
 * **The node colour flips with the background, and that is the whole trick.**
 * As first drawn the nodes were `#0F6E56` — darker than both the mint ring and
 * the surface — so on dark they punched holes rather than sitting on the ring.
 * That palette assumes a light background. `onLight` restores it.
 *
 * The failure worth not repeating: colouring the nodes the same mint as the
 * ring. It looks tidy in the file and destroys the idea — the nodes merge into
 * the stroke and the mark reads as a lumpy circle, not five keepers. The nodes
 * have to contrast with the *ring*, not just with the background.
 *
 * `aria-hidden` by default. Everywhere it currently appears it sits beside the
 * words "mindfully.gg", and announcing the logo twice helps nobody. Pass a
 * `label` where it stands alone.
 *
 * ---
 *
 * **On `/public/lockup-horizontal.svg`.** It was tried here in place of the
 * mark and reverted. Three things to know before reaching for it again, none
 * of them obvious from opening the file:
 *
 *  1. Its wordmark is `#04342C`, which measures **1.45:1** against zinc-950.
 *     Text needs 4.5:1. Rendered faithfully on any surface in this app it is
 *     invisible — the lockup is drawn for a light background.
 *  2. Its wordmark is live `<text>` asking for General Sans, then Switzer, then
 *     Inter. This app loads **Geist**, so none match and it falls through to
 *     the system sans — the logo renders in a different typeface from the rest
 *     of the site, and a different one again per operating system. An SVG
 *     cannot carry a font.
 *  3. Its decorative tittle at `cx="107"` is placed for General Sans metrics.
 *     In the face that actually renders, the "i" centres at 103.1, so the dot
 *     lands over the "d" — and the fallback face draws its own tittle anyway,
 *     giving two dots.
 *
 * (1) and (3) are fixable in code. (2) is not: the honest fix is to ship the
 * wordmark as outlined paths, which also makes (3) exact and lets the tittle
 * return. Until then, mark plus real HTML text is the version that is correct
 * everywhere — which is what the nav and the dashboard sidebar both use.
 */
export function BrandMark({
    className = "w-[18px] h-[18px]",
    label,
    onLight = false,
}: {
    className?: string;
    label?: string;
    /** Nodes darker than the ring, as originally drawn. For a light surface —
     *  print, an OG card on white, a slide. Nothing in this app needs it. */
    onLight?: boolean;
}) {
    const node = onLight ? "#0F6E56" : "#A7E8CE";
    return (
        <svg
            viewBox="0 0 64 64"
            fill="none"
            className={`${className} shrink-0`}
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            {label && <title>{label}</title>}
            <path
                d="M28.1 50.07 A18.0 18.0 0 1 1 35.9 50.07"
                stroke="#5DCAA5"
                strokeWidth="4.0"
                strokeLinecap="round"
            />
            <circle cx="32.0" cy="14.5" r="4.5" fill={node} />
            <circle cx="49.12" cy="26.94" r="4.5" fill={node} />
            <circle cx="42.58" cy="47.06" r="4.5" fill={node} />
            <circle cx="21.42" cy="47.06" r="4.5" fill={node} />
            <circle cx="14.88" cy="26.94" r="4.5" fill={node} />
        </svg>
    );
}
