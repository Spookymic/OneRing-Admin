"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useCallback } from "react";
import { Download, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import { useAdminSettings } from "@/lib/admin-settings";
import { useToast } from "@/hooks/use-toast";

// Doit rester aligné avec ROLLBACKABLE dans /api/audit/[id]/rollback
const ROLLBACKABLE = new Set([
  "LICENSE_ASSIGN", "LICENSE_REMOVE",
  "GROUP_MEMBER_ADD", "GROUP_MEMBER_REMOVE", "GROUP_OWNER_ADD", "GROUP_OWNER_REMOVE",
  "DL_MEMBER_ADD", "DL_MEMBER_REMOVE", "DL_OWNER_ADD", "DL_OWNER_REMOVE",
  "MAILBOX_PERMISSION_ADD", "MAILBOX_PERMISSION_REMOVE",
  "ACCOUNT_DISABLE", "ACCOUNT_ENABLE",
]);

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  GROUP_MEMBER_ADD:    { label: "Ajout membre",     variant: "default" },
  GROUP_MEMBER_REMOVE: { label: "Retrait membre",   variant: "destructive" },
  GROUP_OWNER_ADD:     { label: "Ajout owner",      variant: "default" },
  GROUP_OWNER_REMOVE:  { label: "Retrait owner",    variant: "destructive" },
  GROUP_CREATE:        { label: "Groupe créé",      variant: "secondary" },
  LICENSE_ASSIGN:      { label: "Licence assignée", variant: "default" },
  LICENSE_REMOVE:      { label: "Licence retirée",  variant: "destructive" },
  PASSWORD_RESET:      { label: "Réinit. MDP",      variant: "secondary" },
  ACCOUNT_DISABLE:     { label: "Compte désactivé", variant: "destructive" },
  ACCOUNT_ENABLE:      { label: "Compte réactivé",  variant: "default" },
  ROLE_ASSIGN:         { label: "Rôle attribué",    variant: "default" },
  ROLE_REMOVE:         { label: "Rôle retiré",      variant: "destructive" },
  OOO_UPDATE:          { label: "Absence mail",     variant: "secondary" },
  TEAMS_STATUS_UPDATE:   { label: "Statut Teams",     variant: "secondary" },
  ADMIN_SETTINGS_UPDATE: { label: "Paramètres admin", variant: "secondary" },
};

function buildDescription(log: {
  action: string;
  targetName: string;
  payloadBefore?: Record<string, any>;
  payloadAfter?: Record<string, any>;
}): string {
  const after = log.payloadAfter ?? {};
  const before = log.payloadBefore ?? {};

  switch (log.action) {
    case "GROUP_MEMBER_ADD":
      if (after.addedUserName)
        return `${after.addedUserName} ajouté au groupe « ${log.targetName} »`;
      if (after.groupName)
        return `${log.targetName} ajouté au groupe « ${after.groupName} »`;
      return `Membre ajouté au groupe « ${log.targetName} »`;

    case "GROUP_MEMBER_REMOVE":
      if (before.removedUserName)
        return `${before.removedUserName} retiré du groupe « ${log.targetName} »`;
      if (before.groupName)
        return `${log.targetName} retiré du groupe « ${before.groupName} »`;
      return `Membre retiré du groupe « ${log.targetName} »`;

    case "GROUP_OWNER_ADD":
      if (after.addedUserName)
        return `${after.addedUserName} ajouté comme owner de « ${log.targetName} »`;
      if (after.groupName)
        return `${log.targetName} ajouté comme owner de « ${after.groupName} »`;
      return `Owner ajouté dans « ${log.targetName} »`;

    case "GROUP_OWNER_REMOVE":
      if (before.removedUserName)
        return `${before.removedUserName} retiré comme owner de « ${log.targetName} »`;
      if (before.groupName)
        return `${log.targetName} retiré comme owner de « ${before.groupName} »`;
      return `Owner retiré de « ${log.targetName} »`;

    case "GROUP_CREATE":
      return `Groupe « ${log.targetName} » créé — type : ${after.groupType ?? "?"}`;

    case "LICENSE_ASSIGN": {
      const name = after.skuName ?? after.addedSkuId ?? "?";
      return `Licence « ${name} » assignée à ${log.targetName}`;
    }

    case "LICENSE_REMOVE": {
      const name = before.skuName ?? before.removedSkuId ?? "?";
      return `Licence « ${name} » retirée de ${log.targetName}`;
    }

    case "PASSWORD_RESET":
      return `MDP de ${log.targetName} réinitialisé — changement obligatoire à la prochaine connexion`;

    case "ACCOUNT_DISABLE":
      return `Compte de ${log.targetName} désactivé`;

    case "ACCOUNT_ENABLE":
      return `Compte de ${log.targetName} réactivé`;

    case "ROLE_ASSIGN": {
      const roleName = after.roleName ?? "?";
      return `Rôle « ${roleName} » attribué à ${log.targetName}`;
    }

    case "ROLE_REMOVE": {
      const roleName = before.roleName ?? after.roleName ?? "?";
      return `Rôle « ${roleName} » retiré de ${log.targetName}`;
    }

    case "OOO_UPDATE": {
      const status = after.status ?? "?";
      return `Absence mail mise à jour pour ${log.targetName} — statut : ${status}`;
    }

    case "TEAMS_STATUS_UPDATE":
      return `Message de statut Teams mis à jour pour ${log.targetName}`;

    case "ADMIN_SETTINGS_UPDATE": {
      const keys = Object.keys(log.payloadAfter ?? {});
      if (keys.length === 1) {
        const key = keys[0];
        const val = (log.payloadAfter as Record<string, unknown>)[key];
        return `Paramètre « ${key} » modifié → ${JSON.stringify(val)}`;
      }
      return `${keys.length} paramètre(s) d'interface modifiés`;
    }

    default:
      return log.targetName;
  }
}

