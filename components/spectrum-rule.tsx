import { VIGILS } from "@/types";
import { KEEPER_ORDER } from "@/lib/keepers";
import { cn } from "@/lib/utils";

/**
 * A hairline in five equal segments, one per Keeper.
 *
 * The accent on this site is not a single hue — it is the five-role spectrum
 * already defined in `types/index.ts`. This is that idea used structurally: it
 * sits under the marketing nav and above the dashboard's account footer, so the
 * identity is carried by the layout rather than by a logo.
 *
 * The outer two segments fade to transparent so the bar reads as a spectrum
 * rather than as five stripes with hard ends.
 *
 * Its own module rather than part of `site-chrome.tsx`, because the dashboard
 * uses it too and `site-chrome` pulls in the marketing nav's client component —
 * importing it there would drag `NavAuth` and Clerk's `useAuth` into every
 * dashboard route for the sake of five coloured spans.
 */
export function SpectrumRule({ className }: { className?: string }) {
    return (
        <div className={cn("grid grid-cols-5 h-px w-full", className)} aria-hidden>
            {KEEPER_ORDER.map((name, i) => {
                const c = VIGILS[name].textColor;
                const background =
                    i === 0
                        ? `linear-gradient(90deg, transparent, ${c})`
                        : i === KEEPER_ORDER.length - 1
                            ? `linear-gradient(90deg, ${c}, transparent)`
                            : c;
                return <span key={name} style={{ background }} />;
            })}
        </div>
    );
}
