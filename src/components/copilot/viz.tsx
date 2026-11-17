"use client";

/**
 * Petits composants de visualisation de l'écran Copilot (HTML/CSS, sans librairie).
 * Couleurs : palette catégorielle de référence (slot 1 bleu, slot 2 orange) avec une teinte dédiée au
 * mode sombre ; paire validée (scripts/validate_palette du skill dataviz) en clair et en sombre.
 * Le texte reste dans les encres du thème, jamais la couleur de série.
 */

const SERIES_1 = "bg-[#2a78d6] dark:bg-[#3987e5]";
const SERIES_2 = "bg-[#eb6834] dark:bg-[#d95926]";

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 min-w-0">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-lg font-bold mt-0.5 truncate tabular-nums">{value}</p>
      {sub && <p className="text-xs text-foreground/40 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

/** Jauge « utilisé / disponible » (ex. licences attribuées / achetées). */
export function Meter({ label, used, total, note }: { label: string; used: number; total: number; note?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const fill = pct >= 100 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-1.5 text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className="text-xs shrink-0 tabular-nums">
          <span className="font-medium">{used}</span>
          <span className="text-foreground/50"> / {total} attribuées</span>
          {note && <span className="text-foreground/40"> · {note}</span>}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        role="meter"
        aria-label={`${label} : ${used} sur ${total}`}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface HBarItem {
  label: string;
  value: number;
  /** Texte affiché après la valeur (ex. « 45 % des licences ») */
  note?: string;
}

/**
 * Barres horizontales, une seule série (une seule teinte), triées par l'appelant.
 * Valeur à l'extrémité de la barre, info-bulle au survol / focus clavier.
 */
export function HBarChart({ items, ariaLabel, max }: { items: HBarItem[]; ariaLabel: string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="text-sm text-foreground/40 py-4">Aucune donnée sur la période.</p>;
  }
  return (
    <ul className="space-y-1" aria-label={ariaLabel}>
      {items.map((i) => {
        const pct = top > 0 ? (i.value / top) * 100 : 0;
        const desc = `${i.label} : ${i.value}${i.note ? ` (${i.note})` : ""}`;
        return (
          <li
            key={i.label}
            tabIndex={0}
            aria-label={desc}
            className="group relative grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 rounded px-1 py-1 outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="text-xs text-foreground/70 truncate" title={i.label}>{i.label}</span>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <div
                  className={`h-4 rounded-r ${SERIES_1}`}
                  style={{ width: `${Math.max(pct, i.value > 0 ? 1.5 : 0)}%` }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums w-10 text-right shrink-0">{i.value}</span>
            </div>
            {/* Info-bulle */}
            <span
              role="tooltip"
              className="pointer-events-none absolute right-12 -top-7 z-10 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
            >
              <span className="font-medium">{i.label}</span> · {i.value}
              {i.note && <span className="text-foreground/50"> · {i.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Une quantité répartie en deux parts (ex. tâches lancées par l'utilisateur / planifiées). */
export function SplitBar({
  a, b, ariaLabel,
}: {
  a: { label: string; value: number };
  b: { label: string; value: number };
  ariaLabel: string;
}) {
  const total = a.value + b.value;
  const pa = total > 0 ? Math.round((a.value / total) * 100) : 0;
  const pb = total > 0 ? 100 - pa : 0;
  return (
    <div className="space-y-2" role="img" aria-label={`${ariaLabel} : ${a.label} ${a.value} (${pa} %), ${b.label} ${b.value} (${pb} %)`}>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
        {a.value > 0 && <div className={`${SERIES_1} h-full`} style={{ width: `${pa}%` }} title={`${a.label} : ${a.value} (${pa} %)`} />}
        {b.value > 0 && <div className={`${SERIES_2} h-full`} style={{ width: `${pb}%` }} title={`${b.label} : ${b.value} (${pb} %)`} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${SERIES_1}`} aria-hidden />
          {a.label} <span className="font-medium tabular-nums">{a.value}</span>
          <span className="text-foreground/50 tabular-nums">({pa} %)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${SERIES_2}`} aria-hidden />
          {b.label} <span className="font-medium tabular-nums">{b.value}</span>
          <span className="text-foreground/50 tabular-nums">({pb} %)</span>
        </span>
      </div>
    </div>
  );
}
