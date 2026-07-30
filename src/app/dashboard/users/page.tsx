"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader } from "@/components/ui/loader";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Columns, Phone, UserPlus } from "lucide-react";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import { usePagination } from "@/lib/use-pagination";
import { Pagination } from "@/components/ui/pagination";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { M365User } from "@/services/graph/users";
import { detectAccountType, ACCOUNT_TYPE_CONFIG, type AccountType } from "@/lib/account-types";
import { useAdminSettings } from "@/lib/admin-settings";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { UserGroupsSheet } from "@/components/users/user-groups-sheet";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type StatusFilter = "all" | "active" | "disabled";

type ColumnId =
  | "name" | "email" | "department" | "office" | "type" | "status"
  | "licenses" | "phone" | "jobTitle" | "created";

const COLUMN_DEFS: { id: ColumnId; label: string; defaultVisible: boolean }[] = [
  { id: "name",       label: "Nom",         defaultVisible: true },
  { id: "email",      label: "Email / UPN", defaultVisible: true },
  { id: "jobTitle",   label: "Fonction",    defaultVisible: false },
  { id: "department", label: "Département", defaultVisible: true },
  { id: "office",     label: "Bureau",      defaultVisible: true },
  { id: "phone",      label: "Téléphone",   defaultVisible: false },
  { id: "type",       label: "Type",        defaultVisible: true },
  { id: "status",     label: "Statut",      defaultVisible: true },
  { id: "licenses",   label: "Licences",    defaultVisible: true },
  { id: "created",    label: "Créé le",     defaultVisible: false },
];

const COLUMNS_STORAGE_KEY = "onering-visible-columns";
const PAGE_SIZE_STORAGE_KEY = "onering-users-page-size";

