// Thèmes de couleur d'accent — override du token --primary (et dérivés) au runtime.

export interface AccentPreset {
  id: string;
  label: string;
  color: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "rose", label: "Rose", color: "#d8346e" },
  { id: "blue", label: "Bleu", color: "#2563eb" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "green", label: "Vert", color: "#16a34a" },
  { id: "amber", label: "Ambre", color: "#d97706" },
  { id: "slate", label: "Ardoise", color: "#334155" },
];

const KEY = "onering-accent";

/** Applique la couleur d'accent sur les tokens pilotant tout le thème. */
export function applyAccent(id: string) {
  const preset = ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
  const root = document.documentElement.style;
  for (const v of ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring", "--chart-1"]) {
    root.setProperty(v, preset.color);
  }
}

export function getSavedAccent(): string {
  try {
    return localStorage.getItem(KEY) ?? "rose";
  } catch {
    return "rose";
  }
}

export function saveAccent(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  applyAccent(id);
}
