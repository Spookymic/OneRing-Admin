"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { Trash2, AlertTriangle, Users } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";
import { useToast } from "@/hooks/use-toast";
import type { DelegationType } from "@/services/exchange/shared-mailboxes";

interface OrphanDelegation {
  mailbox: string;
  mailboxMail: string;
  type: DelegationType;
  sid: string;
  deletedName: string | null;
  deletedDate: string | null;
}

const typeLabels: Record<DelegationType, string> = {
  fullAccess: "Accès complet",
  sendAs: "Envoyer en tant que",
  sendOnBehalf: "Envoyer de la part de",
};

export default function OrphanDelegationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ supported: boolean; orphans: OrphanDelegation[] }>({
    queryKey: ["orphan-delegations"],
    queryFn: () => apiFetch("/api/anomalies/orphan-delegations"),
    staleTime: 10 * 60 * 1000,
  });

  const cleanup = useMutation({
    mutationFn: (o: OrphanDelegation) =>
      apiFetch(`/api/mailboxes/${encodeURIComponent(o.mailboxMail)}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: o.sid, type: o.type, action: "remove" }),
      }),
    onSuccess: (_res, o) => {
      // Retire la ligne nettoyée sans relancer le scan complet.
      queryClient.setQueryData<{ supported: boolean; orphans: OrphanDelegation[] }>(
        ["orphan-delegations"],
        (prev) =>
          prev
            ? { ...prev, orphans: prev.orphans.filter((x) => !(x.mailboxMail === o.mailboxMail && x.type === o.type && x.sid === o.sid)) }
            : prev
      );
      toast({ title: "Délégation orpheline retirée" });
    },
    onError: (err: any) => {
      const description = err.message === "exchange_forbidden" ? "Un rôle Exchange Administrator est requis." : err.message;
      toast({ title: "Erreur", description, variant: "destructive" });
    },
  });

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Délégations orphelines</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  const orphans = data?.orphans ?? [];

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-2xl font-bold">Délégations orphelines</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Permissions de boîtes partagées (accès complet, envoyer en tant que / de la part de) détenues par
            un <strong>compte supprimé</strong> encore référencé (SID non résolu). Nettoyez-les pour lever ces accès résiduels.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ExportButton
            fileBase="onering-delegations-orphelines"
            disabled={data?.supported === false}
            sheets={() => [{
              name: "Délégations orphelines",
              columns: [
                { header: "Boîte partagée", key: "boite", width: 30 },
                { header: "Email", key: "mail", width: 34 },
                { header: "Permission", key: "perm", width: 22 },
                { header: "Compte supprimé", key: "compte", width: 28 },
                { header: "SID", key: "sid", width: 46 },
                { header: "Supprimé le", key: "supp", width: 14 },
              ],
              rows: orphans.map((o) => ({
                boite: o.mailbox,
                mail: o.mailboxMail,
                perm: typeLabels[o.type],
                compte: o.deletedName || "Compte supprimé (inconnu)",
                sid: o.sid,
                supp: o.deletedDate ? format(new Date(o.deletedDate), "dd/MM/yyyy") : "",
              })),
            }]}
          />
          <Link
            href="/dashboard/deleted-accounts"
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Users className="h-4 w-4" />
            Comptes supprimés
          </Link>
        </div>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Pont Exchange indisponible
          </div>
          <p className="text-xs">Cette analyse nécessite le service <code>exo-bridge</code> configuré.</p>
        </div>
      ) : isLoading ? (
        <div className="rounded-md border bg-card py-16">
          <Loader label="Analyse de toutes les boîtes partagées…" />
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <th className="p-3 text-sm font-medium text-left">Boîte partagée</th>
                <th className="p-3 text-sm font-medium text-left">Permission</th>
                <th className="p-3 text-sm font-medium text-left">Compte supprimé</th>
                <th className="p-3 text-sm font-medium text-right">Action</th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orphans.map((o) => (
                <TableRow key={`${o.mailboxMail}-${o.type}-${o.sid}`}>
                  <TableCell>
                    <p className="text-sm font-medium">{o.mailbox}</p>
                    <p className="text-xs text-foreground/40">{o.mailboxMail}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{typeLabels[o.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{o.deletedName || "Compte supprimé (inconnu)"}</p>
                    <p className="text-xs text-foreground/40">
                      {o.deletedDate ? `supprimé le ${format(new Date(o.deletedDate), "dd/MM/yyyy")} · ` : ""}
                      SID {o.sid}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40 h-7"
                      onClick={() => cleanup.mutate(o)}
                      disabled={cleanup.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Nettoyer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orphans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-foreground/40 py-8">
                    Aucune délégation orpheline détectée. 🎉
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
