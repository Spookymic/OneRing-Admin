"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Shield, History, TrendingUp, CheckCircle, XCircle, Crown, AlertTriangle, Download, EyeOff, ChevronRight, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import type { M365User } from "@/services/graph/users";
import type { M365Group, GroupType } from "@/services/graph/groups";
import type { SubscribedSku } from "@/services/graph/licenses";
import { detectAccountType, ACCOUNT_TYPE_CONFIG } from "@/lib/account-types";
import { getSkuFriendlyName } from "@/lib/license-names";
import { apiFetch } from "@/lib/api";
import { downloadXlsx, type XlsxSheet } from "@/lib/xlsx";
import { UserGroupsSheet } from "@/components/users/user-groups-sheet";
import { GroupMembersSheet } from "@/components/groups/group-members-sheet";

const actionLabels: Record<string, string> = {
  GROUP_MEMBER_ADD: "Ajout membre",
  GROUP_MEMBER_REMOVE: "Retrait membre",
  GROUP_OWNER_ADD: "Ajout owner",
  GROUP_OWNER_REMOVE: "Retrait owner",
  GROUP_CREATE: "Groupe créé",
  LICENSE_ASSIGN: "Licence assignée",
  LICENSE_REMOVE: "Licence retirée",
  PASSWORD_RESET: "Réinit. MDP",
  ACCOUNT_DISABLE: "Compte désactivé",
  ACCOUNT_ENABLE: "Compte réactivé",
  ROLE_ASSIGN: "Rôle attribué",
  ROLE_REMOVE: "Rôle retiré",
  OOO_UPDATE: "Absence mail",
  TEAMS_STATUS_UPDATE: "Statut Teams",
  DEVICE_DELETE: "Machine supprimée",
};

/** Libellé court de type de groupe pour les pastilles d'anomalie */
const GROUP_TYPE_SHORT: Record<string, string> = {
  unified: "M365",
  security: "Sécurité",
  distribution: "Distribution",
  sharedMailbox: "BAL partagée",
};

