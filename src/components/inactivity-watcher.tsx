"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

interface Props {
  /** Délai d'inactivité en millisecondes avant déconnexion (défaut : 10 min) */
  timeoutMs?: number;
}

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "scroll", "touchstart", "pointerdown",
] as const;

/**
 * Composant invisible qui surveille l'activité de l'utilisateur.
 * Déconnecte automatiquement après `timeoutMs` ms d'inactivité.
 */
export function InactivityWatcher({ timeoutMs = 10 * 60 * 1000 }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        signOut({ callbackUrl: "/auth/signin" });
      }, timeoutMs);
    };

    // Démarrer le timer au montage
    reset();

    // Réinitialiser à chaque interaction
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [timeoutMs]);

  return null;
}
