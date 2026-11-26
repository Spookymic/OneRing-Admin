"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  FileSpreadsheet, Inbox, Users2, UserSquare, Crown, Shield,
  Search, Check, Download, CheckCheck, X, ShieldCheck, UserCog,
} from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { downloadXlsx, type XlsxSheet, type XlsxColumn } from "@/lib/xlsx";
import { useAdminSettings } from "@/lib/admin-settings";
import { detectAccountType, ACCOUNT_TYPE_CONFIG } from "@/lib/account-types";
import { getSkuFriendlyName } from "@/lib/license-names";
import type { M365User } from "@/services/graph/users";
import type { M365Group, GroupType } from "@/services/graph/groups";
import type { SubscribedSku } from "@/services/graph/licenses";
import { mfaReportQuery, adminReportQuery } from "@/hooks/use-identity-reports";
import {
  authMethodLabel, isCriticalRole, mfaOrigin, summarizeAdmins, summarizeMfa, summarizeMfaByOrigin,
  MFA_ORIGIN_LABELS,
  type AdminAssignment, type AdminPrincipalType,
} from "@/lib/identity-reports";

type GroupWithType = M365Group & { type: GroupType };
type ReportId =
  | "dl-members" | "group-members" | "user-groups" | "group-owners" | "users-licenses"
  | "mfa-status" | "admin-accounts";
/** "tenant" : rapport sans sélection, couvrant tout le tenant et chargé à la génération. */
type PickKind = "groups" | "users" | "all-groups" | "all-users" | "tenant";

interface ReportDef {
  id: ReportId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  pick: PickKind;
  groupTypes?: GroupType[]; // filtre du sélecteur de groupes
}

const REPORTS: ReportDef[] = [
  {
    id: "dl-members",
    title: "Membres de listes de distribution",
    description: "Sélectionnez une ou plusieurs listes de distribution : export de tous leurs membres, avec le statut actif / désactivé des comptes.",
    icon: Inbox,
    pick: "groups",
    groupTypes: ["distribution"],
  },
  {
    id: "group-members",
    title: "Membres de groupes",
    description: "Sélectionnez des groupes (Microsoft 365 / Sécurité) : export de tous leurs membres, avec le statut actif / désactivé des comptes.",
    icon: Users2,
    pick: "groups",
    groupTypes: ["unified", "security", "sharedMailbox"],
  },
  {
    id: "user-groups",
    title: "Groupes par utilisateur",
    description: "Sélectionnez des utilisateurs : export de tous les groupes dont ils sont membres, avec le statut actif / désactivé du compte.",
    icon: UserSquare,
    pick: "users",
  },
  {
    id: "group-owners",
    title: "Propriétaires de groupes / DL",
    description: "Export de tous les groupes et listes de distribution avec leurs propriétaires et le statut actif / désactivé de leur compte.",
    icon: Crown,
    pick: "all-groups",
  },
  {
    id: "users-licenses",
    title: "Utilisateurs & licences",
    description: "Export de tous les comptes avec type, statut, département et licences assignées.",
    icon: Shield,
    pick: "all-users",
  },
  {
    id: "mfa-status",
    title: "État MFA des comptes",
    description: "Liste des comptes avec MFA actif / inactif, méthodes enregistrées et méthode par défaut. Comparatif internes / invités et feuilles dédiées aux comptes sans MFA de chaque origine.",
    icon: ShieldCheck,
    pick: "tenant",
  },
  {
    id: "admin-accounts",
    title: "Comptes administrateurs",
    description: "Comptes détenant un rôle Entra (attributions actives et éligibles PIM, y compris via groupe), avec rôles critiques, statut du compte et état MFA.",
    icon: UserCog,
    pick: "tenant",
  },
];

const PRINCIPAL_TYPE_LABELS: Record<AdminPrincipalType, string> = {
  user: "Utilisateur",
  group: "Groupe",
  servicePrincipal: "Application",
  other: "Autre",
};

const MFA_ON = "Actif";
const MFA_OFF = "Inactif";
const yesNo = (v: boolean | null | undefined) => (v == null ? "" : v ? "Oui" : "Non");

const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  unified: "M365",
  distribution: "Distribution",
  security: "Sécurité",
  sharedMailbox: "Boîte partagée",
};

/** Noms de feuilles Excel uniques (≤31 car., pas de doublon). */
function makeSheetNamer() {
  const used = new Set<string>();
  return (raw: string): string => {
    const base = (raw || "Feuille").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Feuille";
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  };
}

