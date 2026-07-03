"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";

interface DeletedUser {
  id: string;
  displayName: string;
  userPrincipalName: string | null;
  sid: string | null;
  onPremSid: string | null;
  deletedDateTime: string | null;
}

const RETENTION_DAYS = 30;

function daysLeft(deletedDateTime: string | null): number | null {
  if (!deletedDateTime) return null;
  const elapsed = (Date.now() - new Date(deletedDateTime).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
}

export default function DeletedAccountsPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ supported: boolean; users: DeletedUser[] }>({
    queryKey: ["deleted-users"],
    queryFn: () => apiFetch("/api/directory/deleted-users"),
    staleTime: 5 * 60 * 1000,
  });

  const users = (data?.users ?? [])
    .filter(
      (u) =>
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (u.userPrincipalName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.sid ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.onPremSid ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.deletedDateTime ?? "").localeCompare(a.deletedDateTime ?? ""));

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Comptes supprimés</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-2xl font-bold">Comptes supprimés</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Corbeille Azure AD : comptes supprimés il y a moins de {RETENTION_DAYS} jours (purgés définitivement ensuite),
            avec leur SID — utile pour identifier les délégations orphelines.
          </p>
        </div>
        <Link
          href="/dashboard/orphan-delegations"
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ShieldAlert className="h-4 w-4" />
          Délégations orphelines
        </Link>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Corbeille indisponible
          </div>
          <p className="text-xs">Lecture des objets supprimés refusée (permission d&apos;annuaire manquante).</p>
        </div>
      ) : (
        <>
          <div className="flex gap-3 my-4">
            <Input
              placeholder="Rechercher (nom, UPN, SID)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Badge variant="secondary" className="self-center">{users.length}</Badge>
          </div>

          <div className="rounded-md border bg-card">
            {isLoading ? (
              <div className="py-16"><Loader label="Lecture de la corbeille…" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <th className="p-3 text-sm font-medium text-left">Nom</th>
                    <th className="p-3 text-sm font-medium text-left">UPN</th>
                    <th className="p-3 text-sm font-medium text-left">SID</th>
                    <th className="p-3 text-sm font-medium text-left">Supprimé le</th>
                    <th className="p-3 text-sm font-medium text-left">Purge dans</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const left = daysLeft(u.deletedDateTime);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.displayName}</TableCell>
                        <TableCell className="text-sm text-foreground/50">{u.userPrincipalName ?? "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-foreground/50 break-all">
                          {u.onPremSid || u.sid || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground/50">
                          {u.deletedDateTime ? format(new Date(u.deletedDateTime), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {left === null ? "—" : (
                            <span className={left <= 5 ? "text-red-600 dark:text-red-400 font-medium" : "text-foreground/60"}>
                              {left} j
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-foreground/40 py-8">
                        Aucun compte dans la corbeille.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
