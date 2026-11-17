"use client";

/** Progression de la première analyse des délégations des boîtes partagées (index du pont Exchange). */
export function IndexProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Analyse des boîtes partagées</span>
        <span className="text-foreground/50 tabular-nums">
          {total > 0 ? `${done} / ${total}` : "préparation..."}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-foreground/40">
        Exchange impose de lire chaque boîte une à une. Cette analyse n&apos;a lieu qu&apos;une fois :
        les consultations suivantes (tous utilisateurs) sont instantanées pendant 30 minutes.
      </p>
    </div>
  );
}