/** Colonne « Statut du compte » commune aux rapports listant des utilisateurs. */
const ACCOUNT_STATUS_COL: XlsxColumn = { header: "Statut du compte", key: "statut", width: 16 };
const STATUS_ENABLED = "Actif";
const STATUS_DISABLED = "Désactivé";

type StatusLookup = (o: { id?: string | null; upn?: string | null; mail?: string | null }) => string;

/**
 * Statut actif/désactivé d'un objet annuaire, retrouvé dans la liste des comptes (id, puis UPN, puis
 * adresse mail). Chaîne vide si l'objet n'est pas un utilisateur (groupe, contact, appareil…).
 */
function buildStatusLookup(users: M365User[]): StatusLookup {
  const byId = new Map(users.map((u) => [u.id, u]));
  const byKey = new Map<string, M365User>();
  for (const u of users) {
    byKey.set(u.userPrincipalName.toLowerCase(), u);
    if (u.mail) byKey.set(u.mail.toLowerCase(), u);
  }
  return ({ id, upn, mail }) => {
    const u =
      (id ? byId.get(id) : undefined) ??
      (upn ? byKey.get(upn.toLowerCase()) : undefined) ??
      (mail ? byKey.get(mail.toLowerCase()) : undefined);
    return u ? (u.accountEnabled ? STATUS_ENABLED : STATUS_DISABLED) : "";
  };
}

