"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2, UserPlus, Shield, Users, KeyRound, UserX, Wifi,
  CheckCircle, XCircle, AlertCircle, Crown, BellOff, PowerOff, Power, Download, UserMinus,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { M365User, M365UserGroup, SignInLog, MailboxSettings, AuthMethodsSummary } from "@/services/graph/users";
import type { M365Group, GroupType } from "@/services/graph/groups";
import type { SubscribedSku } from "@/services/graph/licenses";
import type { DirectoryRole } from "@/services/graph/roles";
import { getSkuFriendlyName } from "@/lib/license-names";
import { apiFetch } from "@/lib/api";
import { csvCell } from "@/lib/csv";
import { useAdminSettings } from "@/lib/admin-settings";
import { OffboardingDialog } from "@/components/users/offboarding-dialog";
import { ObjectInfo } from "@/components/common/object-info";
import { Loader } from "@/components/ui/loader";

interface Props {
  user: M365User;
  open: boolean;
  onClose: () => void;
  onResetPassword?: () => void;
  initialTab?: Tab;
}

type Tab = "groups" | "licenses" | "signins" | "roles" | "absence";

function getGroupTypeLabel(group: M365UserGroup) {
  if (group.groupTypes?.includes("Unified")) return { label: "M365", variant: "default" as const };
  if (group.mailEnabled && !group.securityEnabled) return { label: "Distribution", variant: "secondary" as const };
  return { label: "Sécurité", variant: "outline" as const };
}

function PermissionWarning({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300 mb-1">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Permission manquante
      </div>
      <p className="text-amber-600 text-xs">{message}</p>
    </div>
  );
}

