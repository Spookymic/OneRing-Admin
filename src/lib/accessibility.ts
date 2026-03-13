"use client";

import { useState, useEffect, useCallback } from "react";

export type A11yMode =
  | "normal"
  | "monochrome"
  | "high-contrast"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia";

const A11Y_KEY = "onering-a11y-mode";

const A11Y_CLASSES: Record<A11yMode, string | null> = {
  normal: null,
  monochrome: "a11y-monochrome",
  "high-contrast": "a11y-high-contrast",
  protanopia: "a11y-protanopia",
  deuteranopia: "a11y-deuteranopia",
  tritanopia: "a11y-tritanopia",
};

export const A11Y_LABELS: Record<A11yMode, string> = {
  normal: "Normal",
  monochrome: "Monochrome",
  "high-contrast": "Contraste élevé",
  protanopia: "Protanopie (daltonisme rouge)",
  deuteranopia: "Deutéranopie (daltonisme vert)",
  tritanopia: "Tritanopie (daltonisme bleu-jaune)",
};

export const A11Y_MODES = Object.keys(A11Y_LABELS) as A11yMode[];

function applyA11yMode(mode: A11yMode) {
  const body = document.body;
  (Object.values(A11Y_CLASSES).filter(Boolean) as string[]).forEach((cls) =>
    body.classList.remove(cls)
  );
  const cls = A11Y_CLASSES[mode];
  if (cls) body.classList.add(cls);
}

export function useAccessibility() {
  const [mode, setMode] = useState<A11yMode>("normal");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(A11Y_KEY) as A11yMode | null;
      if (saved && saved in A11Y_CLASSES) {
        setMode(saved);
        applyA11yMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setA11yMode = useCallback((newMode: A11yMode) => {
    setMode(newMode);
    applyA11yMode(newMode);
    try {
      if (newMode === "normal") {
        localStorage.removeItem(A11Y_KEY);
      } else {
        localStorage.setItem(A11Y_KEY, newMode);
      }
    } catch {
      // ignore
    }
  }, []);

  return { mode, setA11yMode };
}
