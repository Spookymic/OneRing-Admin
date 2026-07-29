"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";
import type { M365User } from "@/services/graph/users";
import { UserGroupsSheet } from "@/components/users/user-groups-sheet";

interface InactiveUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  licenseCount: number;
  lastSignIn: string | null;
}

export default function InactiveUsersPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<M365User | null>(null);

  const { data, isLoading, error } = useQuery<{ supported: boolean; days: number; users: InactiveUser[] }>({
    queryKey: ["inactive-users"],
    queryFn: () => apiFetch<{ supported: boolean; days: number; users: InactiveUser[] }>("/api/anomalies/inactive-users"),
    staleTime: 10 * 60 * 1000,
  });

  // Liste complète des utilisateurs pour ouvrir la fiche au clic
  const { data: allUsers } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const users = (data?.users ?? []).filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  );

  const totalLicenses = (data?.users ?? []).reduce((s, u) => s + u.licenseCount, 0);

  function openUser(id: string) {
    const full = allUsers?.find((u) => u.id === id);
    if (full) setSelected(full);
  }

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Utilisateurs inactifs</h2>
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
          <h2 className="text-2xl font-bold">Utilisateurs inactifs</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Comptes actifs et licenciés sans connexion depuis &gt; {data?.days ?? 90} jours.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalLicenses > 0 && <Badge variant="secondary">≈ {totalLicenses} licence(s) récupérable(s)</Badge>}
          <ExportButton
            fileBase="onering-utilisateurs-inactifs"
            disabled={data?.supported === false}
            sheets={() => [{
              name: "Utilisateurs inactifs",
              columns: [
                { header: "Nom", key: "nom", width: 28 },
                { header: "UPN", key: "upn", width: 34 },
                { header: "Nb licences", key: "licences", width: 12 },
                { header: "Dernier accès", key: "acces", width: 16 },
              ],
              rows: users.map((u) => ({
                nom: u.displayName,
                upn: u.userPrincipalName,
                licences: u.licenseCount,
                acces: u.lastSignIn ? format(new Date(u.lastSignIn), "dd/MM/yyyy") : "jamais connecté",
              })),
            }]}
          />
        </div>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          Données de connexion indisponibles — une licence Microsoft Entra Premium (P1/P2) est requise pour <code>signInActivity</code>.
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Rechercher un utilisateur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <th className="p-3 text-sm font-medium text-left">Nom</th>
                  <th className="p-3 text-sm font-medium text-left">UPN</th>
                  <th className="p-3 text-sm font-medium text-left">Licences</th>
                  <th className="p-3 text-sm font-medium text-left">Dernier accès</th>
                  <th className="p-3 text-sm font-medium text-left">Ancienneté</th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="py-10"><Loader label="Chargement des utilisateurs inactifs…" /></div>
                        </TableCell>
                      </TableRow>
                    )
                  : users.map((u) => {
                      const created = allUsers?.find((x) => x.id === u.id)?.createdDateTime;
                      return (
                        <TableRow
                          key={u.id}
                          className="cursor-pointer hover:bg-foreground/5"
                          onClick={() => openUser(u.id)}
                        >
                          <TableCell className="font-medium">{u.displayName}</TableCell>
                          <TableCell className="text-sm text-gray-500 dark:text-gray-400">{u.userPrincipalName}</TableCell>
                          <TableCell className="text-sm">{u.licenseCount}</TableCell>
                          <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                            {u.lastSignIn
                              ? format(new Date(u.lastSignIn), "dd MMM yyyy", { locale: fr })
                              : "jamais connecté"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                            {created ? `il y a ${formatDistanceToNow(new Date(created), { locale: fr })}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                {!isLoading && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                      Aucun utilisateur inactif.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {selected && (
        <UserGroupsSheet
          user={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          initialTab="licenses"
        />
      )}
    </div>
  );
}
