"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import type { M365User } from "@/services/graph/users";
import { UserGroupsSheet } from "@/components/users/user-groups-sheet";
import { Loader } from "@/components/ui/loader";

interface InactiveGuest {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  createdDateTime: string | null;
  lastSignIn: string | null;
}

export default function InactiveGuestsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<M365User | null>(null);

  const { data, isLoading, error } = useQuery<{ supported: boolean; days: number; guests: InactiveGuest[] }>({
    queryKey: ["inactive-guests"],
    queryFn: () => apiFetch<{ supported: boolean; days: number; guests: InactiveGuest[] }>("/api/anomalies/inactive-guests"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: allUsers } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const guests = (data?.guests ?? []).filter(
    (g) =>
      g.displayName.toLowerCase().includes(search.toLowerCase()) ||
      g.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  );

  function openUser(id: string) {
    const full = allUsers?.find((u) => u.id === id);
    if (full) setSelected(full);
  }

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Invités inactifs</h2>
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
          <h2 className="text-2xl font-bold">Invités inactifs</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Comptes invités sans connexion depuis &gt; {data?.days ?? 90} jours — candidats au nettoyage.
          </p>
        </div>
        <Badge variant="secondary">{guests.length} invité{guests.length > 1 ? "s" : ""}</Badge>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          Données de connexion indisponibles — une licence Microsoft Entra Premium (P1/P2) est requise pour <code>signInActivity</code>.
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Rechercher un invité..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border bg-card">
            {isLoading ? (
              <div className="py-16">
                <Loader label="Chargement des invités…" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <th className="p-3 text-sm font-medium text-left">Nom</th>
                    <th className="p-3 text-sm font-medium text-left">UPN</th>
                    <th className="p-3 text-sm font-medium text-left">Dernier accès</th>
                    <th className="p-3 text-sm font-medium text-left">Ancienneté</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guests.map((g) => (
                    <TableRow
                      key={g.id}
                      className="cursor-pointer hover:bg-foreground/5"
                      onClick={() => openUser(g.id)}
                    >
                      <TableCell className="font-medium">{g.displayName}</TableCell>
                      <TableCell className="text-sm text-foreground/50">{g.userPrincipalName}</TableCell>
                      <TableCell className="text-sm text-foreground/50">
                        {g.lastSignIn ? format(new Date(g.lastSignIn), "dd MMM yyyy", { locale: fr }) : "jamais connecté"}
                      </TableCell>
                      <TableCell className="text-sm text-foreground/50">
                        {g.createdDateTime ? `il y a ${formatDistanceToNow(new Date(g.createdDateTime), { locale: fr })}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {guests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-foreground/40 py-8">
                        Aucun invité inactif.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
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