export function UserGroupsSheet({ user, open, onClose, onResetPassword, initialTab }: Props) {
  const { toast } = useToast();
  const { settings } = useAdminSettings();
  const queryClient = useQueryClient();
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab ?? "groups");

  useEffect(() => {
    if (open) setTab(initialTab ?? "groups");
  }, [open, initialTab]);

  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<(M365Group & { type: GroupType }) | null>(null);
  const [role, setRole] = useState<"member" | "owner">("member");
  const [addOpen, setAddOpen] = useState(false);

  // Confirmation en ligne pour désactiver/réactiver
  const [confirmDisable, setConfirmDisable] = useState(false);

  // ── Groupes ──────────────────────────────────────────────────────
  const { data: userGroups, isLoading: groupsLoading } = useQuery<M365UserGroup[]>({
    queryKey: ["user-groups", user.id],
    queryFn: () => apiFetch<M365UserGroup[]>(`/api/users/${user.id}/groups`),
    enabled: open,
  });

  const { data: allGroups } = useQuery<(M365Group & { type: GroupType })[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch<(M365Group & { type: GroupType })[]>("/api/groups"),
    enabled: addOpen,
  });

  // ── Statut MFA (méthodes d'authentification) ──────────────────────
  const { data: authMethods } = useQuery<AuthMethodsSummary>({
    queryKey: ["user-auth-methods", user.id],
    queryFn: () => apiFetch<AuthMethodsSummary>(`/api/users/${user.id}/auth-methods`),
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const userGroupIds = new Set(userGroups?.map((g) => g.id) ?? []);

  const availableGroups = allGroups
    ?.filter(
      (g) =>
        !userGroupIds.has(g.id) &&
        (g.displayName.toLowerCase().includes(search.toLowerCase()) ||
          (g.mail ?? "").toLowerCase().includes(search.toLowerCase()))
    )
    .slice(0, 8);

  const removeFromGroup = useMutation({
    mutationFn: (groupId: string) =>
      apiFetch(`/api/users/${user.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, action: "remove", role: "member" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-groups", user.id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Retiré du groupe" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const addToGroup = useMutation({
    mutationFn: () =>
      apiFetch(`/api/users/${user.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroup!.id, action: "add", role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-groups", user.id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Ajouté au groupe", description: `${user.displayName} → ${selectedGroup?.displayName}` });
      setSelectedGroup(null);
      setSearch("");
      setAddOpen(false);
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  // ── Licences ─────────────────────────────────────────────────────
  const { data: skus, isLoading: skusLoading } = useQuery<SubscribedSku[]>({
    queryKey: ["skus"],
    queryFn: () => apiFetch<SubscribedSku[]>("/api/licenses"),
    enabled: open && tab === "licenses",
  });

  const licenseMutation = useMutation({
    mutationFn: ({
      skuId, skuName, action,
    }: { skuId: string; skuName: string; action: "assign" | "remove" }) =>
      apiFetch(`/api/licenses/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuId, skuName, action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Licence mise à jour" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  // ── Connexions ───────────────────────────────────────────────────
  const {
    data: signInLogs,
    isLoading: signInsLoading,
    error: signInsError,
  } = useQuery<SignInLog[]>({
    queryKey: ["user-signins", user.id],
    queryFn: () => apiFetch<SignInLog[]>(`/api/users/${user.id}/signin-logs`),
    enabled: open && tab === "signins",
    retry: false,
  });

  // ── Rôles AD ─────────────────────────────────────────────────────
  const { data: allRoles, isLoading: allRolesLoading } = useQuery<DirectoryRole[]>({
    queryKey: ["directory-roles"],
    queryFn: () => apiFetch<DirectoryRole[]>("/api/roles"),
    enabled: open && tab === "roles",
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: userRoles,
    isLoading: userRolesLoading,
    error: rolesError,
  } = useQuery<DirectoryRole[]>({
    queryKey: ["user-roles", user.id],
    queryFn: () => apiFetch<DirectoryRole[]>(`/api/users/${user.id}/roles`),
    enabled: open && tab === "roles",
    retry: false,
  });

  const [roleSearch, setRoleSearch] = useState("");
  const [confirmRoleRemove, setConfirmRoleRemove] = useState<string | null>(null);

  const userRoleIds = new Set(userRoles?.map((r) => r.id) ?? []);

  const roleMutation = useMutation({
    mutationFn: ({ roleId, roleName, action }: { roleId: string; roleName: string; action: "assign" | "remove" }) =>
      apiFetch(`/api/users/${user.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, roleName, action }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles", user.id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: vars.action === "assign" ? "Rôle attribué" : "Rôle retiré" });
      setConfirmRoleRemove(null);
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  // ── Absence (OOO + Teams) ─────────────────────────────────────────
  const {
    data: mailboxSettings,
    isLoading: mailboxLoading,
    error: mailboxError,
    refetch: refetchMailbox,
  } = useQuery<MailboxSettings>({
    queryKey: ["user-mailbox", user.id],
    queryFn: () => apiFetch<MailboxSettings>(`/api/users/${user.id}/mailbox-settings`),
    enabled: open && tab === "absence",
    retry: false,
  });

  const [oooStatus, setOooStatus] = useState<"disabled" | "alwaysEnabled">("disabled");
  const [oooInternal, setOooInternal] = useState("");
  const [oooExternal, setOooExternal] = useState("");
  const [teamsMessage, setTeamsMessage] = useState("");
  const [teamsError, setTeamsError] = useState<string | null>(null);

  useEffect(() => {
    if (mailboxSettings?.automaticRepliesSetting) {
      const s = mailboxSettings.automaticRepliesSetting;
      setOooStatus(s.status === "disabled" ? "disabled" : "alwaysEnabled");
      setOooInternal(s.internalReplyMessage ?? "");
      setOooExternal(s.externalReplyMessage ?? "");
    }
  }, [mailboxSettings]);

  const saveOoo = useMutation({
    mutationFn: () =>
      apiFetch(`/api/users/${user.id}/mailbox-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetName: user.displayName,
          automaticRepliesSetting: {
            status: oooStatus,
            internalReplyMessage: oooInternal,
            externalReplyMessage: oooExternal,
            externalAudienceScope: oooStatus === "disabled" ? "none" : "all",
          },
        }),
      }),
    onSuccess: () => {
      refetchMailbox();
      toast({ title: "Réponse automatique mise à jour" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const saveTeams = useMutation({
    mutationFn: () =>
      apiFetch(`/api/users/${user.id}/teams-presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: teamsMessage, targetName: user.displayName }),
      }),
    onSuccess: () => {
      toast({ title: "Message Teams mis à jour" });
      setTeamsError(null);
    },
    onError: (err: any) => {
      setTeamsError(err.message ?? "Erreur");
      toast({ title: "Erreur Teams", description: err.message, variant: "destructive" });
    },
  });

  // ── Désactiver / Réactiver ────────────────────────────────────────
  const [currentEnabled, setCurrentEnabled] = useState(user.accountEnabled);

  useEffect(() => {
    setCurrentEnabled(user.accountEnabled);
    setConfirmDisable(false);
  }, [user.id, user.accountEnabled]);

  const toggleEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountEnabled: enabled }),
      }),
    onSuccess: (_, enabled) => {
      setCurrentEnabled(enabled);
      setConfirmDisable(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: enabled ? "Compte réactivé" : "Compte désactivé" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const userSkuIds = new Set(user.assignedLicenses.map((l) => l.skuId));

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-lg">{user.displayName}</SheetTitle>
          <SheetDescription className="text-xs">{user.userPrincipalName}</SheetDescription>
          <ObjectInfo
            id={user.id}
            type="user"
            createdDateTime={user.createdDateTime}
            onPremisesSyncEnabled={user.onPremisesSyncEnabled}
            open={open}
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {user.department && <Badge variant="secondary" className="text-xs">{user.department}</Badge>}
            {user.jobTitle && <Badge variant="outline" className="text-xs">{user.jobTitle}</Badge>}
            {user.officeLocation && <Badge variant="outline" className="text-xs">{user.officeLocation}</Badge>}
            {!currentEnabled && <Badge variant="destructive" className="text-xs">Désactivé</Badge>}
            {authMethods?.supported && (
              <span
                title={
                  authMethods.methods.length
                    ? "Méthodes : " + authMethods.methods.map((m) => m.label + (m.detail ? ` (${m.detail})` : "")).join(", ")
                    : "Aucune méthode d'authentification forte enregistrée"
                }
              >
                <Badge
                  variant={authMethods.mfaEnabled ? "default" : "destructive"}
                  className="text-xs gap-1"
                >
                  {authMethods.mfaEnabled
                    ? <ShieldCheck className="h-3 w-3" />
                    : <ShieldAlert className="h-3 w-3" />}
                  {authMethods.mfaEnabled ? "MFA actif" : "MFA absent"}
                </Badge>
              </span>
            )}
          </div>

          {/* Boutons d'action */}
          <div className="pt-2 flex flex-wrap gap-2">
            {!settings.hidePasswordReset && onResetPassword && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={onResetPassword}>
                <KeyRound className="h-3 w-3 mr-1" />
                Réinit. mot de passe
              </Button>
            )}
            {settings.showDisableUser && (
              confirmDisable ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-foreground/60">Confirmer ?</span>
                  <Button
                    size="sm"
                    variant={currentEnabled ? "destructive" : "default"}
                    className="text-xs h-7"
                    onClick={() => toggleEnabled.mutate(!currentEnabled)}
                    disabled={toggleEnabled.isPending}
                  >
                    {toggleEnabled.isPending ? "..." : "Oui"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setConfirmDisable(false)}>
                    Non
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className={`text-xs h-7 ${currentEnabled ? "text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40" : "text-green-600 dark:text-green-400 border-green-200 dark:border-green-900 hover:bg-green-50 dark:bg-green-950/40"}`}
                  onClick={() => setConfirmDisable(true)}
                >
                  {currentEnabled ? <PowerOff className="h-3 w-3 mr-1" /> : <Power className="h-3 w-3 mr-1" />}
                  {currentEnabled ? "Désactiver" : "Réactiver"}
                </Button>
              )
            )}
            {settings.showDeleteUser && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40"
                onClick={() =>
                  window.open(
                    `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${user.id}`,
                    "_blank"
                  )
                }
              >
                <UserX className="h-3 w-3 mr-1" />
                Supprimer
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40"
              onClick={() => setOffboardOpen(true)}
            >
              <UserMinus className="h-3 w-3 mr-1" />
              Offboarder
            </Button>
          </div>
          {offboardOpen && (
            <OffboardingDialog user={user} open={offboardOpen} onClose={() => setOffboardOpen(false)} />
          )}

          {/* Onglets */}
          <div className="flex gap-1 pt-2 overflow-x-auto pb-0.5 scrollbar-none">
            {(
              [
                { id: "groups" as Tab,  label: `Groupes (${userGroups?.length ?? 0})`, icon: <Users   className="h-3 w-3 inline mr-1" /> },
                { id: "licenses" as Tab, label: `Licences (${user.assignedLicenses.length})`, icon: <Shield className="h-3 w-3 inline mr-1" /> },
                { id: "signins" as Tab, label: "Connexions", icon: <Wifi    className="h-3 w-3 inline mr-1" /> },
                { id: "absence" as Tab, label: "Absence",    icon: <BellOff className="h-3 w-3 inline mr-1" /> },
                ...(settings.showUserRoles ? [{ id: "roles" as Tab, label: "Rôles AD", icon: <Crown className="h-3 w-3 inline mr-1" /> }] : []),
              ] as { id: Tab; label: string; icon: React.ReactNode }[]
            ).map(({ id: t, label, icon }) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors whitespace-nowrap ${
                  tab === t ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6">

          {/* ── Tab Groupes ── */}
          {tab === "groups" && (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Groupes ({userGroups?.length ?? 0})
                  </h3>
                  <Button size="sm" variant="outline" onClick={() => setAddOpen(!addOpen)}>
                    <UserPlus className="h-3 w-3 mr-1" />
                    Ajouter
                  </Button>
                </div>

                {groupsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : userGroups?.length === 0 ? (
                  <p className="text-sm text-foreground/40 text-center py-4">Aucun groupe</p>
                ) : (
                  <div className="space-y-1">
                    {userGroups?.map((group) => {
                      const typeInfo = getGroupTypeLabel(group);
                      return (
                        <div key={group.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant={typeInfo.variant} className="text-xs shrink-0">{typeInfo.label}</Badge>
                            <span className="truncate font-medium">{group.displayName}</span>
                          </div>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-500 hover:text-red-700 dark:text-red-300 shrink-0 h-7 w-7 p-0"
                            onClick={() => removeFromGroup.mutate(group.id)}
                            disabled={removeFromGroup.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {addOpen && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4" />
                      Ajouter à un groupe
                    </h3>
                    <div className="space-y-3">
                      <Input
                        placeholder="Rechercher un groupe..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setSelectedGroup(null); }}
                      />
                      {search && (
                        <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                          {availableGroups?.length === 0 ? (
                            <p className="text-sm text-foreground/40 text-center py-3">Aucun groupe disponible</p>
                          ) : (
                            availableGroups?.map((g) => (
                              <div
                                key={g.id}
                                className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
                                  selectedGroup?.id === g.id ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
                                }`}
                                onClick={() => setSelectedGroup(g)}
                              >
                                <div className="font-medium">{g.displayName}</div>
                                {g.mail && <div className="text-foreground/40 text-xs">{g.mail}</div>}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                      <Select value={role} onValueChange={(v) => setRole(v as "member" | "owner")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Membre</SelectItem>
                          <SelectItem value="owner">Owner (propriétaire)</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={() => addToGroup.mutate()} disabled={!selectedGroup || addToGroup.isPending}>
                          {addToGroup.isPending ? "Ajout..." : "Ajouter au groupe"}
                        </Button>
                        <Button variant="outline" onClick={() => { setAddOpen(false); setSearch(""); setSelectedGroup(null); }}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Tab Licences ── */}
          {tab === "licenses" && (
            <div>
              <h3 className="font-medium text-sm flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4" />
                Licences assignées
              </h3>
              {skusLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : skus && skus.length > 0 ? (
                <div className="space-y-2">
                  {skus.map((sku) => {
                    const assigned = userSkuIds.has(sku.skuId);
                    const name = getSkuFriendlyName(sku.skuPartNumber);
                    const total = sku.prepaidUnits.enabled;
                    const isFull = sku.consumedUnits >= total && total > 0 && !assigned;
                    return (
                      <div
                        key={sku.skuId}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${assigned ? "border-primary/30 bg-primary/5" : "border-border"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-foreground/40 mt-0.5">
                            {sku.consumedUnits}/{total} utilisées
                            {isFull && <span className="text-red-500 ml-2">— Complet</span>}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={assigned ? "destructive" : "outline"}
                          className="ml-3 shrink-0 h-7 text-xs"
                          onClick={() => licenseMutation.mutate({ skuId: sku.skuId, skuName: name, action: assigned ? "remove" : "assign" })}
                          disabled={licenseMutation.isPending || (isFull && !assigned)}
                        >
                          {assigned ? "Retirer" : isFull ? "Complet" : "Assigner"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-foreground/40 text-center py-4">Aucun abonnement disponible</p>
              )}
            </div>
          )}

          {/* ── Tab Connexions ── */}
          {tab === "signins" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Historique de connexion (50 dernières)
                </h3>
                {!signInsLoading && !signInsError && signInLogs && signInLogs.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => {
                      const header = "Date,Application,Résultat,IP,Lieu,Client";
                      const rows = signInLogs.map((log) => {
                        const success = log.status.errorCode === 0 ? "Succès" : "Échec";
                        const location = [log.location?.city, log.location?.countryOrRegion].filter(Boolean).join(" - ") || "";
                        return [
                          csvCell(new Date(log.createdDateTime).toLocaleString("fr-FR")),
                          csvCell(log.appDisplayName || ""),
                          csvCell(success),
                          csvCell(log.ipAddress || ""),
                          csvCell(location),
                          csvCell(log.clientAppUsed || ""),
                        ].join(",");
                      });
                      const csv = [header, ...rows].join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `connexions-${user.userPrincipalName}-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Exporter CSV
                  </Button>
                )}
              </div>
              {signInsError && (signInsError as Error).message === "permission_denied" && (
                <PermissionWarning message="La permission AuditLog.Read.All est requise dans l'enregistrement Azure AD (puis reconnexion) pour accéder aux journaux de connexion." />
              )}
              {signInsError && (signInsError as Error).message !== "permission_denied" && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium mb-1">Erreur lors de la récupération</p>
                  <p className="text-xs font-mono break-all">{(signInsError as Error).message}</p>
                </div>
              )}
              {!signInsError && (
                <p className="text-xs text-foreground/40 mb-3 -mt-2">
                  Journal détaillé Entra (~30 derniers jours, connexions interactives). Le « dernier accès »
                  des listes se base sur le résumé <span className="font-mono">signInActivity</span> (inclut le
                  non-interactif) et peut donc différer.
                </p>
              )}
              {signInsLoading && (
                <div className="py-10"><Loader label="Chargement des connexions…" /></div>
              )}
              {!signInsLoading && !signInsError && signInLogs?.length === 0 && (
                <p className="text-sm text-foreground/40 text-center py-6">
                  Aucune connexion dans le journal détaillé (30 derniers jours).
                </p>
              )}
              {!signInsLoading && !signInsError && signInLogs && signInLogs.length > 0 && (
                <div className="space-y-1.5">
                  {signInLogs.map((log) => {
                    const success = log.status.errorCode === 0;
                    const location = [log.location?.city, log.location?.countryOrRegion].filter(Boolean).join(", ");
                    return (
                      <div
                        key={log.id}
                        className={`rounded-lg border px-3 py-2.5 text-xs ${success ? "border-green-100 dark:border-green-900/60 bg-green-50 dark:bg-green-950/40" : "border-red-100 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            {success
                              ? <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                              : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            <span className={success ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                              {log.appDisplayName || "Application inconnue"}
                            </span>
                          </div>
                          <span className="text-foreground/40 whitespace-nowrap shrink-0">
                            {format(new Date(log.createdDateTime), "dd MMM HH:mm", { locale: fr })}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-foreground/50">
                          {log.ipAddress && <span>{log.ipAddress}</span>}
                          {location && <span>{location}</span>}
                          {log.clientAppUsed && <span>{log.clientAppUsed}</span>}
                        </div>
                        {!success && log.status.failureReason && (
                          <p className="mt-1 text-red-600 font-medium">{log.status.failureReason}</p>
                        )}
                        {!success && log.status.additionalDetails && (
                          <p className="text-red-500 opacity-80">{log.status.additionalDetails}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab Rôles AD ── */}
          {tab === "roles" && (
            <div>
              <h3 className="font-medium text-sm flex items-center gap-2 mb-4">
                <Crown className="h-4 w-4" />
                Rôles Azure AD
              </h3>
              {rolesError && (
                <PermissionWarning message="La permission Directory.ReadWrite.All est requise pour gérer les rôles." />
              )}

              {/* Rôles actuels */}
              {userRolesLoading ? (
                <div className="space-y-2 mb-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !rolesError && (
                <div className="mb-5">
                  <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide mb-2">
                    Rôles attribués ({userRoles?.length ?? 0})
                  </p>
                  {userRoles?.length === 0 ? (
                    <p className="text-sm text-foreground/40 py-2">Aucun rôle AD attribué</p>
                  ) : (
                    <div className="space-y-1">
                      {userRoles?.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2 bg-primary/5 border-primary/20">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.displayName}</p>
                            {r.description && <p className="text-xs text-foreground/40 truncate">{r.description}</p>}
                          </div>
                          {confirmRoleRemove === r.id ? (
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <span className="text-xs text-foreground/60">Retirer ?</span>
                              <Button size="sm" variant="destructive" className="text-xs h-6 px-2"
                                onClick={() => roleMutation.mutate({ roleId: r.id, roleName: r.displayName, action: "remove" })}
                                disabled={roleMutation.isPending}>Oui</Button>
                              <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setConfirmRoleRemove(null)}>Non</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost"
                              className="text-red-500 hover:text-red-700 dark:text-red-300 shrink-0 h-7 w-7 p-0 ml-2"
                              onClick={() => setConfirmRoleRemove(r.id)} disabled={roleMutation.isPending}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Attribuer un rôle */}
              {!rolesError && (
                <>
                  <Separator className="mb-4" />
                  <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide mb-2">Attribuer un rôle</p>
                  <Input placeholder="Rechercher un rôle..." value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} className="mb-2" />
                  {allRolesLoading ? (
                    <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                      {allRoles
                        ?.filter((r) => !userRoleIds.has(r.id) && (roleSearch === "" || r.displayName.toLowerCase().includes(roleSearch.toLowerCase())))
                        .map((r) => (
                          <div key={r.id} className="flex items-center justify-between px-3 py-2 hover:bg-foreground/5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.displayName}</p>
                              {r.description && <p className="text-xs text-foreground/40 truncate">{r.description}</p>}
                            </div>
                            <Button size="sm" variant="outline" className="ml-2 text-xs h-7 shrink-0"
                              onClick={() => roleMutation.mutate({ roleId: r.id, roleName: r.displayName, action: "assign" })}
                              disabled={roleMutation.isPending}>
                              Attribuer
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Tab Absence ── */}
          {tab === "absence" && (
            <div className="space-y-6">
              {/* Réponse automatique (OOO) */}
              <div>
                <h3 className="font-medium text-sm flex items-center gap-2 mb-4">
                  <BellOff className="h-4 w-4" />
                  Réponse automatique (absence mail)
                </h3>
                {mailboxError && (mailboxError as Error).message === "permission_denied" ? (
                  <PermissionWarning message="La permission MailboxSettings.ReadWrite doit être ajoutée dans l'enregistrement Azure AD (Permissions API > Microsoft Graph > Délégué > MailboxSettings.ReadWrite) et le consentement administrateur accordé. Si la permission vient d'être ajoutée, déconnectez-vous puis reconnectez-vous pour actualiser le token." />
                ) : mailboxError ? (
                  <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                    <p className="font-medium mb-1">Erreur lors de la récupération</p>
                    <p className="text-xs font-mono break-all">{(mailboxError as Error).message}</p>
                  </div>
                ) : null}
                {mailboxLoading && (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                )}
                {!mailboxLoading && !mailboxError && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Statut</span>
                      <Select value={oooStatus} onValueChange={(v) => setOooStatus(v as "disabled" | "alwaysEnabled")}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Désactivée</SelectItem>
                          <SelectItem value="alwaysEnabled">Activée</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {oooStatus === "alwaysEnabled" && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-foreground/60 mb-1 block">Message interne (collègues)</label>
                          <textarea
                            className="w-full border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={3}
                            value={oooInternal}
                            onChange={(e) => setOooInternal(e.target.value)}
                            placeholder="Message envoyé aux personnes du même domaine..."
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-foreground/60 mb-1 block">Message externe (autres domaines)</label>
                          <textarea
                            className="w-full border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={3}
                            value={oooExternal}
                            onChange={(e) => setOooExternal(e.target.value)}
                            placeholder="Message envoyé aux expéditeurs externes..."
                          />
                        </div>
                      </>
                    )}
                    <Button onClick={() => saveOoo.mutate()} disabled={saveOoo.isPending} className="w-full">
                      {saveOoo.isPending ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Message Teams */}
              <div>
                <h3 className="font-medium text-sm flex items-center gap-2 mb-1">
                  <BellOff className="h-4 w-4" />
                  Message de statut Teams
                </h3>
                <p className="text-xs text-foreground/50 mb-3">
                  Visible dans Teams par les autres utilisateurs. Requiert{" "}
                  <code className="font-mono bg-foreground/5 px-1 rounded">Presence.ReadWrite.All</code>.
                </p>
                {teamsError && teamsError.toLowerCase().includes("permission") && (
                  <PermissionWarning message="La permission Presence.ReadWrite.All est requise dans l'enregistrement Azure AD." />
                )}
                <div className="space-y-2">
                  <Input
                    placeholder="Ex : En congés jusqu'au 31 mars — contacter support@..."
                    value={teamsMessage}
                    onChange={(e) => setTeamsMessage(e.target.value)}
                    maxLength={280}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground/30">{teamsMessage.length}/280</span>
                    <Button size="sm" onClick={() => saveTeams.mutate()} disabled={saveTeams.isPending || !teamsMessage.trim()}>
                      {saveTeams.isPending ? "Envoi..." : "Définir le message"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
