"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  GROUP_MEMBER_ADD: { label: "Ajout membre", variant: "default" },
  GROUP_MEMBER_REMOVE: { label: "Retrait membre", variant: "destructive" },
  LICENSE_ASSIGN: { label: "Licence assignée", variant: "default" },
  LICENSE_REMOVE: { label: "Licence retirée", variant: "destructive" },
  PASSWORD_RESET: { label: "Réinit. MDP", variant: "secondary" },
};

export default function AuditPage() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["audit"],
    queryFn: () => fetch("/api/audit").then((r) => r.json()),
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Historique des modifications</h2>
        <Badge variant="secondary">{logs?.length ?? 0} entrées</Badge>
      </div>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Administrateur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Cible</TableHead>
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
              : logs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(log.createdAt), "dd MMM yyyy HH:mm", { locale: fr })}
                    </TableCell>
                    <TableCell className="text-sm">{log.userUpn}</TableCell>
                    <TableCell>
                      <Badge variant={actionLabels[log.action]?.variant ?? "outline"}>
                        {actionLabels[log.action]?.label ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{log.targetName}</div>
                      <div className="text-gray-400 text-xs">{log.targetType}</div>
                    </TableCell>
                  </TableRow>
                ))}
            {!isLoading && logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">
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
