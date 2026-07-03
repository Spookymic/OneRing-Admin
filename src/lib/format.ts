/** Formate un nombre d'octets en unité lisible (o, Ko, Mo, Go, To…). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To", "Po"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Pourcentage d'occupation borné [0,100] ; null si le quota est inconnu/0. */
export function usagePercent(used: number, allocated: number): number | null {
  if (!allocated || allocated <= 0) return null;
  return Math.min(100, Math.round((used / allocated) * 100));
}
