import { VIGILS, getTrustTier, getTrustColor, type VigilName, type TrustTier } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    Activity,
    Gavel,
    Languages,
    UserPlus,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";

// --- Vigil Avatar ---

/**
 * The role's glyph, on a tint of its colour.
 *
 * It used to be a letter. First ours — `displayName[0]`, so every avatar read
 * V/S/K/M/N, which is our naming of our Minds and not a fact about anyone
 * else's swarm. Then the creator's, taken from their Mind name, which was at
 * least theirs but still left the sidebar showing one mark for a role and the
 * page showing an unrelated letter.
 *
 * The glyph is the same one the nav uses, so a row here and the nav item that
 * leads to it are visibly the same thing — and it says nothing about what
 * anybody named their Mind.
 */
export function VigilAvatar({
    name,
    size = "md",
    className,
}: {
    name: VigilName;
    size?: "sm" | "md" | "lg";
    className?: string;
}) {
    const v = VIGILS[name];
    // Sized for a GLYPH, not a letter. `◎ ❋ ↯ ♡ ✦` are geometric symbols that
    // sit small inside their em box, so the type scale that suited an initial
    // renders them as specks — `sm` was a 24px circle around a 10px mark.
    const sizes = {
        sm: "w-7 h-7",
        md: "w-9 h-9",
        lg: "w-14 h-14",
    };
    // Explicit pixel sizes: lucide draws to a 24px grid, so the icon is sized
    // directly rather than inherited from a font size that no longer applies.
    const iconSize = { sm: 15, md: 19, lg: 30 };
    const Icon = VIGIL_ICONS[name];

    return (
        <div
            className={cn(
                "rounded-full flex items-center justify-center font-medium flex-shrink-0",
                sizes[size],
                className
            )}
            style={{ backgroundColor: v.color + "30", color: v.textColor }}
        >
            <Icon size={iconSize[size]} strokeWidth={2} aria-hidden />
        </div>
    );
}

// --- Icons ---

/**
 * Role → icon component.
 *
 * `VIGILS[role].icon` holds the lucide export *name* rather than the component,
 * because `types/index.ts` is imported by the bot process and by server routes,
 * and none of them should pull React in to read a colour. The mapping lives
 * here, on the client side of the line.
 *
 * Explicit rather than a dynamic lookup on the lucide namespace: a typo in a
 * name should fail the build, not render nothing at runtime.
 */
export const VIGIL_ICONS: Record<VigilName, LucideIcon> = {
    vera: ShieldCheck,
    sage: Languages,
    kira: Gavel,
    mira: Activity,
    nova: UserPlus,
};

/**
 * A role's icon at page-header size, in its readable colour.
 *
 * Two pages build their own header instead of using `PageHeader`, and both had
 * a hand-placed glyph in the brand colour — the dark one, so the mark sat
 * nearly invisible beside a bright title. This is the same icon and the same
 * treatment `PageHeader` applies, so the four headers match.
 */
export function VigilIcon({
    name,
    size = 26,
}: {
    name: VigilName;
    size?: number;
}) {
    const Icon = VIGIL_ICONS[name];
    return (
        <Icon
            size={size}
            strokeWidth={1.75}
            aria-hidden
            style={{ color: VIGILS[name].textColor }}
        />
    );
}

// --- Skeleton ---

/**
 * A placeholder that holds the shape of content that has not arrived.
 *
 * Settings makes three requests on mount, one of which reads a cognition
 * balance per Mind, so the wait is real. Replacing the whole page with the word
 * "Loading…" throws away the parts that are already known — the title, the
 * tabs, the section headings — and then reflows everything when data lands.
 *
 * Render the shell immediately and put these where the data goes instead. The
 * page arrives once, in its final layout, and only the unknown parts move.
 */
export function Skeleton({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn("animate-pulse rounded bg-zinc-800", className)}
        />
    );
}

/**
 * A stand-in for one row in a list.
 *
 * `lines` must match the row it stands in for. A two-line placeholder in front
 * of a one-line row is taller than what replaces it, so the page drops when the
 * data lands — which is the jump a skeleton exists to prevent. Getting the
 * shape wrong is worse than showing nothing, because it promises a layout and
 * then breaks it.
 *
 * Bar heights are chosen to match real content: `h-5` sits at the height of a
 * badge row, `h-4`/`h-3` at a title over a subtitle.
 */
export function SkeletonRow({
    lines = 2,
    className,
}: {
    lines?: 1 | 2;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3",
                className
            )}
        >
            {lines === 1 ? (
                <Skeleton className="h-5 w-2/5" />
            ) : (
                <>
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/5 mt-2" />
                </>
            )}
        </div>
    );
}

// --- Vigil Name ---

/**
 * Renders the ROLE, not our name for the Mind holding it. Pass `label` to show
 * the creator's own Mind name instead. See `VigilAvatar` for why.
 */
