"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useCallback } from "react";
import { Settings, Shield, Users2, KeyRound, Plus, Trash2, RotateCcw, Download, Upload, History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminSettings, exportSettingsToFile, parseImportedSettings, type AdminSettings } from "@/lib/admin-settings";
import { apiFetch } from "@/lib/api";
import { ROOM_KEYWORDS as DEFAULT_ROOM_KEYWORDS, EQUIPMENT_KEYWORDS as DEFAULT_EQUIPMENT_KEYWORDS } from "@/lib/account-types";

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[#01031B]/50 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#D8346E] focus:ring-offset-2 ${
          value ? "bg-[#D8346E]" : "bg-[#01031B]/20"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function PatternEditor({
  title,
  description,
  defaults,
  values,
  onChange,
}: {
  title: string;
  description: string;
  defaults: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  return (
    <div>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-xs text-[#01031B]/50 mb-3">{description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {defaults.map((kw) => (
          <Badge key={kw} variant="secondary" className="text-xs opacity-50">{kw}</Badge>
        ))}
        {values.map((kw) => (
          <Badge key={kw} variant="outline" className="text-xs flex items-center gap-1">
            {kw}
            <button
              type="button"
              className="ml-1 text-red-500 hover:text-red-700"
              onClick={() => onChange(values.filter((v) => v !== kw))}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Nouveau mot-clé..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!input.trim()}>
          <Plus className="h-3 w-3 mr-1" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { settings, updateSettings, resetSettings, loaded } = useAdminSettings();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // Wrapper: met à jour les settings ET journalise dans l'audit
  const update = useCallback((updates: Partial<AdminSettings>) => {
    const s = settings as unknown as Record<string, unknown>;
    const before = Object.fromEntries(Object.keys(updates).map((k) => [k, s[k]]));
    updateSettings(updates);
    apiFetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payloadBefore: before, payloadAfter: updates }),
    }).catch(() => {}); // fire-and-forget, non bloquant
  }, [settings, updateSettings]);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    setImportSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const imported = parseImportedSettings(parsed);
        if (!imported) {
          setImportError("Fichier invalide — impossible de lire les paramètres.");
          return;
        }
        updateSettings(imported);
        setImportSuccess(true);
      } catch {
        setImportError("Fichier JSON invalide.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  if (!loaded) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Administration</h2>
        <p className="text-sm text-[#01031B]/50">Chargement des paramètres...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Administration</h2>
          <p className="text-sm text-[#01031B]/50 mt-0.5">
            Paramètres locaux de l&apos;interface — stockés dans le navigateur
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetSettings}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Réinitialiser
        </Button>
      </div>

      {/* Contrôle d'accès aux actions */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#D8346E]" />
          Contrôle des actions sensibles
        </h3>
        <p className="text-xs text-[#01031B]/50 mb-4">
          Masquer certains boutons d&apos;action pour limiter les risques d&apos;erreur.
          Ces paramètres n&apos;affectent que votre navigateur.
        </p>
        <div className="divide-y">
          <Toggle
            label="Masquer la création de groupes"
            description="Cache le bouton « Nouveau groupe » dans la liste des groupes."
            value={settings.hideGroupCreation}
            onChange={(v) => update({ hideGroupCreation: v })}
          />
          <Toggle
            label="Masquer la suppression de membres"
            description="Cache les boutons de retrait de membre/owner dans le détail d'un groupe."
            value={settings.hideGroupDeletion}
            onChange={(v) => update({ hideGroupDeletion: v })}
          />
          <Toggle
            label="Masquer l'ajout de membre/owner"
            description="Cache le bouton « Ajouter » dans le détail des groupes."
            value={settings.hideMemberAdd}
            onChange={(v) => update({ hideMemberAdd: v })}
          />
          <Toggle
            label="Masquer la réinitialisation de mot de passe"
            description="Cache le bouton « Réinit. MDP » dans la fiche utilisateur."
            value={settings.hidePasswordReset}
            onChange={(v) => update({ hidePasswordReset: v })}
          />
          <Toggle
            label="Afficher le bouton « Nouvel utilisateur »"
            description="Affiche un bouton dans l'onglet Utilisateurs qui ouvre le portail Entra pour créer un compte."
            value={settings.showAddUser}
            onChange={(v) => update({ showAddUser: v })}
          />
          <Toggle
            label="Afficher la suppression de compte"
            description="Affiche un bouton dans la fiche utilisateur pour ouvrir le portail Entra et supprimer le compte."
            value={settings.showDeleteUser}
            onChange={(v) => update({ showDeleteUser: v })}
          />
          <Toggle
            label="Afficher désactiver / réactiver un compte"
            description="Affiche un bouton dans la fiche utilisateur pour désactiver ou réactiver le compte Azure AD."
            value={settings.showDisableUser}
            onChange={(v) => update({ showDisableUser: v })}
          />
          <Toggle
            label="Afficher l'onglet Rôles AD"
            description="Affiche l'onglet « Rôles AD » dans la fiche utilisateur pour attribuer ou retirer des rôles Azure AD."
            value={settings.showUserRoles}
            onChange={(v) => update({ showUserRoles: v })}
          />
        </div>
      </Card>

      {/* Détection des types de comptes */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Users2 className="h-4 w-4 text-[#D8346E]" />
          Détection des types de comptes
        </h3>
        <p className="text-xs text-[#01031B]/50 mb-5">
          Mots-clés utilisés pour identifier automatiquement les salles et équipements.
          Les mots-clés grisés sont les valeurs par défaut (non modifiables ici).
          Ajoutez des mots-clés spécifiques à votre organisation.
        </p>
        <div className="space-y-6">
          <PatternEditor
            title="Mots-clés — Salles"
            description="Si l'UPN ou le nom d'affichage contient l'un de ces mots, le compte est classé comme « Salle »."
            defaults={DEFAULT_ROOM_KEYWORDS}
            values={settings.customRoomPatterns}
            onChange={(v) => update({ customRoomPatterns: v })}
          />
          <PatternEditor
            title="Mots-clés — Équipements"
            description="Si l'UPN ou le nom d'affichage contient l'un de ces mots, le compte est classé comme « Équipement »."
            defaults={DEFAULT_EQUIPMENT_KEYWORDS}
            values={settings.customEquipmentPatterns}
            onChange={(v) => update({ customEquipmentPatterns: v })}
          />
        </div>
      </Card>

      {/* Sauvegarde des paramètres */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#D8346E]" />
          Sauvegarde des paramètres
        </h3>
        <p className="text-xs text-[#01031B]/50 mb-4">
          Exportez ou importez tous les paramètres locaux de l&apos;interface (actions sensibles, mots-clés de détection).
          La configuration SSO (variables d&apos;environnement Azure AD) n&apos;est pas incluse dans cet export.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportSettingsToFile(settings)}
          >
            <Download className="h-3 w-3 mr-1" />
            Exporter JSON
          </Button>
          <label className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
            <Upload className="h-3 w-3" />
            Importer JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
        </div>
        {importError && (
          <p className="text-xs text-red-600 mt-3">{importError}</p>
        )}
        {importSuccess && (
          <p className="text-xs text-green-600 mt-3">Paramètres importés avec succès.</p>
        )}
      </Card>

      {/* Rétention historique */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <History className="h-4 w-4 text-[#D8346E]" />
          Historique des modifications
        </h3>
        <p className="text-xs text-[#01031B]/50 mb-4">
          Nombre de jours d&apos;historique affiché dans l&apos;onglet Historique. Ne supprime pas les données — filtre uniquement l&apos;affichage.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Rétention</span>
          <Select
            value={String(settings.auditRetentionDays)}
            onValueChange={(v) => update({ auditRetentionDays: parseInt(v ?? "90") })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="60">60 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
              <SelectItem value="180">180 jours</SelectItem>
              <SelectItem value="365">365 jours</SelectItem>
              <SelectItem value="0">Illimité</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Infos version */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#D8346E]" />
          Version
        </h3>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm font-mono">v1.12.0</Badge>
          <p className="text-xs text-[#01031B]/50">OneRing Admin — M365 Administrator</p>
        </div>
      </Card>
    </div>
  );
}
