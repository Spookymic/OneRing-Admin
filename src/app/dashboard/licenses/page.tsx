"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader } from "@/components/ui/loader";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Users, UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { M365User } from "@/services/graph/users";
import type { SubscribedSku } from "@/services/graph/licenses";
import { getSkuFriendlyName } from "@/lib/license-names";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";

export default function LicensesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedSku, setSelectedSku] = useState<SubscribedSku | null>(null);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");

  const { data: skus, isLoading: skusLoading } = useQuery<SubscribedSku[]>({
    queryKey: ["skus"],
    queryFn: () => apiFetch<SubscribedSku[]>("/api/licenses"),
  });

  const { data: users, isLoading: usersLoading } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
    enabled: !!selectedSku,
  });

  // Auto-open SKU from URL param (e.g. navigating from dashboard)
  useEffect(() => {
    const skuId = searchParams.get("sku");
    if (skuId && skus) {
      const sku = skus.find((s) => s.skuId === skuId);
      if (sku) {
        setSelectedSku(sku);
        router.replace("/dashboard/licenses");
      }
    }
  }, [searchParams, skus, router]);

  const mutation = useMutation({
    mutationFn: ({
      userId, skuId, skuName, action,
    }: { userId: string; skuId: string; skuName: string; action: "assign" | "remove" }) =>
      apiFetch(`/api/licenses/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuId, skuName, action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["skus"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Licence mise à jour" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const licensedUsers = selectedSku
    ? (users?.filter((u) => u.assignedLicenses.some((l) => l.skuId === selectedSku.skuId)) ?? [])
    : [];

  const filteredLicensed = licensedUsers.filter(
    (u) =>
      search === "" ||
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  );

  const unlicensedUsers = selectedSku
    ? (users
        ?.filter(
          (u) =>
            !u.assignedLicenses.some((l) => l.skuId === selectedSku.skuId) &&
            u.userType !== "Guest" &&
            u.accountEnabled &&
            (addSearch === "" ||
              u.displayName.toLowerCase().includes(addSearch.toLowerCase()) ||
              u.userPrincipalName.toLowerCase().includes(addSearch.toLowerCase()))
        )
        .slice(0, 10) ?? [])
    : [];

  const totalConsumed = skus?.reduce((a, s) => a + s.consumedUnits, 0) ?? 0;
  const totalEnabled = skus?.reduce((a, s) => a + s.prepaidUnits.enabled, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Licences</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Gestion des abonnements Microsoft 365
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            fileBase="onering-licences"
            disabled={!skus}
            sheets={() => [{
              name: "Licences",
              columns: [
                { header: "Licence", key: "licence", width: 42 },
                { header: "SKU", key: "sku", width: 28 },
                { header: "Consommées", key: "consommees", width: 12 },
                { header: "Total", key: "total", width: 10 },
                { header: "Disponibles", key: "dispo", width: 12 },
                { header: "% occupé", key: "pct", width: 10 },
              ],
              rows: (skus ?? []).map((s) => {
                const total = s.prepaidUnits.enabled;
                return {
                  licence: getSkuFriendlyName(s.skuPartNumber),
                  sku: s.skuPartNumber,
                  consommees: s.consumedUnits,
                  total,
                  dispo: Math.max(0, total - s.consumedUnits),
                  pct: total > 0 ? Math.round((s.consumedUnits / total) * 100) : 0,
                };
              }),
            }]}
          />
          {skus && (
            <Badge variant="secondary">
              {totalConsumed} / {totalEnabled} utilisées
            </Badge>
          )}
        </div>
      </div>

      {/* SKU cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {skusLoading
          ? (
              <div className="col-span-full py-10"><Loader label="Chargement des licences…" /></div>
            )
          : skus?.map((sku) => {
              const name = getSkuFriendlyName(sku.skuPartNumber);
              const total = sku.prepaidUnits.enabled;
              const pct = total > 0 ? Math.round((sku.consumedUnits / total) * 100) : 0;
              const isFull = sku.consumedUnits >= total && total > 0;
              const isSelected = selectedSku?.skuId === sku.skuId;

              return (
                <Card
                  key={sku.skuId}
                  className={`p-5 space-y-3 cursor-pointer hover:border-primary hover:shadow-sm transition-all ${
                    isSelected ? "border-primary shadow-sm bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    setSelectedSku(isSelected ? null : sku);
                    setSearch("");
                    setAddSearch("");
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{name}</p>
                    {isFull && (
                      <Badge variant="destructive" className="text-xs shrink-0">Complet</Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-foreground/50">
                      <span>{sku.consumedUnits} assigné{sku.consumedUnits !== 1 ? "s" : ""}</span>
                      <span>{total} dispo.</span>
                    </div>
                    <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFull ? "bg-destructive" : pct > 80 ? "bg-primary" : "bg-primary"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    className="w-full text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSku(isSelected ? null : sku);
                      setSearch("");
                      setAddSearch("");
                    }}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    Voir les bénéficiaires ({sku.consumedUnits})
                  </Button>
                </Card>
              );
            })}
      </div>

      {/* Side sheet — beneficiaries */}
      <Sheet open={!!selectedSku} onOpenChange={(open) => { if (!open) setSelectedSku(null); }}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-2xl overflow-y-auto p-0">
          {selectedSku && (
            <>
              <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="text-lg">
                  {getSkuFriendlyName(selectedSku.skuPartNumber)}
                </SheetTitle>
                <SheetDescription className="text-xs">{selectedSku.skuPartNumber}</SheetDescription>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs">
                    {selectedSku.consumedUnits} / {selectedSku.prepaidUnits.enabled} utilisées
                  </Badge>
                  {selectedSku.consumedUnits >= selectedSku.prepaidUnits.enabled &&
                    selectedSku.prepaidUnits.enabled > 0 && (
                      <Badge variant="destructive" className="text-xs">Complet</Badge>
                    )}
                </div>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Beneficiaries list */}
                <div>
                  <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4" />
                    Bénéficiaires ({licensedUsers.length})
                  </h3>
                  <Input
                    placeholder="Rechercher..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-3"
                  />
                  {usersLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : filteredLicensed.length === 0 ? (
                    <p className="text-sm text-foreground/40 text-center py-4">Aucun bénéficiaire</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {filteredLicensed.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.displayName}</p>
                            <p className="text-xs text-foreground/40 truncate">{u.userPrincipalName}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 dark:text-red-300 shrink-0 h-7 w-7 p-0 ml-2"
                            onClick={() =>
                              mutation.mutate({
                                userId: u.id,
                                skuId: selectedSku.skuId,
                                skuName: getSkuFriendlyName(selectedSku.skuPartNumber),
                                action: "remove",
                              })
                            }
                            disabled={mutation.isPending}
                            title="Retirer la licence"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Assign to user */}
                <div>
                  <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                    <UserPlus className="h-4 w-4" />
                    Assigner à un utilisateur
                  </h3>
                  {selectedSku.consumedUnits >= selectedSku.prepaidUnits.enabled &&
                    selectedSku.prepaidUnits.enabled > 0 ? (
                    <p className="text-sm text-red-500 text-center py-2">
                      Toutes les licences disponibles sont utilisées.
                    </p>
                  ) : (
                    <>
                      <Input
                        placeholder="Rechercher un utilisateur..."
                        value={addSearch}
                        onChange={(e) => setAddSearch(e.target.value)}
                        className="mb-2"
                      />
                      {addSearch && (
                        <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                          {usersLoading ? (
                            <p className="text-sm text-center py-3 text-foreground/40">Chargement...</p>
                          ) : unlicensedUsers.length === 0 ? (
                            <p className="text-sm text-center py-3 text-foreground/40">Aucun résultat</p>
                          ) : (
                            unlicensedUsers.map((u) => (
                              <div
                                key={u.id}
                                className="flex items-center justify-between px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                                  <p className="text-xs text-foreground/40 truncate">{u.userPrincipalName}</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 ml-2 shrink-0"
                                  onClick={() => {
                                    mutation.mutate({
                                      userId: u.id,
                                      skuId: selectedSku.skuId,
                                      skuName: getSkuFriendlyName(selectedSku.skuPartNumber),
                                      action: "assign",
                                    });
                                    setAddSearch("");
                                  }}
                                  disabled={mutation.isPending}
                                >
                                  Assigner
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
