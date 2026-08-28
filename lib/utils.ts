import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The marketing type scale's names, from the `@theme` block in
 * `app/globals.css`. Keep the two lists in step.
 *
 * tailwind-merge resolves conflicts by pattern, and it only knows Tailwind's
 * own scale — `text-xs`, `text-sm`, `text-base` and friends. A `text-*` class
 * it does not recognise is filed as a **text colour**, so `text-sub` and
 * `text-zinc-100` looked like two colours competing and the colour won:
 *
 *     cn("text-sub font-medium text-zinc-100")  →  "font-medium text-zinc-100"
 *
 * The size vanished silently — no error, no warning, and only inside `cn()`,
 * so the same class written directly on an element worked fine. That is why it
 * survived a whole type pass: `Kicker` had been rendering at the inherited 16px
 * instead of 22px, and the two other kickers on the landing page with it.
 */
const MARKETING_TEXT_SIZES = [
    "micro",
    "label",
    "meta",
    "body",
    "lead",
    "sub",
    "title",
    "display",
    "hero",
] as const

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [{ text: [...MARKETING_TEXT_SIZES] }],
        },
    },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
