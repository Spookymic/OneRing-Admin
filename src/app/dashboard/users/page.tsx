"use client";

import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Columns, Phone, UserPlus } from "lucide-react";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { M365User } from "@/services/graph/users";
import { detectAccountType, ACCOUNT_TYPE_CONFIG, type AccountType } from "@/lib/account-types";
import { useAdminSettings } from "@/lib/admin-settings";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { UserGroupsSheet } from "@/components/users/user-groups-sheet";
import { apiFetch } from "@/lib/api";

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

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Utilisateurs</h2>
        <div className="rounded-md border bg-red-50 border-red-200 p-4 text-red-700 text-sm">
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

      <div className="rounded-md border bg-white overflow-x-auto">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
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
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: visibleColumns.size }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : sorted.map((user) => {
                  const accountType = detectAccountType(
                    user,
                    settings.customRoomPatterns,
                    settings.customEquipmentPatterns
                  );
                  const typeCfg = ACCOUNT_TYPE_CONFIG[accountType];
                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-[#D8346E]/5"
                      onClick={() => setSelectedUser(user)}
                    >
                      {col("name") && (
                        <TableCell className="font-medium">{user.displayName}</TableCell>
                      )}
                      {col("email") && (
                        <TableCell className="text-[#01031B]/50 text-sm">{user.userPrincipalName}</TableCell>
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
                        <TableCell className="text-sm text-[#01031B]/50 whitespace-nowrap">
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
    </div>
  );
}
