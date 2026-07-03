"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { Loader } from "@/components/ui/loader";
import { GroupMembersSheet } from "@/components/groups/group-members-sheet";
import type { M365Group, GroupType } from "@/services/graph/groups";

interface GroupWithDisabledOwner {
  id: string;
  displayName: string;
  type: GroupType;
  mail: string | null;
  owners: { id: string; displayName: string; userPrincipalName: string | null }[];
}

const groupTypeLabels: Record<GroupType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  unified: { label: "Microsoft 365", variant: "default" },
  distribution: { label: "Distribution", variant: "secondary" },
  security: { label: "Sécurité", variant: "outline" },
  sharedMailbox: { label: "Boîte partagée", variant: "outline" },
};

export default function DisabledOwnersPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<(M365Group & { type: GroupType }) | null>(null);

  const { data, isLoading, error } = useQuery<GroupWithDisabledOwner[]>({
    queryKey: ["disabled-owners"],
    queryFn: () => apiFetch<GroupWithDisabledOwner[]>("/api/anomalies/disabled-owners"),
    staleTime: 5 * 60 * 1000,
  });

  const groups = (data ?? []).filter(
    (g) =>
      g.displayName.toLowerCase().includes(search.toLowerCase()) ||
      g.owners.some((o) => o.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  function openGroup(g: GroupWithDisabledOwner) {
    setSelected({
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
  }

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Propriétaires désactivés</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold">Groupes à propriétaire désactivé</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Groupes (Microsoft 365 / Sécurité) dont au moins un propriétaire est un compte désactivé —
            plus personne ne peut les gérer. Cliquez pour réattribuer la propriété.
          </p>
        </div>
        <Badge variant="secondary">{groups.length} groupe{groups.length > 1 ? "s" : ""}</Badge>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Rechercher un groupe ou un propriétaire..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <div className="py-16">
            <Loader label="Analyse des propriétaires…" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <th className="p-3 text-sm font-medium text-left">Groupe</th>
                <th className="p-3 text-sm font-medium text-left">Type</th>
                <th className="p-3 text-sm font-medium text-left">Propriétaire(s) désactivé(s)</th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow
                  key={g.id}
                  className="cursor-pointer hover:bg-foreground/5"
                  onClick={() => openGroup(g)}
                >
                  <TableCell className="font-medium">{g.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={groupTypeLabels[g.type].variant} className="text-xs">
                      {groupTypeLabels[g.type].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-wrap gap-1">
                      {g.owners.map((o) => (
                        <span
                          key={o.id}
                          className="inline-flex items-center rounded-full border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-xs text-red-700 dark:text-red-300"
                          title={o.userPrincipalName ?? undefined}
                        >
                          {o.displayName}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-foreground/40 py-8">
                    Aucun groupe avec un propriétaire désactivé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <GroupMembersSheet
        group={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