export default function ReportsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useAdminSettings();
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);

  const report = REPORTS.find((r) => r.id === selected) ?? null;

  // Lien direct depuis le tableau de bord : /dashboard/reports?report=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (id && REPORTS.some((r) => r.id === id)) setSelected(id as ReportId);
  }, []);

  const { data: groups, isLoading: groupsLoading } = useQuery<GroupWithType[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch<GroupWithType[]>("/api/groups"),
    enabled: !!report && (report.pick === "groups" || report.pick === "all-groups"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: users, isLoading: usersLoading } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
    enabled: !!report && (report.pick === "users" || report.pick === "all-users"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: skus } = useQuery<SubscribedSku[]>({
    queryKey: ["skus"],
    queryFn: () => apiFetch<SubscribedSku[]>("/api/licenses"),
    enabled: !!report && report.id === "users-licenses",
    staleTime: 5 * 60 * 1000,
  });

  // Options du sélecteur (groupes filtrés par type, ou utilisateurs)
  const pickOptions = useMemo(() => {
    if (!report) return [];
    if (report.pick === "groups" && groups) {
      return groups
        .filter((g) => !report.groupTypes || report.groupTypes.includes(g.type))
        .map((g) => ({ id: g.id, label: g.displayName, sub: g.mail ?? GROUP_TYPE_LABELS[g.type] }));
    }
    if (report.pick === "users" && users) {
      return users.map((u) => ({ id: u.id, label: u.displayName, sub: u.userPrincipalName }));
    }
    return [];
  }, [report, groups, users]);

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase();
    return pickOptions.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q));
  }, [pickOptions, search]);

  const needsPicker = report?.pick === "groups" || report?.pick === "users";
  const pickerLoading = report?.pick === "groups" ? groupsLoading : usersLoading;

  function selectReport(id: ReportId) {
    setSelected(id);
    setPicked(new Set());
    setSearch("");
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setPicked((prev) => {
      const next = new Set(prev);
      filteredOptions.forEach((o) => next.add(o.id));
      return next;
    });
  }

  const dl = (base: string) => `${base}-${format(new Date(), "yyyy-MM-dd")}`;

  /** Liste des comptes (cache partagé, chargée si besoin) → recherche du statut actif/désactivé. */
  async function getStatusLookup(): Promise<StatusLookup> {
    const list =
      users ??
      (await queryClient.ensureQueryData<M365User[]>({
        queryKey: ["users"],
        queryFn: () => apiFetch<M365User[]>("/api/users"),
      }));
    return buildStatusLookup(list);
  }

  const disabledSuffix = (n: number) => (n > 0 ? `, dont ${n} compte(s) désactivé(s)` : "");

  async function generate() {
    if (!report) return;
    setGenerating(true);
    try {
      if (report.id === "dl-members" || report.id === "group-members") {
        await generateMembers();
      } else if (report.id === "user-groups") {
        await generateUserGroups();
      } else if (report.id === "group-owners") {
        await generateOwners();
      } else if (report.id === "users-licenses") {
        generateUsersLicenses();
      } else if (report.id === "mfa-status") {
        await generateMfa();
      } else if (report.id === "admin-accounts") {
        await generateAdmins();
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message ?? "Génération impossible", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  // ── Membres de groupes / DL ────────────────────────────────────────
  async function generateMembers() {
    const chosen = pickOptions.filter((o) => picked.has(o.id));
    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    const payload = {
      entities: chosen.map((o) => {
        const g = groupById.get(o.id);
        return { id: o.id, name: o.label, type: g ? GROUP_TYPE_LABELS[g.type] : "" };
      }),
    };
    const [{ entities }, statusOf] = await Promise.all([
      apiFetch<{ entities: MembersEntity[] }>("/api/reports/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      getStatusLookup(),
    ]);
    // Statut uniquement pour les membres de type utilisateur
    const memberStatus = (m: ReportMemberDto) =>
      m.kind === "Utilisateur" ? statusOf({ id: m.id, upn: m.userPrincipalName, mail: m.mail }) : "";

    const cols: XlsxColumn[] = [
      { header: "Membre", key: "membre", width: 30 },
      { header: "UPN", key: "upn", width: 32 },
      { header: "Email", key: "email", width: 30 },
      { header: "Type membre", key: "kind", width: 16 },
      ACCOUNT_STATUS_COL,
    ];
    const consCols: XlsxColumn[] = [
      { header: report!.id === "dl-members" ? "Liste de distribution" : "Groupe", key: "entite", width: 30 },
      { header: "Type", key: "typeEntite", width: 14 },
      ...cols,
    ];
    const sheetName = makeSheetNamer();
    const consolidated: XlsxSheet = {
      name: "Consolidé",
      columns: consCols,
      rows: entities.flatMap((e) =>
        e.members.map((m) => ({
          entite: e.name, typeEntite: e.type,
          membre: m.displayName, upn: m.userPrincipalName ?? "", email: m.mail ?? "", kind: m.kind,
          statut: memberStatus(m),
        }))
      ),
    };
    const perEntity: XlsxSheet[] = entities.map((e) => ({
      name: sheetName(e.name),
      columns: cols,
      rows: e.members.map((m) => ({
        membre: m.displayName, upn: m.userPrincipalName ?? "", email: m.mail ?? "", kind: m.kind,
        statut: memberStatus(m),
      })),
    }));
    const total = entities.reduce((s, e) => s + e.members.length, 0);
    const disabled = consolidated.rows.filter((r) => r.statut === STATUS_DISABLED).length;
    await downloadXlsx(dl(report!.id === "dl-members" ? "rapport-membres-dl" : "rapport-membres-groupes"), [consolidated, ...perEntity]);
    toast({ title: "Rapport généré", description: `${entities.length} entité(s), ${total} membre(s)${disabledSuffix(disabled)}.` });
  }

  // ── Groupes par utilisateur ────────────────────────────────────────
  async function generateUserGroups() {
    const chosen = pickOptions.filter((o) => picked.has(o.id));
    const payload = { users: chosen.map((o) => ({ id: o.id, name: o.label, upn: o.sub ?? "" })) };
    const [{ entities }, statusOf] = await Promise.all([
      apiFetch<{ entities: UserGroupsEntity[] }>("/api/reports/user-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      getStatusLookup(),
    ]);
    const userStatus = (e: UserGroupsEntity) => statusOf({ id: e.id, upn: e.upn });

    const cols: XlsxColumn[] = [
      { header: "Groupe", key: "groupe", width: 32 },
      { header: "Type", key: "type", width: 14 },
      { header: "Email", key: "email", width: 30 },
    ];
    const sheetName = makeSheetNamer();
    const consolidated: XlsxSheet = {
      name: "Consolidé",
      columns: [
        { header: "Utilisateur", key: "user", width: 28 },
        { header: "UPN", key: "upn", width: 32 },
        ACCOUNT_STATUS_COL,
        ...cols,
      ],
      rows: entities.flatMap((e) =>
        e.groups.map((g) => ({
          user: e.name, upn: e.upn, statut: userStatus(e),
          groupe: g.displayName, type: groupKindLabel(g), email: g.mail ?? "",
        }))
      ),
    };
    // Feuille par utilisateur : le statut est le même pour toutes les lignes → colonne répétée
    const perEntity: XlsxSheet[] = entities.map((e) => ({
      name: sheetName(e.name || e.upn),
      columns: [...cols, ACCOUNT_STATUS_COL],
      rows: e.groups.map((g) => ({
        groupe: g.displayName, type: groupKindLabel(g), email: g.mail ?? "", statut: userStatus(e),
      })),
    }));
    const total = entities.reduce((s, e) => s + e.groups.length, 0);
    const disabled = entities.filter((e) => userStatus(e) === STATUS_DISABLED).length;
    await downloadXlsx(dl("rapport-groupes-par-utilisateur"), [consolidated, ...perEntity]);
    toast({ title: "Rapport généré", description: `${entities.length} utilisateur(s), ${total} appartenance(s)${disabledSuffix(disabled)}.` });
  }

  // ── Propriétaires (tous les groupes/DL) ────────────────────────────
  async function generateOwners() {
    const all = groups ?? [];
    const payload = { entities: all.map((g) => ({ id: g.id, name: g.displayName, type: GROUP_TYPE_LABELS[g.type] })) };
    const [{ entities }, statusOf] = await Promise.all([
      apiFetch<{ entities: OwnersEntity[] }>("/api/reports/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      getStatusLookup(),
    ]);
    const ownerStatus = (o: OwnerDto) => statusOf({ id: o.id, mail: o.mail });

    const cols: XlsxColumn[] = [
      { header: "Propriétaire", key: "owner", width: 30 },
      { header: "Email", key: "email", width: 32 },
      ACCOUNT_STATUS_COL,
    ];
    const sheetName = makeSheetNamer();
    const consolidated: XlsxSheet = {
      name: "Consolidé",
      columns: [
        { header: "Groupe / DL", key: "entite", width: 32 },
        { header: "Type", key: "type", width: 14 },
        ...cols,
      ],
      rows: entities.flatMap((e) =>
        e.owners.length === 0
          ? [{ entite: e.name, type: e.type, owner: "(aucun propriétaire)", email: "", statut: "" }]
          : e.owners.map((o) => ({
              entite: e.name, type: e.type, owner: o.displayName, email: o.mail ?? "", statut: ownerStatus(o),
            }))
      ),
    };
    // Une feuille par entité ayant au moins un propriétaire (évite des centaines d'onglets vides)
    const perEntity: XlsxSheet[] = entities
      .filter((e) => e.owners.length > 0)
      .map((e) => ({
        name: sheetName(e.name),
        columns: cols,
        rows: e.owners.map((o) => ({ owner: o.displayName, email: o.mail ?? "", statut: ownerStatus(o) })),
      }));
    const withoutOwner = entities.filter((e) => e.owners.length === 0).length;
    // Groupes dont tous les propriétaires sont désactivés (≈ sans propriétaire effectif)
    const onlyDisabled = entities.filter(
      (e) => e.owners.length > 0 && e.owners.every((o) => ownerStatus(o) === STATUS_DISABLED)
    ).length;
    await downloadXlsx(dl("rapport-proprietaires-groupes"), [consolidated, ...perEntity]);
    toast({
      title: "Rapport généré",
      description:
        `${entities.length} groupe(s), dont ${withoutOwner} sans propriétaire` +
        (onlyDisabled > 0 ? ` et ${onlyDisabled} dont tous les propriétaires sont désactivés` : "") + ".",
    });
  }

  // ── Utilisateurs & licences (client) ───────────────────────────────
  function generateUsersLicenses() {
    const list = users ?? [];
    const partById = new Map((skus ?? []).map((s) => [s.skuId, s.skuPartNumber]));
    const rows = list.map((u) => {
      const type = detectAccountType(u, settings.customRoomPatterns, settings.customEquipmentPatterns);
      const licenses = u.assignedLicenses
        .map((l) => getSkuFriendlyName(partById.get(l.skuId) ?? l.skuId))
        .sort((a, b) => a.localeCompare(b, "fr"));
      return {
        nom: u.displayName,
        upn: u.userPrincipalName,
        email: u.mail ?? "",
        type: ACCOUNT_TYPE_CONFIG[type].label,
        statut: u.accountEnabled ? STATUS_ENABLED : STATUS_DISABLED,
        dep: u.department ?? "",
        fonction: u.jobTitle ?? "",
        nbLicences: licenses.length,
        licences: licenses.join(", "),
      };
    });
    downloadXlsx(dl("rapport-utilisateurs-licences"), [{
      name: "Utilisateurs & licences",
      columns: [
        { header: "Nom", key: "nom", width: 28 },
        { header: "UPN", key: "upn", width: 32 },
        { header: "Email", key: "email", width: 30 },
        { header: "Type de compte", key: "type", width: 16 },
        ACCOUNT_STATUS_COL,
        { header: "Département", key: "dep", width: 22 },
        { header: "Fonction", key: "fonction", width: 24 },
        { header: "Nb licences", key: "nbLicences", width: 12 },
        { header: "Licences", key: "licences", width: 50 },
      ],
      rows,
    }]);
    toast({ title: "Rapport généré", description: `${rows.length} compte(s).` });
  }

  /** Liste des comptes (cache partagé) : type de compte et statut. */
  async function getUsers(): Promise<M365User[]> {
    return (
      users ??
      (await queryClient.ensureQueryData<M365User[]>({
        queryKey: ["users"],
        queryFn: () => apiFetch<M365User[]>("/api/users"),
      }))
    );
  }

  const accountTypeLabel = (u: M365User | undefined, fallback: string | null) =>
    u
      ? ACCOUNT_TYPE_CONFIG[detectAccountType(u, settings.customRoomPatterns, settings.customEquipmentPatterns)].label
      : fallback === "Guest" ? "Invité" : (fallback ?? "");

  // ── État MFA ───────────────────────────────────────────────────────
  async function generateMfa() {
    const [mfa, list, admins] = await Promise.all([
      queryClient.fetchQuery(mfaReportQuery),
      getUsers(),
      // Colonne « Administrateur » : best-effort, le rapport reste utile sans elle
      queryClient.fetchQuery(adminReportQuery).catch(() => null),
    ]);
    if (!mfa.supported) {
      toast({ title: "État MFA indisponible", description: mfa.reason, variant: "destructive" });
      return;
    }
    const byId = new Map(list.map((u) => [u.id, u]));
    const adminIds = new Set(admins ? summarizeAdmins(admins.assignments).userIds : []);

    const rows = mfa.users
      .map((r) => {
        const u = byId.get(r.id);
        const enabled = u?.accountEnabled ?? r.accountEnabled;
        return {
          nom: r.displayName,
          upn: r.userPrincipalName,
          origine: MFA_ORIGIN_LABELS[mfaOrigin(r)],
          type: accountTypeLabel(u, r.userType),
          statut: enabled == null ? "" : enabled ? STATUS_ENABLED : STATUS_DISABLED,
          admin: admins ? yesNo(adminIds.has(r.id)) : "",
          mfa: r.mfaRegistered ? MFA_ON : MFA_OFF,
          methodes: r.methods.map(authMethodLabel).join(", "),
          defaut: r.defaultMethod ? authMethodLabel(r.defaultMethod) : "",
          sansMdp: yesNo(r.passwordlessCapable),
          maj: r.lastUpdated ? format(new Date(r.lastUpdated), "dd/MM/yyyy") : "",
          _enabled: enabled === true,
          _guest: mfaOrigin(r) === "guest",
        };
      })
      .sort((a, b) =>
        a.origine.localeCompare(b.origine) || a.mfa.localeCompare(b.mfa) || a.nom.localeCompare(b.nom, "fr"));

    const cols: XlsxColumn[] = [
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 34 },
      { header: "Origine", key: "origine", width: 10 },
      { header: "Type de compte", key: "type", width: 16 },
      ACCOUNT_STATUS_COL,
      { header: "Administrateur", key: "admin", width: 14 },
      { header: "MFA", key: "mfa", width: 10 },
      { header: "Méthodes enregistrées", key: "methodes", width: 50 },
      { header: "Méthode par défaut", key: "defaut", width: 26 },
      { header: "Sans mot de passe", key: "sansMdp", width: 16 },
      { header: "Mis à jour le", key: "maj", width: 14 },
    ];
    const enabledRows = mfa.users.filter((r) => byId.get(r.id)?.accountEnabled === true);
    const byOrigin = summarizeMfaByOrigin(mfa.users, byId);
    const internalAll = summarizeMfa(enabledRows.filter((r) => mfaOrigin(r) === "internal"));
    const enabledAll = summarizeMfa(enabledRows);
    const adminsWithoutMfa = rows.filter((r) => r.admin === "Oui" && r.mfa === MFA_OFF && r._enabled).length;
    const internalMissing = rows.filter((r) => r.mfa === MFA_OFF && r._enabled && !r._guest);
    const guestMissing = rows.filter((r) => r.mfa === MFA_OFF && r._enabled && r._guest);

    const synthese: XlsxSheet = {
      name: "Synthèse",
      columns: [
        { header: "Indicateur", key: "k", width: 58 },
        { header: "Valeur", key: "v", width: 70 },
      ],
      rows: [
        { k: "Source", v: mfa.source === "registrationDetails" ? "Rapport Entra « User registration details »" : "Méthodes d'authentification lues compte par compte (comptes activés)" },
        { k: "MFA internes (comptes utilisateurs actifs)", v: `${byOrigin.internal.enabled} / ${byOrigin.internal.total} (${byOrigin.internal.percent} %)` },
        { k: "MFA invités (invités activés)", v: `${byOrigin.guest.enabled} / ${byOrigin.guest.total} (${byOrigin.guest.percent} %)` },
        { k: "Écart internes − invités", v: `${byOrigin.internal.percent - byOrigin.guest.percent} points` },
        { k: "Administrateurs activés sans MFA", v: admins ? adminsWithoutMfa : "Rôles non lisibles" },
        { k: "Détail par origine", v: "Feuille « Internes vs invités »" },
        {
          k: "Note sur les invités",
          v: "Seules les méthodes enregistrées dans CE tenant sont visibles. Un invité qui fait son MFA dans son " +
            "tenant d'origine apparaît « Inactif » ici ; c'est attendu si les paramètres d'accès inter-locataires " +
            "font confiance au MFA du tenant d'origine.",
        },
        { k: "Généré le", v: format(new Date(mfa.generatedAt), "dd/MM/yyyy HH:mm") },
      ],
    };

    const compareRow = (origine: string, perimetre: string, s: ReturnType<typeof summarizeMfa>) => ({
      origine, perimetre, total: s.total, actif: s.enabled, inactif: s.disabled, pct: `${s.percent} %`,
    });
    const comparison: XlsxSheet = {
      name: "Internes vs invités",
      columns: [
        { header: "Origine", key: "origine", width: 12 },
        { header: "Périmètre", key: "perimetre", width: 62 },
        { header: "Comptes", key: "total", width: 10 },
        { header: "MFA actif", key: "actif", width: 11 },
        { header: "MFA inactif", key: "inactif", width: 12 },
        { header: "% MFA", key: "pct", width: 9 },
      ],
      rows: [
        compareRow("Interne", "Comptes utilisateurs actifs (membres activés et licenciés)", byOrigin.internal),
        compareRow("Interne", "Tous les comptes internes activés (y compris boîtes partagées, salles, comptes de service)", internalAll),
        compareRow("Invité", "Invités activés", byOrigin.guest),
        compareRow("Total", "Tous les comptes activés", enabledAll),
      ],
    };

    // ExcelJS ne retient que les clés déclarées en colonnes : _enabled / _guest n'apparaissent pas dans le fichier.
    await downloadXlsx(dl("rapport-mfa"), [
      synthese,
      comparison,
      { name: "Internes sans MFA", columns: cols, rows: internalMissing },
      { name: "Invités sans MFA", columns: cols, rows: guestMissing },
      { name: "Tous les comptes", columns: cols, rows },
    ]);
    toast({
      title: "Rapport généré",
      description:
        `MFA internes : ${byOrigin.internal.percent} % (${byOrigin.internal.enabled}/${byOrigin.internal.total}) · ` +
        `invités : ${byOrigin.guest.percent} % (${byOrigin.guest.enabled}/${byOrigin.guest.total})` +
        (adminsWithoutMfa > 0 ? ` — ${adminsWithoutMfa} administrateur(s) sans MFA.` : "."),
    });
  }

  // ── Comptes administrateurs ────────────────────────────────────────
  async function generateAdmins() {
    const [admins, mfa] = await Promise.all([
      queryClient.fetchQuery(adminReportQuery),
      // Colonne « MFA » : best-effort
      queryClient.fetchQuery(mfaReportQuery).catch(() => null),
    ]);
    const mfaById = new Map(
      mfa?.supported ? mfa.users.map((r) => [r.id, r.mfaRegistered]) : []
    );
    const mfaOf = (a: AdminAssignment) =>
      a.principalType !== "user" || !mfa?.supported
        ? ""
        : mfaById.has(a.principalId) ? (mfaById.get(a.principalId) ? MFA_ON : MFA_OFF) : "Inconnu";
    const statusOf = (a: AdminAssignment) =>
      a.accountEnabled == null ? "" : a.accountEnabled ? STATUS_ENABLED : STATUS_DISABLED;
    const kindLabel = (a: AdminAssignment) => (a.kind === "active" ? "Active" : "Éligible (PIM)");

    // Une ligne par compte : rôles regroupés
    const byPrincipal = new Map<string, AdminAssignment[]>();
    for (const a of admins.assignments) {
      // Les groupes portent le rôle mais leurs membres sont listés individuellement
      const list = byPrincipal.get(a.principalId) ?? [];
      list.push(a);
      byPrincipal.set(a.principalId, list);
    }
    const perAccount = [...byPrincipal.values()]
      .map((list) => {
        const a = list[0];
        const roles = [...new Set(list.map((x) => x.roleName))].sort((x, y) => x.localeCompare(y, "fr"));
        const kinds = new Set(list.map(kindLabel));
        const groupsVia = [...new Set(list.map((x) => x.viaGroup).filter((g): g is string => !!g))];
        return {
          nom: a.displayName,
          upn: a.userPrincipalName ?? "",
          typePrincipal: PRINCIPAL_TYPE_LABELS[a.principalType],
          statut: statusOf(a),
          mfa: mfaOf(a),
          critique: list.some((x) => isCriticalRole(x.roleTemplateId)) ? "Oui" : "Non",
          nbRoles: roles.length,
          roles: roles.join(", "),
          attribution: [...kinds].join(" + "),
          via: groupsVia.join(", "),
        };
      })
      .sort((x, y) => y.critique.localeCompare(x.critique) || x.nom.localeCompare(y.nom, "fr"));

    const detail = admins.assignments.map((a) => ({
      nom: a.displayName,
      upn: a.userPrincipalName ?? "",
      typePrincipal: PRINCIPAL_TYPE_LABELS[a.principalType],
      statut: statusOf(a),
      mfa: mfaOf(a),
      role: a.roleName,
      critique: isCriticalRole(a.roleTemplateId) ? "Oui" : "Non",
      attribution: kindLabel(a),
      via: a.viaGroup ?? "",
    }));

    const s = summarizeAdmins(admins.assignments);
    const userRows = perAccount.filter((r) => r.typePrincipal === PRINCIPAL_TYPE_LABELS.user);
    const withoutMfa = userRows.filter((r) => r.mfa === MFA_OFF && r.statut === STATUS_ENABLED).length;

    const baseCols: XlsxColumn[] = [
      { header: "Nom", key: "nom", width: 28 },
      { header: "UPN", key: "upn", width: 34 },
      { header: "Type", key: "typePrincipal", width: 13 },
      ACCOUNT_STATUS_COL,
      { header: "MFA", key: "mfa", width: 10 },
    ];
    await downloadXlsx(dl("rapport-administrateurs"), [
      {
        name: "Synthèse",
        columns: [
          { header: "Indicateur", key: "k", width: 52 },
          { header: "Valeur", key: "v", width: 40 },
        ],
        rows: [
          { k: "Comptes utilisateurs administrateurs", v: s.users },
          { k: "  dont administrateurs généraux", v: s.globalAdmins },
          { k: "  dont détenteurs d'un rôle critique", v: s.criticalUsers },
          { k: "  dont comptes désactivés (rôle à retirer)", v: s.disabledUsers },
          { k: "  dont comptes activés sans MFA", v: mfa?.supported ? withoutMfa : "État MFA indisponible" },
          { k: "Applications détenant un rôle", v: s.servicePrincipals },
          { k: "Attributions éligibles (PIM)", v: admins.eligibleSupported ? "Incluses" : "Non lisibles (licence P2 ou permission)" },
          { k: "Rôles critiques", v: "Administrateur général, de rôle privilégié, d'authentification privilégié, de la sécurité, de l'accès conditionnel" },
          { k: "Généré le", v: format(new Date(admins.generatedAt), "dd/MM/yyyy HH:mm") },
        ],
      },
      {
        name: "Par compte",
        columns: [
          ...baseCols,
          { header: "Rôle critique", key: "critique", width: 13 },
          { header: "Nb rôles", key: "nbRoles", width: 9 },
          { header: "Rôles", key: "roles", width: 60 },
          { header: "Attribution", key: "attribution", width: 22 },
          { header: "Via groupe", key: "via", width: 28 },
        ],
        rows: perAccount,
      },
      {
        name: "Attributions",
        columns: [
          ...baseCols,
          { header: "Rôle", key: "role", width: 38 },
          { header: "Rôle critique", key: "critique", width: 13 },
          { header: "Attribution", key: "attribution", width: 16 },
          { header: "Via groupe", key: "via", width: 28 },
        ],
        rows: detail,
      },
    ]);
    toast({
      title: "Rapport généré",
      description:
        `${s.users} administrateur(s), dont ${s.globalAdmins} administrateur(s) général(aux)` +
        (withoutMfa > 0 ? `, ${withoutMfa} sans MFA` : "") +
        (s.disabledUsers > 0 ? `, ${s.disabledUsers} désactivé(s)` : "") + ".",
    });
  }

  // Bouton de génération : activable ?
  const canGenerate =
    !!report &&
    !generating &&
    (report.pick === "tenant"
      ? true
      : needsPicker
        ? picked.size > 0
        : report.pick === "all-groups"
          ? !!groups && groups.length > 0
          : !!users && users.length > 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Rapports</h2>
        <p className="text-sm text-foreground/50 mt-0.5">
          Générez des exports Excel personnalisés. Chaque rapport produit une feuille <strong>consolidée</strong>{" "}
          plus une feuille par entité sélectionnée.
        </p>
      </div>

      {/* Catalogue */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const active = selected === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => selectReport(r.id)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-foreground/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm">{r.title}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary ml-auto" />}
              </div>
              <p className="text-xs text-foreground/50 leading-relaxed">{r.description}</p>
            </button>
          );
        })}
      </div>

      {/* Configuration */}
      {report && (
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <report.icon className="h-4 w-4 text-primary" />
              {report.title}
            </h3>
            <Button onClick={generate} disabled={!canGenerate}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              {generating ? "Génération…" : "Générer l'export"}
            </Button>
          </div>

          {needsPicker ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
                  <Input
                    placeholder={report.pick === "users" ? "Rechercher un utilisateur…" : "Rechercher…"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={selectAllFiltered} disabled={filteredOptions.length === 0}>
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Tout sélectionner{search ? " (filtré)" : ""}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
                  <X className="h-4 w-4 mr-1" />
                  Effacer
                </Button>
                <Badge variant="secondary" className="self-center">{picked.size} sélectionné(s)</Badge>
              </div>

              {pickerLoading ? (
                <div className="py-12"><Loader label="Chargement…" /></div>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
                  {filteredOptions.length === 0 ? (
                    <p className="text-sm text-foreground/40 text-center py-8">Aucun élément.</p>
                  ) : (
                    filteredOptions.slice(0, 500).map((o) => {
                      const on = picked.has(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => togglePick(o.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-foreground/5"
                        >
                          <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-foreground/30"}`}>
                            {on && <Check className="h-3 w-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{o.label}</span>
                            {o.sub && <span className="block text-xs text-foreground/40 truncate">{o.sub}</span>}
                          </span>
                        </button>
                      );
                    })
                  )}
                  {filteredOptions.length > 500 && (
                    <p className="text-xs text-foreground/40 text-center py-2">
                      {filteredOptions.length - 500} éléments supplémentaires masqués — affinez la recherche.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground/60">
              {report.pick === "tenant"
                ? "Ce rapport couvre tout le tenant ; les données sont lues dans Microsoft Entra à la génération."
                : report.pick === "all-groups"
                  ? `Ce rapport couvre tous les groupes et listes de distribution${groups ? ` (${groups.length})` : ""}.`
                  : `Ce rapport couvre tous les comptes utilisateurs${users ? ` (${users.length})` : ""}.`}
              {" "}Cliquez sur « Générer l'export ».
            </p>
          )}
        </div>
      )}

      {!report && (
        <p className="text-sm text-foreground/40">Sélectionnez un rapport ci-dessus pour le configurer.</p>
      )}
    </div>
  );
}

// Types de réponse des routes /api/reports/*
interface ReportMemberDto { id: string; displayName: string; mail: string | null; userPrincipalName: string | null; kind: string; }
interface MembersEntity { id: string; name: string; type: string; members: ReportMemberDto[]; error?: string; }
interface OwnerDto { id: string; displayName: string; mail: string | null; }
interface OwnersEntity { id: string; name: string; type: string; owners: OwnerDto[]; }
interface UserGroupDto { id: string; displayName: string; mail: string | null; groupTypes: string[]; mailEnabled: boolean; securityEnabled: boolean; }
interface UserGroupsEntity { id: string; name: string; upn: string; groups: UserGroupDto[]; error?: string; }

function groupKindLabel(g: UserGroupDto): string {
  if (g.groupTypes?.includes("Unified")) return "M365";
  if (g.mailEnabled && !g.securityEnabled) return "Distribution";
  return "Sécurité";
}