type AuditSortCol = "createdAt" | "userUpn" | "action";

function exportAuditCSV(logs: any[]) {
  const header = "Date,Administrateur,Action,Détail";
  const rows = logs.map((log) => {
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      escape(format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: fr })),
      escape(log.userUpn ?? ""),
      escape(actionLabels[log.action]?.label ?? log.action ?? ""),
      escape(buildDescription(log)),
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historique-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const { settings } = useAdminSettings();
  const days = settings.auditRetentionDays;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: logs, isLoading, error } = useQuery<any[]>({
    queryKey: ["audit", days],
    queryFn: () => apiFetch<any[]>(`/api/audit${days > 0 ? `?days=${days}` : ""}`),
    refetchInterval: 30000,
  });

  const rollback = useMutation({
    mutationFn: (logId: string) => apiFetch<{ summary?: string }>(`/api/audit/${logId}/rollback`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(); // rafraîchit audit + utilisateurs/groupes/licences
      toast({ title: "Action annulée", description: data?.summary });
    },
    onError: (err: any) => {
      const description =
        err.message === "exchange_forbidden"
          ? "Un rôle Exchange Administrator est requis."
          : err.message;
      toast({ title: "Échec de l'annulation", description, variant: "destructive" });
    },
  });

  function handleRollback(log: any) {
    if (window.confirm(`Annuler cette action : « ${buildDescription(log)} » ?\nL'opération inverse sera exécutée et journalisée.`)) {
      rollback.mutate(log.id);
    }
  }

  const getAuditSortVal = useCallback((log: any, column: AuditSortCol): string => {
    switch (column) {
      case "createdAt": return log.createdAt ?? "";
      case "userUpn":   return log.userUpn ?? "";
      case "action":    return actionLabels[log.action]?.label ?? log.action ?? "";
      default:          return "";
    }
  }, []);

  const { sorted, col: sortCol, dir: sortDir, toggle: toggleSort } = useSort<any, AuditSortCol>(
    logs ?? [],
    getAuditSortVal
  );

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Historique des modifications</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Historique des modifications</h2>
          {days > 0 && (
            <p className="text-xs text-foreground/40 mt-0.5">Affichage limité aux {days} derniers jours</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{logs?.length ?? 0} entrées</Badge>
          {logs && logs.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportAuditCSV(logs)}>
              <Download className="h-4 w-4 mr-1" />
              Exporter CSV
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Date"           col="createdAt" activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Administrateur" col="userUpn"   activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Action"         col="action"    activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <th className="p-3 text-sm font-medium">Détail</th>
              <th className="p-3 text-sm font-medium w-10"></th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : sorted.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {format(new Date(log.createdAt), "dd MMM yyyy HH:mm", { locale: fr })}
                    </TableCell>
                    <TableCell className="text-sm">{log.userUpn}</TableCell>
                    <TableCell>
                      <Badge variant={actionLabels[log.action]?.variant ?? "outline"}>
                        {actionLabels[log.action]?.label ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                      {buildDescription(log)}
                    </TableCell>
                    <TableCell className="text-right">
                      {ROLLBACKABLE.has(log.action) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-foreground/50 hover:text-primary"
                          onClick={() => handleRollback(log)}
                          disabled={rollback.isPending}
                          title="Annuler cette action (rollback)"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!isLoading && logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                  Aucune modification enregistrée
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
