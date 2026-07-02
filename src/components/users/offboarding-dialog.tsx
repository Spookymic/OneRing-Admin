"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { M365User, M365UserGroup } from "@/services/graph/users";
import { apiFetch } from "@/lib/api";

interface Props {
  user: M365User;
  open: boolean;
  onClose: () => void;
}

export function OffboardingDialog({ user, open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [convertToShared, setConvertToShared] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: groups } = useQuery<M365UserGroup[]>({
    queryKey: ["user-groups", user.id],
    queryFn: () => apiFetch<M365UserGroup[]>(`/api/users/${user.id}/groups`),
    enabled: open,
  });

  const licenseCount = user.assignedLicenses.length;
  const groupCount = groups?.length ?? 0;

  async function handleOffboard() {
    setLoading(true);
    try {
      const res = await apiFetch<{ converted: boolean; licensesRemoved: number; groupsRemoved: number; errors: string[] }>(
        `/api/users/${user.id}/offboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ convertToShared }),
        }
      );
      queryClient.invalidateQueries();
      const parts = [
        `${res.licensesRemoved} licence(s) retirée(s)`,
        `${res.groupsRemoved} groupe(s)`,
        res.converted ? "boîte convertie" : null,
        "compte désactivé",
      ].filter(Boolean).join(" · ");
      if (res.errors.length > 0) {
        toast({
          title: "Offboarding partiel",
          description: `${parts}. ${res.errors.length} erreur(s) : ${res.errors[0]}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Offboarding terminé", description: parts });
      }
      onClose();
    } catch (err: any) {
      const description =
        err.message === "exchange_forbidden"
          ? "Un rôle Exchange Administrator est requis (conversion / listes de distribution)."
          : err.message;
      toast({ title: "Échec de l'offboarding", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Offboarder {user.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Cette opération est <span className="font-medium">irréversible en bloc</span>. Elle va :
            <ul className="list-disc list-inside mt-1.5 space-y-0.5">
              <li>retirer <span className="font-medium">{licenseCount}</span> licence(s)</li>
              <li>retirer l&apos;utilisateur de <span className="font-medium">{groupCount}</span> groupe(s)</li>
              <li>désactiver le compte</li>
              {convertToShared && <li>convertir la boîte en <span className="font-medium">boîte partagée</span></li>}
            </ul>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={convertToShared}
              onChange={(e) => setConvertToShared(e.target.checked)}
              className="h-4 w-4 mt-0.5 accent-primary"
            />
            <span>
              Convertir la boîte aux lettres en <span className="font-medium">boîte partagée</span>
              <span className="block text-xs text-foreground/50">
                Conserve les e-mails accessibles en délégation, sans licence (nécessite un rôle Exchange).
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={handleOffboard}
            disabled={loading}
          >
            {loading ? "Traitement..." : "Offboarder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