/** Description de la règle de classification pour chaque type de compte */
const ACCOUNT_TYPE_HINT: Record<string, string> = {
  user: "Member actif avec au moins une licence",
  guest: "userType = Guest (compte externe invité)",
  shared: "Member désactivé ou sans licence, avec une adresse mail",
  room: "UPN ou nom contient : salle, room, conf, meeting…",
  equipment: "UPN ou nom contient : equip, imprimante, projecteur…",
  service: "Member sans licence et sans mail (compte technique)",
  disabled: "accountEnabled = false, avec licences actives ou sans mail",
};

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card className="p-5 flex items-start gap-4">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground/60">{title}</p>
        {loading ? (
          <Skeleton className="h-7 w-16 mt-1" />
        ) : (
          <p className="text-2xl font-bold mt-0.5">{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-foreground/40 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function exportStatsCSV(
  users: M365User[] | undefined,
  groups: (M365Group & { type: GroupType })[] | undefined,
  skus: SubscribedSku[] | undefined
) {
  const lines: string[] = ["Catégorie,Métrique,Valeur"];

  if (users) {
    lines.push(`Utilisateurs,Total,${users.length}`);
    lines.push(`Utilisateurs,Actifs,${users.filter((u) => u.accountEnabled).length}`);
    lines.push(`Utilisateurs,Désactivés,${users.filter((u) => !u.accountEnabled).length}`);
    lines.push(`Utilisateurs,Invités,${users.filter((u) => u.userType === "Guest").length}`);
    lines.push(`Utilisateurs,Avec licence,${users.filter((u) => u.assignedLicenses.length > 0).length}`);
    // Anomalies
    lines.push(`Anomalies,Désactivés avec licence,${users.filter((u) => !u.accountEnabled && u.assignedLicenses.length > 0).length}`);
    lines.push(`Anomalies,Invités avec licence,${users.filter((u) => u.userType === "Guest" && u.assignedLicenses.length > 0).length}`);
  }

  if (groups) {
    lines.push(`Groupes,Total,${groups.length}`);
    lines.push(`Groupes,Microsoft 365,${groups.filter((g) => g.type === "unified").length}`);
    lines.push(`Groupes,Sécurité,${groups.filter((g) => g.type === "security").length}`);
    lines.push(`Groupes,Distribution,${groups.filter((g) => g.type === "distribution").length}`);
  }

  if (skus) {
    skus.forEach((sku) => {
      const name = getSkuFriendlyName(sku.skuPartNumber);
      lines.push(`Licences,"${name}",${sku.consumedUnits}/${sku.prepaidUnits.enabled}`);
    });
  }

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `onering-stats-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Libellé lisible d'un type de groupe (exports Excel). */
const GROUP_TYPE_LABEL: Record<string, string> = {
  unified: "Microsoft 365",
  security: "Sécurité",
  distribution: "Distribution",
  sharedMailbox: "Boîte partagée",
};

/** Bouton d'export Excel discret, placé dans l'en-tête de chaque cadre. */
function ExportBtn({ onClick, title = "Exporter ce cadre en Excel" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="ml-auto shrink-0 text-foreground/40 hover:text-primary transition-colors p-1 no-print"
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

const DISMISSED_KEY = "onering-dismissed-anomalies";
// Format des entrées : "anomalyId" (toute l'anomalie) ou "anomalyId:userId" (un user spécifique)

export default function DashboardPage() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [manageAnomaly, setManageAnomaly] = useState<string | null>(null);
  const [anomalySheetUser, setAnomalySheetUser] = useState<M365User | null>(null);
  const [anomalySheetTab, setAnomalySheetTab] = useState<"groups" | "licenses">("licenses");
  const [groupSheet, setGroupSheet] = useState<(M365Group & { type: GroupType }) | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  const saveDismissed = useCallback((next: Set<string>) => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }, []);

  const dismissAnomaly = (anomalyId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(anomalyId);
      saveDismissed(next);
      return next;
    });
  };

  const dismissUser = (anomalyId: string, userId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(`${anomalyId}:${userId}`);
      saveDismissed(next);
      return next;
    });
  };

  const restoreUser = (anomalyId: string, userId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(`${anomalyId}:${userId}`);
      saveDismissed(next);
      return next;
    });
  };

  const restoreAll = () => {
    setDismissed(new Set());
    try { localStorage.removeItem(DISMISSED_KEY); } catch { /* ignore */ }
  };

  const isUserDismissed = (anomalyId: string, userId: string) =>
    dismissed.has(anomalyId) || dismissed.has(`${anomalyId}:${userId}`);

  const { data: users, isLoading: usersLoading } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const { data: groups, isLoading: groupsLoading } = useQuery<(M365Group & { type: GroupType })[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch<(M365Group & { type: GroupType })[]>("/api/groups"),
  });

  const { data: skus, isLoading: skusLoading } = useQuery<SubscribedSku[]>({
    queryKey: ["skus"],
    queryFn: () => apiFetch<SubscribedSku[]>("/api/licenses"),
  });

  const { data: auditLogs, isLoading: auditLoading } = useQuery<any[]>({
    queryKey: ["audit"],
    queryFn: () => apiFetch<any[]>("/api/audit"),
    refetchInterval: 60000,
  });

  // Comptes désactivés / partagés encore membres de groupes (memberOf récupéré côté serveur)
  type OwnedGroup = { id: string; displayName: string; type: GroupType; mail: string | null };
  type OrphanInfo = { id: string; groups: string[]; ownedGroups: OwnedGroup[] };
  const { data: orphanGroups } = useQuery<OrphanInfo[]>({
    queryKey: ["orphan-groups"],
    queryFn: () => apiFetch<OrphanInfo[]>("/api/anomalies/orphans"),
    staleTime: 5 * 60 * 1000,
  });
  const orphanGroupMap = new Map((orphanGroups ?? []).map((o) => [o.id, o]));
  const hasMemberships = (id: string) => (orphanGroupMap.get(id)?.groups.length ?? 0) > 0;
  const ownsGroups = (id: string) => (orphanGroupMap.get(id)?.ownedGroups.length ?? 0) > 0;

  // Groupes M365/Sécurité sans propriétaire
  const { data: ownerlessGroups } = useQuery<{ id: string; displayName: string; type: GroupType }[]>({
    queryKey: ["ownerless-groups"],
    queryFn: () => apiFetch<{ id: string; displayName: string; type: GroupType }[]>("/api/anomalies/ownerless"),
    staleTime: 5 * 60 * 1000,
  });
  const activeOwnerless = (ownerlessGroups ?? []).filter(
    (g) => !dismissed.has("group-no-owner") && !dismissed.has(`group-no-owner:${g.id}`)
  );

  // Groupes dont un propriétaire est un compte désactivé (vue group-centric)
  type DisabledOwnerGroup = {
    id: string; displayName: string; type: GroupType; mail: string | null;
    owners: { id: string; displayName: string; userPrincipalName: string | null }[];
  };
  const { data: disabledOwnerGroups } = useQuery<DisabledOwnerGroup[]>({
    queryKey: ["disabled-owners"],
    queryFn: () => apiFetch<DisabledOwnerGroup[]>("/api/anomalies/disabled-owners"),
    staleTime: 5 * 60 * 1000,
  });
  const activeDisabledOwners = (disabledOwnerGroups ?? []).filter(
    (g) => !dismissed.has("group-disabled-owner") && !dismissed.has(`group-disabled-owner:${g.id}`)
  );

  // Groupes M365/Sécurité sans aucun membre
  const { data: emptyGroups } = useQuery<{ id: string; displayName: string; type: GroupType }[]>({
    queryKey: ["empty-groups"],
    queryFn: () => apiFetch<{ id: string; displayName: string; type: GroupType }[]>("/api/anomalies/empty-groups"),
    staleTime: 5 * 60 * 1000,
  });
  const activeEmpty = (emptyGroups ?? []).filter(
    (g) => !dismissed.has("group-empty") && !dismissed.has(`group-empty:${g.id}`)
  );

  // Utilisateurs inactifs (licenciés, sans connexion récente) — best-effort (Entra Premium)
  type InactiveUser = { id: string; displayName: string; userPrincipalName: string; licenseCount: number; lastSignIn: string | null };
  const { data: inactiveData } = useQuery<{ supported: boolean; days: number; users: InactiveUser[] }>({
    queryKey: ["inactive-users"],
    queryFn: () => apiFetch<{ supported: boolean; days: number; users: InactiveUser[] }>("/api/anomalies/inactive-users"),
    staleTime: 10 * 60 * 1000,
  });
  const inactiveUsers = inactiveData?.users ?? [];

  // Certificats / secrets d'app registrations expirant bientôt
  type Cred = { appObjectId: string; appId: string; appName: string; type: "secret" | "certificate"; name: string | null; endDateTime: string; daysLeft: number };
  const { data: credData } = useQuery<{ supported: boolean; credentials: Cred[] }>({
    queryKey: ["expiring-credentials"],
    queryFn: () => apiFetch<{ supported: boolean; credentials: Cred[] }>("/api/security/expiring-credentials"),
    staleTime: 10 * 60 * 1000,
  });
  const expiringCreds = credData?.credentials ?? [];

  // Licences gaspillées : comptes désactivés + inactifs encore licenciés
  const disabledLicensedUsers = (users ?? []).filter((u) => !u.accountEnabled && u.assignedLicenses.length > 0);
  const wastedFromDisabled = disabledLicensedUsers.reduce((s, u) => s + u.assignedLicenses.length, 0);
  const wastedFromInactive = inactiveUsers.reduce((s, u) => s + u.licenseCount, 0);
  const wastedTotal = wastedFromDisabled + wastedFromInactive;

  function openUserLicenses(userId: string) {
    const full = users?.find((u) => u.id === userId);
    if (full) {
      setAnomalySheetTab("licenses");
      setAnomalySheetUser(full);
    }
  }

  // Invités inactifs
  const { data: inactiveGuestsData } = useQuery<{ supported: boolean; days: number; guests: { id: string; displayName: string; userPrincipalName: string; lastSignIn: string | null; createdDateTime: string | null }[] }>({
    queryKey: ["inactive-guests"],
    queryFn: () => apiFetch("/api/anomalies/inactive-guests"),
    staleTime: 10 * 60 * 1000,
  });
  const inactiveGuests = inactiveGuestsData?.guests ?? [];

  // Licences en conflit (direct + via groupe)
  const { data: licenseConflictsData } = useQuery<{ id: string; displayName: string; userPrincipalName: string; skuIds: string[] }[]>({
    queryKey: ["license-conflicts"],
    queryFn: () => apiFetch("/api/anomalies/license-conflicts"),
    staleTime: 10 * 60 * 1000,
  });
  const licenseConflicts = licenseConflictsData ?? [];
  const skuName = (skuId: string) => {
    const sku = skus?.find((s) => s.skuId === skuId);
    return sku ? getSkuFriendlyName(sku.skuPartNumber) : skuId;
  };

  function openGroupSheet(g: { id: string; displayName: string; type: GroupType }) {
    setGroupSheet({
      id: g.id,
      displayName: g.displayName,
      type: g.type,
      mail: null,
      description: null,
      groupTypes: [],
      mailEnabled: false,
      securityEnabled: false,
      membershipRule: null,
    });
  }

  const userStats = users
    ? {
        total: users.length,
        active: users.filter((u) => u.accountEnabled).length,
        disabled: users.filter((u) => !u.accountEnabled).length,
        guests: users.filter((u) => u.userType === "Guest").length,
        licensed: users.filter((u) => u.assignedLicenses.length > 0).length,
      }
    : null;

  // Répartition des comptes désactivés (accountEnabled=false) par type primaire
  const disabledByType = users
    ? (() => {
        const counts: Partial<Record<string, number>> = {};
        users
          .filter((u) => !u.accountEnabled)
          .forEach((u) => {
            const t = detectAccountType(u);
            counts[t] = (counts[t] ?? 0) + 1;
          });
        return counts;
      })()
    : null;

  // Répartition des comptes actifs (accountEnabled=true) par type primaire
  const activeByType = users
    ? (() => {
        const counts: Partial<Record<string, number>> = {};
        users
          .filter((u) => u.accountEnabled)
          .forEach((u) => {
            const t = detectAccountType(u);
            counts[t] = (counts[t] ?? 0) + 1;
          });
        return counts;
      })()
    : null;

  // Invités avec/sans licence
  const guestWithLicense = users
    ? users.filter((u) => u.userType === "Guest" && u.assignedLicenses.length > 0).length
    : 0;

  const groupStats = groups
    ? {
        total: groups.length,
        unified: groups.filter((g) => g.type === "unified").length,
        security: groups.filter((g) => g.type === "security").length,
        distribution: groups.filter((g) => g.type === "distribution").length,
      }
    : null;

  const accountTypeBreakdown = users
    ? (() => {
        const counts: Record<string, number> = {};
        users.forEach((u) => {
          const t = detectAccountType(u);
          counts[t] = (counts[t] ?? 0) + 1;
        });
        return counts;
      })()
    : null;

  const allAnomalies = users
    ? [
        {
          id: "disabled-licensed",
          label: "Comptes désactivés avec une licence active",
          hint: "Ces licences sont consommées sans utilité.",
          users: users.filter((u) => !u.accountEnabled && u.assignedLicenses.length > 0),
          severity: "high" as const,
        },
        {
          id: "guest-licensed",
          label: "Comptes invités avec une licence assignée",
          hint: "Vérifier si la licence est intentionnelle.",
          users: users.filter((u) => u.userType === "Guest" && u.assignedLicenses.length > 0),
          severity: "medium" as const,
        },
        {
          id: "shared-licensed",
          label: "Boîtes partagées / salles avec une licence",
          hint: "Les boîtes partagées n'ont pas besoin de licence Exchange.",
          users: users.filter((u) => {
            const t = detectAccountType(u);
            return (t === "shared" || t === "room" || t === "equipment") && u.assignedLicenses.length > 0;
          }),
          severity: "low" as const,
        },
        {
          id: "disabled-with-groups",
          label: "Comptes désactivés encore membres de groupes",
          hint: "À retirer des groupes lors de l'offboarding (accès résiduels).",
          users: users.filter((u) => !u.accountEnabled && hasMemberships(u.id)),
          severity: "high" as const,
        },
        {
          id: "disabled-owns-group",
          label: "Comptes désactivés propriétaires d'un groupe",
          hint: "Un propriétaire désactivé ne peut plus gérer le groupe — réattribuer la propriété.",
          users: users.filter((u) => !u.accountEnabled && ownsGroups(u.id)),
          severity: "high" as const,
        },
        {
          id: "shared-with-groups",
          label: "Boîtes partagées / salles encore membres de groupes",
          hint: "Vérifier l'appartenance aux groupes de ces ressources.",
          users: users.filter((u) => {
            const t = detectAccountType(u);
            return (
              u.accountEnabled &&
              (t === "shared" || t === "room" || t === "equipment") &&
              hasMemberships(u.id)
            );
          }),
          severity: "low" as const,
        },
      ].filter((a) => a.users.length > 0)
    : [];

  // Filtre : anomalies entières ignorées OU avec tous les users ignorés
  const anomalies = allAnomalies
    .filter((a) => !dismissed.has(a.id))
    .map((a) => ({
      ...a,
      activeUsers: a.users.filter((u) => !dismissed.has(`${a.id}:${u.id}`)),
      dismissedUsers: a.users.filter((u) => dismissed.has(`${a.id}:${u.id}`)),
    }))
    .filter((a) => a.activeUsers.length > 0);

  const totalDismissed =
    allAnomalies.filter((a) => dismissed.has(a.id)).length +
    allAnomalies.flatMap((a) => a.users.filter((u) => dismissed.has(`${a.id}:${u.id}`))).length;

  function exportAnomaliesCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Catégorie,Cible,Détail"];
    for (const a of allAnomalies) {
      for (const u of a.users) lines.push([esc(a.label), esc(u.displayName), esc(u.userPrincipalName)].join(","));
    }
    for (const g of ownerlessGroups ?? []) lines.push([esc("Groupe sans propriétaire"), esc(g.displayName), esc(g.type)].join(","));
    for (const g of emptyGroups ?? []) lines.push([esc("Groupe vide"), esc(g.displayName), esc(g.type)].join(","));
    for (const u of inactiveUsers) lines.push([esc("Utilisateur inactif"), esc(u.displayName), esc(u.lastSignIn ? `dernier accès ${format(new Date(u.lastSignIn), "dd/MM/yyyy")}` : "jamais connecté")].join(","));
    for (const c of expiringCreds) lines.push([esc("Credential expirant"), esc(c.appName), esc(`${c.type}${c.name ? ` ${c.name}` : ""} — ${c.daysLeft < 0 ? "expiré" : `${c.daysLeft} j`}`)].join(","));
    const csv = lines.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onering-anomalies-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Exports Excel (par cadre + global) ────────────────────────────
  const dstr = () => format(new Date(), "yyyy-MM-dd");
  const typeLabel = (u: M365User) => ACCOUNT_TYPE_CONFIG[detectAccountType(u)]?.label ?? detectAccountType(u);

  const buildSynthese = (): XlsxSheet => {
    const rows: Record<string, unknown>[] = [];
    if (users) {
      rows.push({ c: "Utilisateurs", m: "Total", v: users.length });
      rows.push({ c: "Utilisateurs", m: "Actifs", v: users.filter((u) => u.accountEnabled).length });
      rows.push({ c: "Utilisateurs", m: "Désactivés", v: users.filter((u) => !u.accountEnabled).length });
      rows.push({ c: "Utilisateurs", m: "Invités", v: users.filter((u) => u.userType === "Guest").length });
      rows.push({ c: "Utilisateurs", m: "Avec licence", v: users.filter((u) => u.assignedLicenses.length > 0).length });
      for (const [t, n] of Object.entries(accountTypeBreakdown ?? {})) {
        rows.push({ c: "Type de compte", m: ACCOUNT_TYPE_CONFIG[t as keyof typeof ACCOUNT_TYPE_CONFIG]?.label ?? t, v: n });
      }
    }
    if (groups) {
      rows.push({ c: "Groupes", m: "Total", v: groups.length });
      rows.push({ c: "Groupes", m: "Microsoft 365", v: groups.filter((g) => g.type === "unified").length });
      rows.push({ c: "Groupes", m: "Sécurité", v: groups.filter((g) => g.type === "security").length });
      rows.push({ c: "Groupes", m: "Distribution", v: groups.filter((g) => g.type === "distribution").length });
    }
    return {
      name: "Synthèse",
      columns: [
        { header: "Catégorie", key: "c", width: 24 },
        { header: "Métrique", key: "m", width: 32 },
        { header: "Valeur", key: "v", width: 14 },
      ],
      rows,
    };
  };

  const buildAnomalies = (): XlsxSheet => ({
    name: "Anomalies",
    columns: [
      { header: "Anomalie", key: "anomalie", width: 42 },
      { header: "Sévérité", key: "severite", width: 12 },
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 34 },
      { header: "Type de compte", key: "type", width: 18 },
      { header: "Statut", key: "statut", width: 12 },
      { header: "Nb licences", key: "licences", width: 12 },
      { header: "Invité", key: "invite", width: 10 },
    ],
    rows: allAnomalies.flatMap((a) =>
      a.users.map((u) => ({
        anomalie: a.label,
        severite: a.severity,
        nom: u.displayName,
        upn: u.userPrincipalName,
        type: typeLabel(u),
        statut: u.accountEnabled ? "Actif" : "Désactivé",
        licences: u.assignedLicenses.length,
        invite: u.userType === "Guest" ? "Oui" : "Non",
      }))
    ),
  });

  const buildLicences = (): XlsxSheet => ({
    name: "Licences",
    columns: [
      { header: "Licence", key: "licence", width: 42 },
      { header: "SKU", key: "sku", width: 28 },
      { header: "Consommées", key: "consommees", width: 12 },
      { header: "Total", key: "total", width: 10 },
      { header: "Disponibles", key: "dispo", width: 12 },
      { header: "% occupé", key: "pct", width: 10 },
    ],
    rows: (skus ?? []).map((s) => {
      const total = s.prepaidUnits.enabled;
      return {
        licence: getSkuFriendlyName(s.skuPartNumber),
        sku: s.skuPartNumber,
        consommees: s.consumedUnits,
        total,
        dispo: Math.max(0, total - s.consumedUnits),
        pct: total > 0 ? Math.round((s.consumedUnits / total) * 100) : 0,
      };
    }),
  });

  const buildOwnerless = (): XlsxSheet => ({
    name: "Groupes sans propriétaire",
    columns: [
      { header: "Groupe", key: "nom", width: 40 },
      { header: "Type", key: "type", width: 18 },
    ],
    rows: (ownerlessGroups ?? []).map((g) => ({ nom: g.displayName, type: GROUP_TYPE_LABEL[g.type] ?? g.type })),
  });

  const buildDisabledOwners = (): XlsxSheet => ({
    name: "Propriétaires désactivés",
    columns: [
      { header: "Groupe", key: "groupe", width: 40 },
      { header: "Type", key: "type", width: 18 },
      { header: "Email du groupe", key: "mail", width: 34 },
      { header: "Propriétaire désactivé", key: "owner", width: 28 },
      { header: "UPN propriétaire", key: "upn", width: 34 },
    ],
    rows: (disabledOwnerGroups ?? []).flatMap((g) =>
      g.owners.map((o) => ({
        groupe: g.displayName,
        type: GROUP_TYPE_LABEL[g.type] ?? g.type,
        mail: g.mail ?? "",
        owner: o.displayName,
        upn: o.userPrincipalName ?? "",
      }))
    ),
  });

  const buildEmpty = (): XlsxSheet => ({
    name: "Groupes vides",
    columns: [
      { header: "Groupe", key: "nom", width: 40 },
      { header: "Type", key: "type", width: 18 },
    ],
    rows: (emptyGroups ?? []).map((g) => ({ nom: g.displayName, type: GROUP_TYPE_LABEL[g.type] ?? g.type })),
  });

  const buildCreds = (): XlsxSheet => ({
    name: "Secrets et certificats",
    columns: [
      { header: "Application", key: "app", width: 36 },
      { header: "Type", key: "type", width: 14 },
      { header: "Nom", key: "nom", width: 28 },
      { header: "Expiration", key: "exp", width: 14 },
      { header: "Jours restants", key: "jours", width: 14 },
      { header: "Statut", key: "statut", width: 14 },
    ],
    rows: expiringCreds.map((c) => ({
      app: c.appName,
      type: c.type === "secret" ? "Secret" : "Certificat",
      nom: c.name ?? "",
      exp: c.endDateTime ? format(new Date(c.endDateTime), "dd/MM/yyyy") : "",
      jours: c.daysLeft,
      statut: c.daysLeft < 0 ? "Expiré" : c.daysLeft <= 7 ? "Critique" : "Bientôt",
    })),
  });

  const buildInactiveUsers = (): XlsxSheet => ({
    name: "Utilisateurs inactifs",
    columns: [
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 34 },
      { header: "Nb licences", key: "licences", width: 12 },
      { header: "Dernier accès", key: "acces", width: 16 },
    ],
    rows: inactiveUsers.map((u) => ({
      nom: u.displayName,
      upn: u.userPrincipalName,
      licences: u.licenseCount,
      acces: u.lastSignIn ? format(new Date(u.lastSignIn), "dd/MM/yyyy") : "jamais connecté",
    })),
  });

  const buildInactiveGuests = (): XlsxSheet => ({
    name: "Invités inactifs",
    columns: [
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 40 },
      { header: "Dernier accès", key: "acces", width: 16 },
      { header: "Créé le", key: "cree", width: 14 },
    ],
    rows: inactiveGuests.map((g) => ({
      nom: g.displayName,
      upn: g.userPrincipalName,
      acces: g.lastSignIn ? format(new Date(g.lastSignIn), "dd/MM/yyyy") : "jamais connecté",
      cree: g.createdDateTime ? format(new Date(g.createdDateTime), "dd/MM/yyyy") : "",
    })),
  });

  const buildLicenseConflicts = (): XlsxSheet => ({
    name: "Licences en conflit",
    columns: [
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 34 },
      { header: "Licences en conflit", key: "conflits", width: 50 },
    ],
    rows: licenseConflicts.map((u) => ({
      nom: u.displayName,
      upn: u.userPrincipalName,
      conflits: u.skuIds.map(skuName).join(", "),
    })),
  });

  const buildAudit = (): XlsxSheet => ({
    name: "Historique récent",
    columns: [
      { header: "Date", key: "date", width: 18 },
      { header: "Administrateur", key: "admin", width: 34 },
      { header: "Action", key: "action", width: 22 },
      { header: "Cible", key: "cible", width: 34 },
    ],
    rows: (auditLogs ?? []).map((l) => ({
      date: l.createdAt ? format(new Date(l.createdAt), "dd/MM/yyyy HH:mm") : "",
      admin: l.userUpn ?? "",
      action: actionLabels[l.action] ?? l.action,
      cible: l.targetName ?? "",
    })),
  });

  const exportAll = () =>
    downloadXlsx(`onering-dashboard-${dstr()}`, [
      buildSynthese(), buildAnomalies(), buildLicences(), buildOwnerless(),
      buildDisabledOwners(), buildEmpty(), buildCreds(), buildInactiveUsers(),
      buildInactiveGuests(), buildLicenseConflicts(), buildAudit(),
    ].filter((s) => s.rows.length > 0));

  const severityStyle = {
    high: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
    medium: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
    low: "bg-primary/5 border-primary/20 text-primary",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tableau de bord</h2>
          <p className="text-sm text-foreground/50 mt-0.5">Vue d&apos;ensemble du tenant Microsoft 365</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAll}
            disabled={!users || !groups}
          >
            <Download className="h-4 w-4 mr-2" />
            Tout exporter (Excel)
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Utilisateurs"
          value={userStats?.total ?? 0}
          sub={`${userStats?.active ?? 0} actifs · ${userStats?.disabled ?? 0} désactivés`}
          icon={Users}
          loading={usersLoading}
        />
        <StatCard
          title="Groupes"
          value={groupStats?.total ?? 0}
          sub={`${groupStats?.unified ?? 0} M365 · ${groupStats?.security ?? 0} sécurité`}
          icon={Crown}
          loading={groupsLoading}
        />
        <StatCard
          title="Comptes sous licence"
          value={userStats?.licensed ?? 0}
          sub={`${
            userStats
              ? Math.round((userStats.licensed / Math.max(userStats.total, 1)) * 100)
              : 0
          } % du total`}
          icon={TrendingUp}
          loading={usersLoading}
        />
      </div>

      {/* Anomalies */}
      {!usersLoading && (anomalies.length > 0 || totalDismissed > 0) && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomalies détectées ({anomalies.reduce((s, a) => s + a.activeUsers.length, 0)})
            {totalDismissed > 0 && (
              <button
                onClick={restoreAll}
                className="ml-auto text-xs font-normal text-foreground/40 hover:text-primary underline underline-offset-2"
              >
                {totalDismissed} ignoré{totalDismissed > 1 ? "s" : ""} — Réafficher tout
              </button>
            )}
            <ExportBtn onClick={() => downloadXlsx(`onering-anomalies-${dstr()}`, [buildAnomalies()])} />
          </h3>
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${severityStyle[anomaly.severity]}`}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {anomaly.activeUsers.length} {anomaly.label}
                    {anomaly.dismissedUsers.length > 0 && (
                      <span className="ml-2 text-xs font-normal opacity-60">
                        ({anomaly.dismissedUsers.length} marqué{anomaly.dismissedUsers.length > 1 ? "s" : ""} comme normal)
                      </span>
                    )}
                  </p>
                  <p className="text-xs mt-0.5 opacity-80">{anomaly.hint}</p>
                  <p className="text-xs mt-1 truncate opacity-70">
                    {anomaly.activeUsers.slice(0, 4).map((u) => u.displayName).join(", ")}
                    {anomaly.activeUsers.length > 4 && ` +${anomaly.activeUsers.length - 4} autres`}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => setManageAnomaly(anomaly.id)}
                  >
                    <ChevronRight className="h-3 w-3 mr-1" />
                    Gérer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 opacity-60 hover:opacity-100"
                    onClick={() => dismissAnomaly(anomaly.id)}
                    title="Ignorer toute cette anomalie"
                  >
                    <EyeOff className="h-3 w-3 mr-1" />
                    Ignorer tout
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Groupes sans propriétaire */}
      {!usersLoading && activeOwnerless.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Groupes sans propriétaire ({activeOwnerless.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-groupes-sans-proprietaire-${dstr()}`, [buildOwnerless()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
            <p className="text-xs mb-2 opacity-80">
              Sans propriétaire, personne ne peut gérer ces groupes (M365 / Sécurité). Cliquez sur un groupe pour lui ajouter un propriétaire.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeOwnerless.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-card/60 pl-2.5 pr-1 py-0.5 text-xs"
                >
                  <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300/70 shrink-0">
                    {GROUP_TYPE_SHORT[g.type] ?? g.type}
                  </span>
                  <button
                    type="button"
                    className="max-w-[220px] truncate hover:text-primary transition-colors"
                    onClick={() =>
                      setGroupSheet({
                        id: g.id,
                        displayName: g.displayName,
                        type: g.type,
                        mail: null,
                        description: null,
                        groupTypes: [],
                        mailEnabled: false,
                        securityEnabled: false,
                        membershipRule: null,
                      })
                    }
                    title="Ouvrir le groupe (propriétaires)"
                  >
                    {g.displayName}
                  </button>
                  <button
                    type="button"
                    className="text-amber-500 hover:text-amber-800 p-0.5"
                    title="Marquer comme normal"
                    onClick={() => dismissUser("group-no-owner", g.id)}
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Groupes à propriétaire désactivé */}
      {!usersLoading && activeDisabledOwners.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Groupes à propriétaire désactivé ({activeDisabledOwners.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-proprietaires-desactives-${dstr()}`, [buildDisabledOwners()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
            <p className="text-xs mb-2 opacity-80">
              Un propriétaire désactivé ne peut plus gérer son groupe. Cliquez sur un groupe pour réattribuer la propriété.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeDisabledOwners.slice(0, 20).map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-card/60 pl-2.5 pr-1 py-0.5 text-xs"
                >
                  <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300/70 shrink-0">
                    {GROUP_TYPE_SHORT[g.type] ?? g.type}
                  </span>
                  <button
                    type="button"
                    className="max-w-[220px] truncate hover:text-primary transition-colors"
                    onClick={() =>
                      setGroupSheet({
                        id: g.id,
                        displayName: g.displayName,
                        type: g.type,
                        mail: g.mail,
                        description: null,
                        groupTypes: [],
                        mailEnabled: false,
                        securityEnabled: false,
                        membershipRule: null,
                      })
                    }
                    title={`Propriétaire(s) désactivé(s) : ${g.owners.map((o) => o.displayName).join(", ")}`}
                  >
                    {g.displayName}
                  </button>
                  <button
                    type="button"
                    className="text-amber-500 hover:text-amber-800 p-0.5"
                    title="Marquer comme normal"
                    onClick={() => dismissUser("group-disabled-owner", g.id)}
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Link
              href="/dashboard/disabled-owners"
              className="inline-block text-xs font-medium underline underline-offset-2 mt-2 hover:opacity-80"
            >
              Voir tous les groupes à propriétaire désactivé →
            </Link>
          </div>
        </div>
      )}

      {/* Groupes vides */}
      {!usersLoading && activeEmpty.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Groupes vides ({activeEmpty.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-groupes-vides-${dstr()}`, [buildEmpty()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-primary/5 border-primary/20 text-primary">
            <p className="text-xs mb-2 opacity-80">
              Groupes M365 / Sécurité sans aucun membre — candidats à la suppression ou au peuplement.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeEmpty.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/60 pl-2.5 pr-1 py-0.5 text-xs"
                >
                  <span className="text-[10px] font-semibold uppercase text-primary/70 shrink-0">
                    {GROUP_TYPE_SHORT[g.type] ?? g.type}
                  </span>
                  <button
                    type="button"
                    className="max-w-[220px] truncate hover:text-foreground transition-colors"
                    onClick={() => openGroupSheet(g)}
                    title="Ouvrir le groupe"
                  >
                    {g.displayName}
                  </button>
                  <button
                    type="button"
                    className="text-primary/60 hover:text-foreground p-0.5"
                    title="Marquer comme normal"
                    onClick={() => dismissUser("group-empty", g.id)}
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Certificats / secrets d'applications à renouveler */}
      {!usersLoading && expiringCreds.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Certificats / secrets d&apos;applications à renouveler ({expiringCreds.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-secrets-certificats-${dstr()}`, [buildCreds()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 space-y-1">
            {expiringCreds.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <span className="truncate">
                  <span className="font-medium">{c.appName}</span> — {c.type === "secret" ? "secret" : "certificat"}
                  {c.name ? ` « ${c.name} »` : ""}
                </span>
                <span className="shrink-0 font-medium">
                  {c.daysLeft < 0 ? `expiré depuis ${-c.daysLeft} j` : `dans ${c.daysLeft} j`}
                </span>
              </div>
            ))}
            <Link
              href="/dashboard/credentials"
              className="inline-block text-xs font-medium underline underline-offset-2 pt-1 hover:opacity-80"
            >
              Voir tous les secrets &amp; certificats →
            </Link>
          </div>
        </div>
      )}

      {/* Optimisation des licences */}
      {!usersLoading && (wastedTotal > 0) && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Optimisation des licences
            <ExportBtn onClick={() => downloadXlsx(`onering-utilisateurs-inactifs-${dstr()}`, [buildInactiveUsers()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
            <p className="text-sm font-medium">≈ {wastedTotal} licence(s) récupérable(s)</p>
            <p className="text-xs opacity-80 mb-2">
              {wastedFromDisabled} sur comptes désactivés · {wastedFromInactive} sur comptes inactifs
              {inactiveData && !inactiveData.supported ? " (connexions indisponibles — Entra Premium requis)" : ""}
            </p>
            {inactiveUsers.length > 0 && (
              <>
                <p className="text-xs font-medium mb-1">
                  Comptes inactifs (licenciés, &gt; {inactiveData?.days ?? 90} j sans connexion)
                </p>
                <div className="space-y-0.5">
                  {inactiveUsers.slice(0, 10).map((iu) => {
                    const created = users?.find((u) => u.id === iu.id)?.createdDateTime;
                    return (
                      <button
                        key={iu.id}
                        onClick={() => openUserLicenses(iu.id)}
                        className="flex items-center justify-between w-full text-left rounded px-2 py-1 hover:bg-card/50 text-xs gap-2"
                      >
                        <span className="truncate">
                          <span className="font-medium">{iu.displayName}</span>{" "}
                          <span className="opacity-60">{iu.userPrincipalName}</span>
                        </span>
                        <span className="shrink-0 opacity-70">
                          {iu.lastSignIn ? `dernier accès ${format(new Date(iu.lastSignIn), "dd/MM/yyyy")}` : "jamais connecté"}
                          {created ? ` · créé il y a ${formatDistanceToNow(new Date(created), { locale: fr })}` : ""}
                        </span>
                      </button>
                    );
                  })}
                  <Link
                    href="/dashboard/inactive-users"
                    className="inline-block text-xs font-medium underline underline-offset-2 mt-1 hover:opacity-80"
                  >
                    Voir tous les utilisateurs inactifs →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invités inactifs */}
      {!usersLoading && inactiveGuests.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-500" />
            Invités inactifs ({inactiveGuests.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-invites-inactifs-${dstr()}`, [buildInactiveGuests()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
            <p className="text-xs mb-2 opacity-80">
              Comptes invités sans connexion depuis &gt; {inactiveGuestsData?.days ?? 90} j — candidats au nettoyage.
            </p>
            <div className="space-y-0.5">
              {inactiveGuests.slice(0, 10).map((g) => (
                <button
                  key={g.id}
                  onClick={() => openUserLicenses(g.id)}
                  className="flex items-center justify-between w-full text-left rounded px-2 py-1 hover:bg-card/50 text-xs gap-2"
                >
                  <span className="truncate">
                    <span className="font-medium">{g.displayName}</span>{" "}
                    <span className="opacity-60">{g.userPrincipalName}</span>
                  </span>
                  <span className="shrink-0 opacity-70">
                    {g.lastSignIn ? `dernier accès ${format(new Date(g.lastSignIn), "dd/MM/yyyy")}` : "jamais connecté"}
                    {g.createdDateTime ? ` · créé il y a ${formatDistanceToNow(new Date(g.createdDateTime), { locale: fr })}` : ""}
                  </span>
                </button>
              ))}
              <Link
                href="/dashboard/inactive-guests"
                className="inline-block text-xs font-medium underline underline-offset-2 mt-1 hover:opacity-80"
              >
                Voir tous les invités inactifs →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Licences en conflit */}
      {!usersLoading && licenseConflicts.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Licences en conflit ({licenseConflicts.length})
            <ExportBtn onClick={() => downloadXlsx(`onering-licences-conflit-${dstr()}`, [buildLicenseConflicts()])} />
          </h3>
          <div className="rounded-lg border px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300">
            <p className="text-xs mb-2 opacity-80">
              Licence assignée à la fois en direct et via un groupe (doublon — une affectation peut être retirée).
            </p>
            <div className="space-y-0.5">
              {licenseConflicts.slice(0, 10).map((c) => (
                <button
                  key={c.id}
                  onClick={() => openUserLicenses(c.id)}
                  className="flex items-center justify-between w-full text-left rounded px-2 py-1 hover:bg-card/50 text-xs gap-2"
                >
                  <span className="truncate">
                    <span className="font-medium">{c.displayName}</span>{" "}
                    <span className="opacity-60">{c.userPrincipalName}</span>
                  </span>
                  <span className="shrink-0 opacity-70 truncate max-w-[45%]">
                    {c.skuIds.map(skuName).join(", ")}
                  </span>
                </button>
              ))}
              {licenseConflicts.length > 10 && (
                <p className="text-xs opacity-70">+{licenseConflicts.length - 10} autres</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog Gérer anomalie */}
      {manageAnomaly && (() => {
        const anomaly = allAnomalies.find((a) => a.id === manageAnomaly);
        if (!anomaly) return null;
        const active = anomaly.users.filter((u) => !dismissed.has(`${anomaly.id}:${u.id}`) && !dismissed.has(anomaly.id));
        const normal = anomaly.users.filter((u) => dismissed.has(`${anomaly.id}:${u.id}`));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setManageAnomaly(null)} />
            <div className="relative bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
              <div className="flex items-start justify-between p-5 border-b">
                <div>
                  <h3 className="font-semibold text-sm">{anomaly.label}</h3>
                  <p className="text-xs text-foreground/50 mt-0.5">{anomaly.hint}</p>
                </div>
                <button
                  onClick={() => setManageAnomaly(null)}
                  className="text-foreground/40 hover:text-foreground ml-4 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {active.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground/50 mb-2 uppercase tracking-wide">
                      À traiter ({active.length})
                    </p>
                    <div className="space-y-1">
                      {active.map((u) => {
                        const owned =
                          anomaly.id === "disabled-owns-group"
                            ? orphanGroupMap.get(u.id)?.ownedGroups ?? []
                            : [];
                        return (
                          <div key={u.id} className="rounded-md border px-3 py-2">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                className="min-w-0 text-left hover:text-primary transition-colors flex-1"
                                onClick={() => {
                                  setManageAnomaly(null);
                                  setAnomalySheetTab(anomaly.id.includes("group") ? "groups" : "licenses");
                                  setAnomalySheetUser(u);
                                }}
                                title="Ouvrir la fiche utilisateur"
                              >
                                <p className="text-sm font-medium truncate">{u.displayName}</p>
                                <p className="text-xs text-foreground/40 truncate">{u.userPrincipalName}</p>
                              </button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 ml-2 shrink-0 text-foreground/50 hover:text-primary"
                                onClick={() => dismissUser(anomaly.id, u.id)}
                              >
                                <EyeOff className="h-3 w-3 mr-1" />
                                Normal
                              </Button>
                            </div>
                            {owned.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="text-xs text-foreground/40">Propriétaire de :</span>
                                {owned.map((g) => (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => {
                                      setManageAnomaly(null);
                                      setGroupSheet({
                                        id: g.id,
                                        displayName: g.displayName,
                                        type: g.type,
                                        mail: g.mail,
                                        description: null,
                                        groupTypes: [],
                                        mailEnabled: false,
                                        securityEnabled: false,
                                        membershipRule: null,
                                      });
                                    }}
                                    className="text-xs rounded-full border px-2 py-0.5 hover:border-primary hover:text-primary transition-colors"
                                    title="Ouvrir le groupe (propriétaires)"
                                  >
                                    {g.displayName}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {normal.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground/50 mb-2 uppercase tracking-wide">
                      Marqués comme normaux ({normal.length})
                    </p>
                    <div className="space-y-1">
                      {normal.map((u) => (
                        <div key={u.id} className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 opacity-60">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.displayName}</p>
                            <p className="text-xs text-foreground/40 truncate">{u.userPrincipalName}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 ml-2 shrink-0"
                            onClick={() => restoreUser(anomaly.id, u.id)}
                          >
                            Réafficher
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setManageAnomaly(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Grille d'analyse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Répartition types de comptes */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Types de comptes
            <ExportBtn onClick={() => downloadXlsx(`onering-synthese-${dstr()}`, [buildSynthese()])} title="Exporter la synthèse (Excel)" />
          </h3>
          <p className="text-xs text-foreground/40 mb-4">
            Chaque compte reçoit un seul type primaire. Survolez un type pour voir le critère de classification.
          </p>
          {usersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : accountTypeBreakdown ? (
            <div className="space-y-2.5">
              {Object.entries(accountTypeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const cfg = ACCOUNT_TYPE_CONFIG[type as keyof typeof ACCOUNT_TYPE_CONFIG];
                  const pct = Math.round((count / (users?.length ?? 1)) * 100);
                  return (
                    <div key={type}>
                      <Link href={`/dashboard/users?type=${type}`}>
                        <div
                          className="flex items-center justify-between text-sm mb-1 cursor-pointer hover:text-primary transition-colors group"
                          title={ACCOUNT_TYPE_HINT[type] ?? ""}
                        >
                          <span className="text-foreground/70 group-hover:text-primary">{cfg?.label ?? type}</span>
                          <span className="text-foreground/50 tabular-nums group-hover:text-primary">{count}</span>
                        </div>
                      </Link>
                      <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : null}
        </Card>

        {/* Répartition groupes */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            Types de groupes
          </h3>
          {groupsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : groupStats ? (
            <div className="space-y-2.5">
              {[
                { label: "Microsoft 365", count: groupStats.unified, color: "bg-primary", type: "unified" },
                { label: "Sécurité", count: groupStats.security, color: "bg-[#01031B]", type: "security" },
                { label: "Distribution", count: groupStats.distribution, color: "bg-primary", type: "distribution" },
              ].map(({ label, count, color, type }) => {
                const pct = Math.round(
                  (count / Math.max(groupStats.total, 1)) * 100
                );
                return (
                  <div key={label}>
                    <Link href={`/dashboard/groups?type=${type}`}>
                      <div className="flex items-center justify-between text-sm mb-1 cursor-pointer group">
                        <span className="text-foreground/70 group-hover:text-primary transition-colors">{label}</span>
                        <span className="text-foreground/50 tabular-nums group-hover:text-primary transition-colors">{count}</span>
                      </div>
                    </Link>
                    <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>

        {/* Statut des comptes */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            Santé des comptes
          </h3>
          {usersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : userStats ? (
            <div className="space-y-3">
              <Link href="/dashboard/users?status=active">
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/40 rounded-lg hover:bg-green-100 transition-colors cursor-pointer">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-green-700 dark:text-green-300 text-lg leading-none">{userStats.active}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Actifs</p>
                    {activeByType && Object.keys(activeByType).length > 0 && (
                      <p className="text-xs text-green-500 mt-1 leading-snug">
                        dont{" "}
                        {Object.entries(activeByType)
                          .sort((a, b) => b[1]! - a[1]!)
                          .map(([t, n]) => `${n} ${ACCOUNT_TYPE_CONFIG[t as keyof typeof ACCOUNT_TYPE_CONFIG]?.label.toLowerCase() ?? t}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="ml-auto text-sm font-semibold text-green-600 dark:text-green-400 shrink-0">
                    {Math.round((userStats.active / Math.max(userStats.total, 1)) * 100)} %
                  </span>
                </div>
              </Link>
              <Link href="/dashboard/users?status=disabled">
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/40 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-red-600 text-lg leading-none">{userStats.disabled}</p>
                    <p className="text-xs text-red-500 mt-0.5">Désactivés</p>
                    {disabledByType && Object.keys(disabledByType).length > 0 && (
                      <p className="text-xs text-red-400 mt-1 leading-snug">
                        dont{" "}
                        {Object.entries(disabledByType)
                          .sort((a, b) => b[1]! - a[1]!)
                          .map(([t, n]) => `${n} ${ACCOUNT_TYPE_CONFIG[t as keyof typeof ACCOUNT_TYPE_CONFIG]?.label.toLowerCase() ?? t}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="ml-auto text-sm font-semibold text-red-500 shrink-0">
                    {Math.round((userStats.disabled / Math.max(userStats.total, 1)) * 100)} %
                  </span>
                </div>
              </Link>
              {userStats.guests > 0 && (
                <Link href="/dashboard/users?type=guest">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                    <Users className="h-5 w-5 text-gray-500 dark:text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-600 dark:text-gray-400 text-lg leading-none">{userStats.guests}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Invités</p>
                      <p className="text-xs text-gray-400 mt-1 leading-snug">
                        {guestWithLicense > 0
                          ? `dont ${guestWithLicense} avec licence · ${userStats.guests - guestWithLicense} sans licence`
                          : "aucun avec licence"}
                      </p>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {/* SKU licences — cliquables */}
      {(skus && skus.length > 0) || skusLoading ? (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Abonnements Microsoft 365
            <span className="text-foreground/40 font-normal">(cliquer pour voir les utilisateurs)</span>
            <ExportBtn onClick={() => downloadXlsx(`onering-licences-${dstr()}`, [buildLicences()])} />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {skusLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-16 w-full" />
                  </Card>
                ))
              : skus?.map((sku) => {
                  const assignedCount =
                    users?.filter((u) =>
                      u.assignedLicenses.some((l) => l.skuId === sku.skuId)
                    ).length ?? sku.consumedUnits;
                  const total = sku.prepaidUnits.enabled;
                  const pct = total > 0 ? Math.round((assignedCount / total) * 100) : 0;
                  const isFull = assignedCount >= total && total > 0;

                  return (
                    <Link key={sku.skuId} href={`/dashboard/licenses?sku=${sku.skuId}`}>
                      <Card className="p-4 space-y-2 hover:border-primary hover:shadow-sm transition-all cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">
                            {getSkuFriendlyName(sku.skuPartNumber)}
                          </p>
                          {isFull && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              Complet
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-foreground/50">
                            <span>{assignedCount} assigné{assignedCount !== 1 ? "s" : ""}</span>
                            <span>{total} dispo.</span>
                          </div>
                          <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isFull ? "bg-destructive" : pct > 80 ? "bg-primary" : "bg-primary"
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
          </div>
        </div>
      ) : null}

      {/* Sheet licences depuis anomalie */}
      {anomalySheetUser && (
        <UserGroupsSheet
          user={anomalySheetUser}
          open={!!anomalySheetUser}
          onClose={() => setAnomalySheetUser(null)}
          initialTab={anomalySheetTab}
        />
      )}

      {/* Panneau du groupe possédé (depuis l'alerte propriétaire désactivé) */}
      {groupSheet && (
        <GroupMembersSheet
          group={groupSheet}
          open={!!groupSheet}
          onClose={() => setGroupSheet(null)}
        />
      )}

      {/* Audit récent */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Modifications récentes
          <ExportBtn onClick={() => downloadXlsx(`onering-historique-${dstr()}`, [buildAudit()])} />
        </h3>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Administrateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Cible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : auditLogs?.slice(0, 8).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-foreground/50 whitespace-nowrap">
                        {format(new Date(log.createdAt), "dd MMM HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-sm">{log.userUpn}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {actionLabels[log.action] ?? log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.targetName}</TableCell>
                    </TableRow>
                  ))}
              {!auditLoading && (!auditLogs || auditLogs.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-foreground/40 py-6 text-sm"
                  >
                    Aucune modification enregistrée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