export default function UsersPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.get("status") as StatusFilter | null) ?? "all"
  );
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType | "all">(
    (searchParams.get("type") as AccountType | null) ?? "all"
  );
  const [deptFilter, setDeptFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<M365User | null>(null);
  const [resetUser, setResetUser] = useState<M365User | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkOffboardOpen, setBulkOffboardOpen] = useState(false);
  const [bulkConvert, setBulkConvert] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(
    () => new Set(COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.id))
  );

  // Load persisted columns from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnId[];
        setVisibleColumns(new Set(parsed));
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync filters from URL params (e.g. navigating from dashboard)
  useEffect(() => {
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    if (type) setAccountTypeFilter(type as AccountType | "all");
    if (status) setStatusFilter(status as StatusFilter);
  }, [searchParams]);

  const { settings } = useAdminSettings();

  const { data: users, isLoading, error } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const departments = useMemo(() => {
    const set = new Set<string>();
    users?.forEach((u) => { if (u.department) set.add(u.department); });
    return Array.from(set).sort();
  }, [users]);

  const filtered = users?.filter((u) => {
    const matchSearch =
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase()) ||
      (u.officeLocation ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.jobTitle ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && u.accountEnabled) ||
      (statusFilter === "disabled" && !u.accountEnabled);
    const matchType =
      accountTypeFilter === "all" ||
      detectAccountType(u, settings.customRoomPatterns, settings.customEquipmentPatterns) === accountTypeFilter;
    const matchDept =
      deptFilter === "all" || u.department === deptFilter;
    return matchSearch && matchStatus && matchType && matchDept;
  });

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const col = (id: ColumnId) => visibleColumns.has(id);
  const getPhone = (user: M365User) =>
    user.mobilePhone ?? user.businessPhones?.[0] ?? "-";

  const getSortVal = useCallback((u: M365User, column: ColumnId): string | number | null => {
    switch (column) {
      case "name":       return u.displayName;
      case "email":      return u.userPrincipalName;
      case "jobTitle":   return u.jobTitle ?? "";
      case "department": return u.department ?? "";
      case "office":     return u.officeLocation ?? "";
      case "phone":      return u.mobilePhone ?? u.businessPhones?.[0] ?? "";
      case "type":       return detectAccountType(u, settings.customRoomPatterns, settings.customEquipmentPatterns);
      case "status":     return u.accountEnabled ? 1 : 0;
      case "licenses":   return u.assignedLicenses.length;
      case "created":    return u.createdDateTime ?? "";
      default:           return null;
    }
  }, [settings.customRoomPatterns, settings.customEquipmentPatterns]);

  const { sorted, col: sortCol, dir: sortDir, toggle: toggleSort } = useSort<M365User, ColumnId>(
    filtered ?? [],
    getSortVal
  );

  const pagination = usePagination(sorted, 50);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      if (saved) pagination.setPageSize(Number(saved));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handlePageSizeChange = (size: number) => {
    pagination.setPageSize(size);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      // ignore
    }
  };

  // ── Sélection multiple / actions groupées ──────────────────────────
  const allSelected = sorted.length > 0 && sorted.every((u) => selectedIds.has(u.id));
  function toggleSelectAll() {
    setSelectedIds((prev) =>
      sorted.length > 0 && sorted.every((u) => prev.has(u.id)) ? new Set() : new Set(sorted.map((u) => u.id))
    );
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function bulkRemoveLicenses() {
    const targets = (users ?? []).filter((u) => selectedIds.has(u.id) && u.assignedLicenses.length > 0);
    if (targets.length === 0) { toast({ title: "Aucune licence à retirer sur la sélection" }); return; }
    if (!window.confirm(`Retirer TOUTES les licences de ${targets.length} compte(s) ? Action journalisée.`)) return;
    setBulkBusy(true);
    let done = 0, errors = 0;
    for (const u of targets) {
      for (const lic of u.assignedLicenses) {
        try {
          await apiFetch(`/api/licenses/${u.id}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skuId: lic.skuId, action: "remove" }),
          });
        } catch { errors++; }
      }
      done++; setBulkProgress(`${done}/${targets.length}`);
    }
    setBulkBusy(false); setBulkProgress(""); setSelectedIds(new Set());
    queryClient.invalidateQueries();
    toast(errors
      ? { title: "Retrait partiel", description: `${errors} erreur(s)`, variant: "destructive" }
      : { title: "Licences retirées", description: `${targets.length} compte(s) traité(s)` });
  }

  async function bulkOffboard() {
    const ids = [...selectedIds];
    setBulkOffboardOpen(false); setBulkBusy(true);
    let done = 0, errors = 0;
    for (const id of ids) {
      try {
        await apiFetch(`/api/users/${id}/offboard`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ convertToShared: bulkConvert }),
        });
      } catch { errors++; }
      done++; setBulkProgress(`${done}/${ids.length}`);
    }
    setBulkBusy(false); setBulkProgress(""); setSelectedIds(new Set()); setBulkConvert(false);
    queryClient.invalidateQueries();
    toast(errors
      ? { title: "Offboarding partiel", description: `${errors} erreur(s) sur ${ids.length}`, variant: "destructive" }
      : { title: "Offboarding terminé", description: `${ids.length} compte(s) offboardé(s)` });
  }

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Utilisateurs</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Utilisateurs</h2>
        <div className="flex items-center gap-3">
          {settings.showAddUser && (
            <Button size="sm" onClick={() => window.open("https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers", "_blank")}>
              <UserPlus className="h-4 w-4 mr-2" />
              Nouvel utilisateur
            </Button>
          )}
          <ExportButton
            fileBase="onering-utilisateurs"
            disabled={!users}
            sheets={() => [{
              name: "Utilisateurs",
              columns: [
                { header: "Nom", key: "nom", width: 28 },
                { header: "Email / UPN", key: "upn", width: 34 },
                { header: "Fonction", key: "fonction", width: 24 },
                { header: "Département", key: "dept", width: 20 },
                { header: "Bureau", key: "bureau", width: 16 },
                { header: "Téléphone", key: "tel", width: 18 },
                { header: "Type", key: "type", width: 16 },
                { header: "Statut", key: "statut", width: 12 },
                { header: "Nb licences", key: "licences", width: 12 },
                { header: "Créé le", key: "cree", width: 14 },
              ],
              rows: sorted.map((u) => ({
                nom: u.displayName,
                upn: u.userPrincipalName ?? u.mail ?? "",
                fonction: u.jobTitle ?? "",
                dept: u.department ?? "",
                bureau: u.officeLocation ?? "",
                tel: u.mobilePhone ?? u.businessPhones?.[0] ?? "",
                type: ACCOUNT_TYPE_CONFIG[detectAccountType(u)]?.label ?? detectAccountType(u),
                statut: u.accountEnabled ? "Actif" : "Désactivé",
                licences: u.assignedLicenses.length,
                cree: u.createdDateTime ? format(new Date(u.createdDateTime), "dd/MM/yyyy") : "",
              })),
            }]}
          />
          <Badge variant="secondary">
            {filtered?.length ?? 0} / {users?.length ?? 0} comptes
          </Badge>
        </div>
      </div>

      {/* Filtres + column picker */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Rechercher (nom, email, bureau, service…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={accountTypeFilter} onValueChange={(v) => setAccountTypeFilter(v as AccountType | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type de compte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="user">Utilisateur</SelectItem>
            <SelectItem value="guest">Invité</SelectItem>
            <SelectItem value="shared">Boîte partagée</SelectItem>
            <SelectItem value="room">Salle</SelectItem>
            <SelectItem value="equipment">Équipement</SelectItem>
            <SelectItem value="service">Compte service</SelectItem>
            <SelectItem value="disabled">Désactivé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="disabled">Désactivé</SelectItem>
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Département" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les départements</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sélecteur de colonnes */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none">
            <Columns className="h-4 w-4" />
            Colonnes
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMN_DEFS.map((colDef) => (
                <DropdownMenuCheckboxItem
                  key={colDef.id}
                  checked={visibleColumns.has(colDef.id)}
                  onClick={() => toggleColumn(colDef.id)}
                >
                  {colDef.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} sélectionné(s)</span>
          <Button size="sm" variant="outline" onClick={bulkRemoveLicenses} disabled={bulkBusy}>
            Retirer les licences
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkOffboardOpen(true)} disabled={bulkBusy}>
            Offboarder
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>
            Annuler la sélection
          </Button>
          {bulkBusy && <span className="text-xs text-foreground/60">Traitement… {bulkProgress}</span>}
        </div>
      )}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-primary align-middle"
                  aria-label="Tout sélectionner"
                />
              </th>
              {col("name")       && <SortableHead label="Nom"         col="name"       activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("email")      && <SortableHead label="Email"       col="email"      activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("jobTitle")   && <SortableHead label="Fonction"    col="jobTitle"   activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("department") && <SortableHead label="Département" col="department" activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("office")     && <SortableHead label="Bureau"      col="office"     activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("phone")      && <SortableHead label="Tél."        col="phone"      activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("type")       && <SortableHead label="Type"        col="type"       activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("status")     && <SortableHead label="Statut"      col="status"     activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("licenses")   && <SortableHead label="Licences"    col="licenses"   activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
              {col("created")    && <SortableHead label="Créé le"     col="created"    activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.size + 1}>
                      <div className="py-10"><Loader label="Chargement des utilisateurs…" /></div>
                    </TableCell>
                  </TableRow>
                )
              : pagination.pageItems.map((user) => {
                  const accountType = detectAccountType(
                    user,
                    settings.customRoomPatterns,
                    settings.customEquipmentPatterns
                  );
                  const typeCfg = ACCOUNT_TYPE_CONFIG[accountType];
                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-primary/5"
                      onClick={() => setSelectedUser(user)}
                    >
                      <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleSelect(user.id)}
                          className="h-4 w-4 accent-primary align-middle"
                          aria-label={`Sélectionner ${user.displayName}`}
                        />
                      </TableCell>
                      {col("name") && (
                        <TableCell className="font-medium">{user.displayName}</TableCell>
                      )}
                      {col("email") && (
                        <TableCell className="text-foreground/50 text-sm">{user.userPrincipalName}</TableCell>
                      )}
                      {col("jobTitle") && (
                        <TableCell className="text-sm">{user.jobTitle ?? "-"}</TableCell>
                      )}
                      {col("department") && (
                        <TableCell className="text-sm">{user.department ?? "-"}</TableCell>
                      )}
                      {col("office") && (
                        <TableCell className="text-sm">{user.officeLocation ?? "-"}</TableCell>
                      )}
                      {col("phone") && (
                        <TableCell className="text-sm">{getPhone(user)}</TableCell>
                      )}
                      {col("type") && (
                        <TableCell>
                          <Badge variant={typeCfg.variant} className="text-xs">
                            {typeCfg.label}
                          </Badge>
                        </TableCell>
                      )}
                      {col("status") && (
                        <TableCell>
                          <Badge variant={user.accountEnabled ? "default" : "destructive"}>
                            {user.accountEnabled ? "Actif" : "Désactivé"}
                          </Badge>
                        </TableCell>
                      )}
                      {col("licenses") && (
                        <TableCell>{user.assignedLicenses.length}</TableCell>
                      )}
                      {col("created") && (
                        <TableCell className="text-sm text-foreground/50 whitespace-nowrap">
                          {user.createdDateTime
                            ? format(new Date(user.createdDateTime), "dd MMM yyyy", { locale: fr })
                            : "-"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={handlePageSizeChange}
      />

      {selectedUser && (
        <UserGroupsSheet
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          onResetPassword={() => setResetUser(selectedUser)}
        />
      )}
      {resetUser && (
        <ResetPasswordDialog
          user={resetUser}
          open={!!resetUser}
          onClose={() => setResetUser(null)}
        />
      )}

      <Dialog open={bulkOffboardOpen} onOpenChange={(v) => { if (!v) setBulkOffboardOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Offboarder {selectedIds.size} compte(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 min-w-0">
            <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-700 dark:text-amber-300">
              Pour chaque compte : désactivation, retrait de toutes les licences et de toutes les
              appartenances aux groupes. Opération journalisée, non réversible en bloc.
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bulkConvert}
                onChange={(e) => setBulkConvert(e.target.checked)}
                className="h-4 w-4 mt-0.5 accent-primary"
              />
              <span>
                Convertir les boîtes en <span className="font-medium">boîtes partagées</span>
                <span className="block text-xs text-foreground/50">Nécessite un rôle Exchange Administrator.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOffboardOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={bulkOffboard}>Offboarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
