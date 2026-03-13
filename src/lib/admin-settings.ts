"use client";

import { useState, useEffect, useCallback } from "react";

export interface AdminSettings {
  /** Masquer le bouton "Nouveau groupe" */
  hideGroupCreation: boolean;
  /** Masquer les boutons de suppression dans les groupes */
  hideGroupDeletion: boolean;
  /** Masquer le bouton "Réinit. MDP" dans la fiche utilisateur */
  hidePasswordReset: boolean;
  /** Masquer le bouton d'ajout de membre/owner dans les groupes */
  hideMemberAdd: boolean;
  /** Afficher le bouton "Nouvel utilisateur" (masqué par défaut) */
  showAddUser: boolean;
  /** Afficher le bouton de suppression de compte utilisateur (masqué par défaut) */
  showDeleteUser: boolean;
  /** Afficher le bouton désactiver/réactiver un compte (masqué par défaut) */
  showDisableUser: boolean;
  /** Afficher l'onglet Rôles AD dans la fiche utilisateur (masqué par défaut) */
  showUserRoles: boolean;
  /** Patterns supplémentaires (en minuscules) pour détecter les salles */
  customRoomPatterns: string[];
  /** Patterns supplémentaires (en minuscules) pour détecter les équipements */
  customEquipmentPatterns: string[];
  /** Rétention de l'historique en jours (0 = illimité) */
  auditRetentionDays: number;
}

export const ADMIN_SETTINGS_DEFAULTS: AdminSettings = {
  hideGroupCreation: false,
  hideGroupDeletion: false,
  hidePasswordReset: false,
  hideMemberAdd: false,
  showAddUser: false,
  showDeleteUser: false,
  showDisableUser: false,
  showUserRoles: false,
  customRoomPatterns: [],
  customEquipmentPatterns: [],
  auditRetentionDays: 90,
};

const STORAGE_KEY = "onering-admin-settings";

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>(ADMIN_SETTINGS_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...ADMIN_SETTINGS_DEFAULTS, ...JSON.parse(raw) });
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const updateSettings = useCallback((updates: Partial<AdminSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(ADMIN_SETTINGS_DEFAULTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { settings, updateSettings, resetSettings, loaded };
}

/** Télécharge les paramètres actuels sous forme de fichier JSON */
export function exportSettingsToFile(settings: AdminSettings): void {
  const json = JSON.stringify(settings, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `onering-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse et valide un fichier importé — retourne les settings fusionnés ou null si invalide */
export function parseImportedSettings(raw: unknown): AdminSettings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  try {
    return { ...ADMIN_SETTINGS_DEFAULTS, ...(raw as Partial<AdminSettings>) };
  } catch {
    return null;
  }
}

/** Version synchrone pour les composants serveur ou hors hook (client uniquement) */
export function getAdminSettings(): AdminSettings {
  if (typeof window === "undefined") return ADMIN_SETTINGS_DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...ADMIN_SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return ADMIN_SETTINGS_DEFAULTS;
}
