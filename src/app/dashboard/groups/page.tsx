"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { M365Group, GroupType } from "@/services/graph/groups";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { GroupMembersSheet } from "@/components/groups/group-members-sheet";
import { useAdminSettings } from "@/lib/admin-settings";
import { apiFetch } from "@/lib/api";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import { ExportButton } from "@/components/ui/export-button";
import { usePagination } from "@/lib/use-pagination";
import { Pagination } from "@/components/ui/pagination";

type GroupWithType = M365Group & { type: GroupType };
type GroupSortCol = "displayName" | "type" | "mail";

const groupTypeLabels: Record<GroupType, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  unified: { label: "Microsoft 365", variant: "default" },
  distribution: { label: "Distribution", variant: "secondary" },
  security: { label: "Sécurité", variant: "outline" },
  sharedMailbox: { label: "Boîte partagée", variant: "outline" },
};

export default function GroupsPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<GroupType | "all">(
    (searchParams.get("type") as GroupType | null) ?? "all"
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithType | null>(null);
  const { settings } = useAdminSettings();

  useEffect(() => {
    const type = searchParams.get("type");
    if (type) setTypeFilter(type as GroupType | "all");
  }, [searchParams]);

  const { data: groups, isLoading, error } = useQuery<GroupWithType[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch<GroupWithType[]>("/api/groups"),
  });

  const filtered = groups?.filter((g) => {
    const matchSearch =
      g.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (g.mail ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || g.type === typeFilter;
    return matchSearch && matchType;
  });

  const getGroupSortVal = useCallback((g: GroupWithType, column: GroupSortCol): string => {
    switch (column) {
      case "displayName": return g.displayName;
      case "type":        return groupTypeLabels[g.type]?.label ?? g.type;
      case "mail":        return g.mail ?? "";
      default:            return "";
    }
  }, []);

  const { sorted, col: sortCol, dir: sortDir, toggle: toggleSort } = useSort<GroupWithType, GroupSortCol>(
    filtered ?? [],
    getGroupSortVal
  );

  const pagination = usePagination(sorted, 50);

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Groupes</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Groupes</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered?.length ?? 0} / {groups?.length ?? 0} groupes</Badge>
          <ExportButton
            fileBase="onering-groupes"
            disabled={!groups}
            sheets={() => [{
              name: "Groupes",
              columns: [
                { header: "Nom", key: "nom", width: 40 },
                { header: "Type", key: "type", width: 18 },
                { header: "Email", key: "mail", width: 36 },
              ],
              rows: sorted.map((g) => ({
                nom: g.displayName,
                type: groupTypeLabels[g.type]?.label ?? g.type,
                mail: g.mail ?? "",
              })),
            }]}
          />
          {!settings.hideGroupCreation && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Nouveau groupe
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Rechercher un groupe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as GroupType | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="unified">Microsoft 365</SelectItem>
            <SelectItem value="distribution">Distribution</SelectItem>
            <SelectItem value="security">Sécurité</SelectItem>
            <SelectItem value="sharedMailbox">Boîte partagée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Nom"   col="displayName" activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Type"  col="type"        activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Email" col="mail"        activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <div className="py-10"><Loader label="Chargement des groupes…" /></div>
                    </TableCell>
                  </TableRow>
                )
              : pagination.pageItems.map((group) => (
                  <TableRow
                    key={group.id}
                    className="cursor-pointer hover:bg-foreground/5"
                    onClick={() => setSelectedGroup(group)}
                  >
                    <TableCell className="font-medium">{group.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={groupTypeLabels[group.type].variant}>
                        {groupTypeLabels[group.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">{group.mail ?? "-"}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <GroupMembersSheet
        group={selectedGroup}
        open={selectedGroup !== null}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}
