"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
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
        <div className="rounded-md border bg-red-50 border-red-200 p-4 text-red-700 text-sm">
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
          <p className="text-sm text-[#01031B]/50 mt-0.5">
            Comptes actifs et licenciés sans connexion depuis &gt; {data?.days ?? 90} jours.
          </p>
        </div>
        {totalLicenses > 0 && <Badge variant="secondary">≈ {totalLicenses} licence(s) récupérable(s)</Badge>}
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 border-amber-200 p-4 text-amber-700 text-sm">
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
          <div className="rounded-md border bg-white">
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
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : users.map((u) => {
                      const created = allUsers?.find((x) => x.id === u.id)?.createdDateTime;
                      return (
                        <TableRow
                          key={u.id}
                          className="cursor-pointer hover:bg-[#01031B]/5"
                          onClick={() => openUser(u.id)}
                        >
                          <TableCell className="font-medium">{u.displayName}</TableCell>
                          <TableCell className="text-sm text-gray-500">{u.userPrincipalName}</TableCell>
                          <TableCell className="text-sm">{u.licenseCount}</TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {u.lastSignIn
                              ? format(new Date(u.lastSignIn), "dd MMM yyyy", { locale: fr })
                              : "jamais connecté"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
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
