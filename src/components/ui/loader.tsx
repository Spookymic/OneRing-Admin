"use client";

/**
 * Chenillard de chargement — points qui « courent » dans la couleur de marque.
 */
export function Loader({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className ?? ""}`}>
      <style>{`@keyframes onering-chase{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}`}</style>
      <div className="flex gap-1.5" role="status" aria-label={label ?? "Chargement"}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-[#D8346E]"
            style={{ animation: "onering-chase 1s ease-in-out infinite", animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      {label && <p className="text-sm text-[#01031B]/50">{label}</p>}
    </div>
  );
}
