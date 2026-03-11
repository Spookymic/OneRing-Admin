"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { M365User } from "@/services/graph/users";
import type { SubscribedSku } from "@/services/graph/licenses";

export default function LicensesPage() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: usersLoading } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  const { data: skus } = useQuery<SubscribedSku[]>({
    queryKey: ["skus"],
    queryFn: () => fetch("/api/licenses").then((r) => r.json()),
  });

  const mutation = useMutation({
    mutationFn: ({ userId, skuId, action }: { userId: string; skuId: string; action: "assign" | "remove" }) =>
      fetch(`/api/licenses/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuId, action }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Licence mise à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const filtered = users?.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Licences</h2>
        {skus && (
          <div className="text-sm text-gray-500">
            {skus.length} SKU(s) disponible(s)
          </div>
        )}
      </div>
      <Input
        placeholder="Rechercher un utilisateur..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Licences actives</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered?.map((user) => {
                  const userSkuIds = user.assignedLicenses.map((l) => l.skuId);
                  const userSkuNames = skus
                    ?.filter((s) => userSkuIds.includes(s.skuId))
                    .map((s) => s.skuPartNumber) ?? [];

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-gray-500 text-xs">{user.userPrincipalName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {userSkuNames.length > 0
                            ? userSkuNames.map((name) => (
                                <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
                              ))
                            : <span className="text-gray-400 text-sm">Aucune</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {skus?.map((sku) => {
                            const assigned = userSkuIds.includes(sku.skuId);
                            return (
                              <Button
                                key={sku.skuId}
                                size="sm"
                                variant={assigned ? "destructive" : "outline"}
                                className="text-xs h-7"
                                onClick={() =>
                                  mutation.mutate({
                                    userId: user.id,
                                    skuId: sku.skuId,
                                    action: assigned ? "remove" : "assign",
                                  })
                                }
                                disabled={mutation.isPending}
                              >
                                {assigned ? "Retirer" : "Assigner"} {sku.skuPartNumber}
                              </Button>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
