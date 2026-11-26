"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { SECRET_REMOVE_CONFIRMATION } from "@/lib/app-security";
import type { UsageStatus } from "@/lib/credential-usage";
import { appErrorMessage } from "./app-errors";

export interface SecretToRemove {
  appObjectId: string;
  appName: string;
  keyId: string;
  name: string | null;
  lastUsed?: string | null;
  usage?: UsageStatus;
}

interface Props {
  secret: SecretToRemove | null;
  onClose: () => void;
}

/** Suppression d'un secret client — irréversible, confirmation renforcée (saisie de SUPPRIMER). */
export function RemoveSecretDialog({ secret, onClose }: Props) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  function close() {
    setTyped("");
    onClose();
  }

  async function handleRemove() {
    if (!secret) return;
    setLoading(true);
    try {
      await apiFetch(`/api/applications/${secret.appObjectId}/secrets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: secret.keyId, confirmation: typed }),
      });
      queryClient.invalidateQueries({ queryKey: ["all-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["expiring-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Secret supprimé", description: `« ${secret.name ?? secret.keyId} » a été supprimé de « ${secret.appName} ».` });
      close();
    } catch (err) {
      toast({ title: "Erreur", description: appErrorMessage((err as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const recentlyUsed = secret?.usage === "recent";

  return (
    <Dialog open={secret != null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer un secret</DialogTitle>
        </DialogHeader>
        {secret && (
          <div className="space-y-3 text-sm">
            <p>
              Secret <strong>« {secret.name ?? "(sans nom)"} »</strong> de l&apos;application{" "}
              <strong>« {secret.appName} »</strong>.
            </p>
            <p className="text-foreground/60">
              {secret.lastUsed
                ? `Dernière utilisation ${formatDistanceToNow(new Date(secret.lastUsed), { addSuffix: true, locale: fr })}.`
                : secret.usage === "unknown" || !secret.usage
                  ? "Dernière utilisation inconnue."
                  : "Aucune utilisation enregistrée par Microsoft."}
            </p>
            {recentlyUsed && (
              <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-red-700 dark:text-red-300">
                Ce secret a été utilisé récemment : le supprimer coupera probablement le service qui s&apos;en sert.
              </div>
            )}
            <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-800 dark:text-amber-300">
              Action <strong>irréversible</strong> : la valeur d&apos;un secret ne peut pas être recréée (aucun rollback).
              En cas d&apos;erreur, il faudra générer un nouveau secret et le reconfigurer dans le service concerné.
            </div>
            <label className="block space-y-1">
              <span>Pour confirmer, saisir <strong>{SECRET_REMOVE_CONFIRMATION}</strong> :</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={loading || typed !== SECRET_REMOVE_CONFIRMATION}
          >
            {loading ? "Suppression..." : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
