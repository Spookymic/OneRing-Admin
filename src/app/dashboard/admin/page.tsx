"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useCallback } from "react";
import { Settings, Shield, Users2, KeyRound, Plus, Trash2, RotateCcw, Download, Upload, History, Server, Smartphone } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
        <p className="text-xs text-foreground/50 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          value ? "bg-primary" : "bg-foreground/20"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
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
      <p className="text-xs text-foreground/50 mb-3">{description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {defaults.map((kw) => (
          <Badge key={kw} variant="secondary" className="text-xs opacity-50">{kw}</Badge>
        ))}
        {values.map((kw) => (
          <Badge key={kw} variant="outline" className="text-xs flex items-center gap-1">
            {kw}
            <button
              type="button"
              className="ml-1 text-red-500 hover:text-red-700 dark:text-red-300"
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

  const { data: bridgeHealth } = useQuery<{ reachable: boolean; org?: string; exoConnected?: boolean }>({
    queryKey: ["exchange-health"],
    queryFn: () => apiFetch("/api/exchange/health"),
    staleTime: 60 * 1000,
  });

  type Cred = { appName: string; type: "secret" | "certificate"; name: string | null; endDateTime: string; daysLeft: number };
  const { data: credData } = useQuery<{ supported: boolean; credentials: Cred[] }>({
    queryKey: ["expiring-credentials"],
    queryFn: () => apiFetch("/api/security/expiring-credentials"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: sso } = useQuery<{ tenantId: string | null; clientId: string | null; nextAuthUrl: string | null; redirectUri: string | null }>({
    queryKey: ["sso-config"],
    queryFn: () => apiFetch("/api/config/sso"),
    staleTime: 60 * 60 * 1000,
  });

  const { data: sessionData } = useSession();
  const isSSO = sessionData?.role === "graph";
  const { data: localAdmins, refetch: refetchLocalAdmin } = useQuery<{ admins: { id: string; username: string; createdAt: string; totpEnabled: boolean }[] }>({
    queryKey: ["local-admin"],
    queryFn: () => apiFetch("/api/admin/local-admin"),
    staleTime: 5 * 60 * 1000,
  });
  const admins = localAdmins?.admins ?? [];
  const [laUser, setLaUser] = useState("");
  const [laPass, setLaPass] = useState("");
  const [laMsg, setLaMsg] = useState("");
  const [laBusy, setLaBusy] = useState(false);
  async function saveLocalAdmin() {
    setLaBusy(true);
    setLaMsg("");
    try {
      await apiFetch("/api/admin/local-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: laUser, password: laPass }),
      });
      setLaMsg("Compte enregistré.");
      setLaUser("");
      setLaPass("");
      refetchLocalAdmin();
    } catch (e: any) {
      setLaMsg(e.message);
    } finally {
      setLaBusy(false);
    }
  }
  async function deleteLocalAdmin(id: string, username: string) {
    if (!window.confirm(`Supprimer le compte local « ${username} » ?`)) return;
    try {
      await apiFetch(`/api/admin/local-admin?id=${id}`, { method: "DELETE" });
      refetchLocalAdmin();
    } catch (e: any) {
      setLaMsg(e.message);
    }
  }
  async function deleteAllLocalAdmins() {
    if (!window.confirm("Supprimer TOUS les comptes admin locaux ?")) return;
    try {
      await apiFetch(`/api/admin/local-admin?all=true`, { method: "DELETE" });
      refetchLocalAdmin();
    } catch (e: any) {
      setLaMsg(e.message);
    }
  }

  // 2FA (TOTP) self-service pour l'admin local connecté
  const isLocal = sessionData?.role === "local";
  const { data: totpStatus, refetch: refetchTotp } = useQuery<{ enabled: boolean }>({
    queryKey: ["local-totp"],
    queryFn: () => apiFetch("/api/admin/local-admin/totp"),
    enabled: isLocal,
  });
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);

  async function startTotpSetup() {
    setTotpBusy(true); setTotpMsg("");
    try {
      const res = await apiFetch<{ qrDataUrl: string; secret: string }>("/api/admin/local-admin/totp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      setTotpSetup(res);
    } catch (e: any) { setTotpMsg(e.message); }
    finally { setTotpBusy(false); }
  }
  async function confirmTotp(action: "enable" | "disable") {
    setTotpBusy(true); setTotpMsg("");
    try {
      await apiFetch("/api/admin/local-admin/totp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code: totpCode }),
      });
      setTotpSetup(null); setTotpCode("");
      setTotpMsg(action === "enable" ? "2FA activée." : "2FA désactivée.");
      refetchTotp();
    } catch (e: any) { setTotpMsg(e.message); }
    finally { setTotpBusy(false); }
  }

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
        <p className="text-sm text-foreground/50">Chargement des paramètres...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Administration</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
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
          <Shield className="h-4 w-4 text-primary" />
          Contrôle des actions sensibles
        </h3>
        <p className="text-xs text-foreground/50 mb-4">
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
          <Users2 className="h-4 w-4 text-primary" />
          Détection des types de comptes
        </h3>
        <p className="text-xs text-foreground/50 mb-5">
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
          <Settings className="h-4 w-4 text-primary" />
          Sauvegarde des paramètres
        </h3>
        <p className="text-xs text-foreground/50 mb-4">
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
          <p className="text-xs text-green-600 dark:text-green-400 mt-3">Paramètres importés avec succès.</p>
        )}
      </Card>

      {/* Rétention historique */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Historique des modifications
        </h3>
        <p className="text-xs text-foreground/50 mb-4">
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

      {/* Configuration SSO Azure AD (lecture seule) */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Configuration SSO (Azure AD)
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-foreground/50 w-40 shrink-0">Tenant ID</span>
            <span className="font-mono text-xs break-all">{sso?.tenantId ?? "—"}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-foreground/50 w-40 shrink-0">Client ID</span>
            <span className="font-mono text-xs break-all">{sso?.clientId ?? "—"}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-foreground/50 w-40 shrink-0">URI de redirection</span>
            <span className="font-mono text-xs break-all">{sso?.redirectUri ?? "—"}</span>
          </div>
          <p className="text-xs text-foreground/40 pt-1">
            L&apos;URI de redirection doit être déclarée dans l&apos;app registration Azure AD. Le client secret
            se configure via les variables d&apos;environnement (jamais affiché ici).
          </p>
        </div>
      </Card>

      {/* Compte administrateur local */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          Compte administrateur local
        </h3>
        <p className="text-xs text-foreground/50 mb-3">
          Accès de secours limité à l&apos;Administration (aucun accès Graph / Microsoft 365).
        </p>

        {admins.length > 0 && (
          <div className="mb-4 space-y-1">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{a.username}</p>
                    {a.totpEnabled && <Badge variant="secondary" className="text-xs shrink-0">2FA</Badge>}
                  </div>
                  <p className="text-xs text-foreground/40">
                    créé le {format(new Date(a.createdAt), "dd MMM yyyy", { locale: fr })}
                  </p>
                </div>
                {isSSO && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 dark:text-red-300 h-7 px-2"
                    onClick={() => deleteLocalAdmin(a.id, a.username)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {isSSO && admins.length > 1 && (
              <button
                onClick={deleteAllLocalAdmins}
                className="text-xs text-foreground/40 hover:text-red-600 underline underline-offset-2 pt-1"
              >
                Supprimer tous les comptes
              </button>
            )}
          </div>
        )}

        {isSSO ? (
          <div className="space-y-2 max-w-sm">
            <p className="text-xs font-medium text-foreground/60">Ajouter / réinitialiser un compte</p>
            <Input placeholder="Identifiant" value={laUser} onChange={(e) => setLaUser(e.target.value)} />
            <Input
              type="password"
              placeholder="Mot de passe (≥ 8 caractères)"
              value={laPass}
              onChange={(e) => setLaPass(e.target.value)}
            />
            {laMsg && <p className="text-xs text-foreground/60">{laMsg}</p>}
            <Button size="sm" onClick={saveLocalAdmin} disabled={laBusy || laUser.length < 3 || laPass.length < 8}>
              {laBusy ? "Enregistrement…" : "Enregistrer le compte"}
            </Button>
            <p className="text-xs text-foreground/40">
              Un identifiant existant voit son mot de passe réinitialisé ; sinon un nouveau compte est créé.
            </p>
          </div>
        ) : (
          <p className="text-xs text-foreground/40">
            Ces comptes se configurent via un administrateur connecté en SSO Microsoft.
          </p>
        )}
      </Card>

      {/* 2FA (TOTP) — self-service admin local connecté */}
      {isLocal && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Double authentification (2FA)
          </h3>
          <p className="text-xs text-foreground/50 mb-4">
            Ajoutez un code à usage unique (TOTP) à votre connexion locale, via une application
            comme Microsoft Authenticator, Google Authenticator ou Authy.
          </p>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">Statut :</span>
            <Badge variant={totpStatus?.enabled ? "default" : "secondary"} className="text-xs">
              {totpStatus?.enabled ? "Activée" : "Désactivée"}
            </Badge>
          </div>

          {/* Activation : étape QR + code de confirmation */}
          {!totpStatus?.enabled && !totpSetup && (
            <Button size="sm" onClick={startTotpSetup} disabled={totpBusy}>
              {totpBusy ? "…" : "Activer la 2FA"}
            </Button>
          )}

          {!totpStatus?.enabled && totpSetup && (
            <div className="space-y-3 max-w-sm">
              <p className="text-xs text-foreground/60">
                1. Scannez ce QR code dans votre application d&apos;authentification.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpSetup.qrDataUrl} alt="QR code 2FA" className="h-40 w-40 rounded-md border bg-white p-1" />
              <p className="text-xs text-foreground/40 break-all">
                Clé manuelle : <span className="font-mono">{totpSetup.secret}</span>
              </p>
              <p className="text-xs text-foreground/60">2. Saisissez le code affiché pour confirmer.</p>
              <Input
                inputMode="numeric"
                placeholder="Code à 6 chiffres"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="max-w-[10rem]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => confirmTotp("enable")} disabled={totpBusy || totpCode.length < 6}>
                  {totpBusy ? "…" : "Confirmer et activer"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setTotpSetup(null); setTotpCode(""); setTotpMsg(""); }}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Désactivation : requiert un code valide */}
          {totpStatus?.enabled && (
            <div className="space-y-2 max-w-sm">
              <p className="text-xs text-foreground/60">
                Pour désactiver, saisissez un code de votre application d&apos;authentification.
              </p>
              <Input
                inputMode="numeric"
                placeholder="Code à 6 chiffres"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="max-w-[10rem]"
              />
              <Button size="sm" variant="outline"
                className="text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40"
                onClick={() => confirmTotp("disable")} disabled={totpBusy || totpCode.length < 6}>
                {totpBusy ? "…" : "Désactiver la 2FA"}
              </Button>
            </div>
          )}

          {totpMsg && <p className="text-xs text-foreground/60 mt-3">{totpMsg}</p>}
        </Card>
      )}

      {/* Santé du pont Exchange */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          Pont Exchange
        </h3>
        {bridgeHealth ? (
          bridgeHealth.reachable ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Joignable
              </span>
              {bridgeHealth.org && <span className="text-xs text-foreground/50">{bridgeHealth.org}</span>}
              <Badge variant={bridgeHealth.exoConnected ? "default" : "secondary"} className="text-xs">
                {bridgeHealth.exoConnected ? "Connecté à Exchange" : "Non connecté (connexion à la 1ʳᵉ requête)"}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-red-600">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Injoignable — vérifier le conteneur exo-bridge
            </div>
          )
        ) : (
          <p className="text-xs text-foreground/40">Vérification…</p>
        )}
      </Card>

      {/* Certificats & secrets d'applications */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Certificats & secrets d&apos;applications (expiration ≤ 30 j)
        </h3>
        {credData?.supported === false ? (
          <p className="text-xs text-foreground/40">
            Indisponible — droit de lecture des applications manquant.
          </p>
        ) : !credData ? (
          <p className="text-xs text-foreground/40">Vérification…</p>
        ) : credData.credentials.length === 0 ? (
          <p className="text-xs text-foreground/50">Aucun certificat/secret n&apos;expire dans les 30 prochains jours.</p>
        ) : (
          <div className="space-y-1">
            {credData.credentials.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 py-1.5 gap-2">
                <span className="truncate">
                  <span className="font-medium">{c.appName}</span> — {c.type === "secret" ? "secret" : "certificat"}
                  {c.name ? ` « ${c.name} »` : ""}
                </span>
                <span className={`shrink-0 font-medium ${c.daysLeft < 0 ? "text-red-600" : c.daysLeft <= 7 ? "text-amber-600" : "text-foreground/60"}`}>
                  {c.daysLeft < 0
                    ? `expiré (${format(new Date(c.endDateTime), "dd/MM/yyyy", { locale: fr })})`
                    : `${c.daysLeft} j (${format(new Date(c.endDateTime), "dd/MM/yyyy", { locale: fr })})`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Infos version */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Version
        </h3>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm font-mono">v1.22.0</Badge>
          <p className="text-xs text-foreground/50">OneRing Admin — M365 Administrator</p>
        </div>
      </Card>
    </div>
  );
}