export function VigilName({
    name,
    label,
    showRole = false,
    className,
}: {
    name: VigilName;
    label?: string;
    showRole?: boolean;
    className?: string;
}) {
    const v = VIGILS[name];

    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            <span className="text-sm font-medium" style={{ color: v.textColor }}>
                {label?.trim() || v.role}
            </span>
            {showRole && label?.trim() && (
                <span className="text-xs text-zinc-400">{v.role}</span>
            )}
        </span>
    );
}

// --- Trust Score Badge ---

export function TrustBadge({
    score,
    showDot = true,
    className,
}: {
    score: number;
    showDot?: boolean;
    className?: string;
}) {
    const tier = getTrustTier(score);
    const color = getTrustColor(score);

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md",
                className
            )}
            style={{ backgroundColor: color + "20", color }}
        >
            {showDot && (
                <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}
            {score} · {tier}
        </span>
    );
}

// --- Status Dot ---

export function StatusDot({
    status,
    size = "sm",
    animate = false,
}: {
    status: "online" | "offline" | "busy" | "error";
    size?: "xs" | "sm" | "md";
    animate?: boolean;
}) {
    const colors = {
        online: "bg-emerald-500",
        offline: "bg-zinc-600",
        busy: "bg-amber-500",
        error: "bg-red-500",
    };
    const sizes = {
        xs: "w-1.5 h-1.5",
        sm: "w-2 h-2",
        md: "w-2.5 h-2.5",
    };

    return (
        <span
            className={cn(
                "inline-block rounded-full",
                colors[status],
                sizes[size],
                animate && status === "online" && "animate-pulse"
            )}
        />
    );
}

// --- Metric Card ---

export function MetricCard({
    label,
    value,
    sub,
    trend,
    className,
}: {
    label: string;
    value: string | number;
    sub?: string;
    trend?: { direction: "up" | "down" | "flat"; value: string; good: boolean };
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4",
                className
            )}
        >
            <p className="text-xs text-zinc-400">{label}</p>
            <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold">{value}</p>
                {trend && (
                    <span
                        className="text-xs font-medium"
                        style={{ color: trend.good ? "#10B981" : "#EF4444" }}
                    >
                        {trend.direction === "up"
                            ? "▲"
                            : trend.direction === "down"
                                ? "▼"
                                : "—"}{" "}
                        {trend.value}
                    </span>
                )}
            </div>
            {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
        </div>
    );
}

// --- Confidence Bar ---

export function ConfidenceBar({
    value,
    className,
}: {
    value: number;
    className?: string;
}) {
    const pct = Math.round(value * 100);
    const color =
        value >= 0.7 ? "#10B981" : value >= 0.4 ? "#F59E0B" : "#EF4444";

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
            <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
        </div>
    );
}

// --- Channel Status ---

export function ChannelStatus({ status }: { status: "healthy" | "watch" | "concern" }) {
    const config = {
        healthy: { color: "#10B981", label: "Healthy" },
        watch: { color: "#F59E0B", label: "Watch" },
        concern: { color: "#EF4444", label: "Concern" },
    };
    const { color, label } = config[status];

    return (
        <span
            className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: color + "20", color }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
            />
            {label}
        </span>
    );
}

// --- Severity Badge ---

export function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
    const config = {
        low: { color: "#6B7280", label: "Low" },
        medium: { color: "#3B82F6", label: "Medium" },
        high: { color: "#F59E0B", label: "High" },
        critical: { color: "#EF4444", label: "Critical" },
    };
    const { color, label } = config[severity];

    return (
        <span
            className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: color + "20", color }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
            />
            {label}
        </span>
    );
}

// --- Empty State ---

export function EmptyState({
    message,
    sub,
    className,
}: {
    message: string;
    sub?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center",
                className
            )}
        >
            <p className="text-zinc-500">{message}</p>
            {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
        </div>
    );
}

// --- Page Header ---

/**
 * `icon` is only needed for pages with no role behind them. A role page derives
 * its icon from `VIGIL_ICONS`, so the header, the sidebar entry and the avatar
 * cannot drift apart — there is one icon per role and one place it comes from.
 */
export function PageHeader({
    title,
    description,
    vigil,
    icon,
}: {
    title: string;
    description?: string;
    vigil?: VigilName;
    icon?: LucideIcon;
}) {
    const Icon = vigil ? VIGIL_ICONS[vigil] : icon;
    return (
        <div className="mb-8 flex items-center gap-3">
            {Icon && (
                <Icon
                    size={26}
                    strokeWidth={1.75}
                    aria-hidden
                    style={vigil ? { color: VIGILS[vigil].textColor } : undefined}
                />
            )}
            <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                {description && (
                    <p className="text-zinc-300 mt-0.5">
                        {vigil ? (
                            <>
                                <span style={{ color: VIGILS[vigil].textColor }}>
                                    {VIGILS[vigil].role}
                                </span>{" "}
                                — {description}
                            </>
                        ) : (
                            description
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}
