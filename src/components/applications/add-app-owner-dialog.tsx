"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import type { M365User } from "@/services/graph/users";
import { appErrorMessage } from "./app-errors";

interface Props {
  app: { id: string; displayName: string } | null;
  onClose: () => void;
}

/** Désigne un utilisateur propriétaire d'une inscription d'application (confirmation + annulation possible). */
export function AddAppOwnerDialog({ app, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<M365User | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
    enabled: app != null,
  });

  const q = search.toLowerCase();
  const filtered = (users ?? [])
    .filter((u) => u.accountEnabled !== false && u.userType !== "Guest")
    .filter((u) => u.displayName.toLowerCase().includes(q) || u.userPrincipalName.toLowerCase().includes(q))
    .slice(0, 10);

  function close() {
    setSearch("");
    setSelected(null);
    setConfirming(false);
    onClose();
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    queryClient.invalidateQueries({ queryKey: ["all-credentials"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  async function setOwner(appId: string, userId: string, action: "add" | "remove") {
    await apiFetch(`/api/applications/${appId}/owners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
  }

  async function handleConfirm() {
    if (!app || !selected) return;
    setLoading(true);
    const target = { app, user: selected };
    try {
      await setOwner(target.app.id, target.user.id, "add");
      refresh();
      toast({
        title: "Propriétaire ajouté",
        description: `${target.user.displayName} est désormais propriétaire de « ${target.app.displayName} ».`,
        action: {
          label: "Annuler",
          onClick: () => {
            setOwner(target.app.id, target.user.id, "remove")
              .then(() => {
                refresh();
                toast({ title: "Ajout annulé", description: `${target.user.displayName} a été retiré des propriétaires.` });
              })
              .catch((e: Error) => toast({ title: "Annulation impossible", description: appErrorMessage(e.message), variant: "destructive" }));
          },
        },
      });
      close();
    } catch (err) {
      toast({ title: "Erreur", description: appErrorMessage((err as Error).message), variant: "destructive" });
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={app != null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un propriétaire</DialogTitle>
        </DialogHeader>
        {confirming && selected && app ? (
          <p className="text-sm">
            <strong>{selected.displayName}</strong> ({selected.userPrincipalName}) deviendra propriétaire de l&apos;application{" "}
            <strong>« {app.displayName} »</strong> : il pourra en gérer les secrets, certificats et paramètres.
            L&apos;opération est journalisée et peut être annulée depuis l&apos;historique.
          </p>
        ) : (
          <div className="space-y-3 min-w-0">
            <p className="text-sm text-foreground/60">
              Application : <span className="font-medium text-foreground">{app?.displayName}</span>
            </p>
            <Input
              placeholder="Rechercher un utilisateur..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
            />
            <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2 min-w-0">
              {filtered.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className={`block w-full text-left px-3 py-2 rounded text-sm transition-colors min-w-0 ${
                    selected?.id === u.id ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
                  }`}
                  onClick={() => setSelected(u)}
                >
                  <div className="font-medium truncate">{u.displayName}</div>
                  <div className="text-foreground/50 truncate">{u.userPrincipalName}</div>
                </button>
              ))}
              {users && filtered.length === 0 && <p className="text-sm text-foreground/50 px-3 py-2">Aucun utilisateur.</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={confirming ? () => setConfirming(false) : close}>
            {confirming ? "Retour" : "Annuler"}
          </Button>
          {confirming ? (
            <Button onClick={handleConfirm} disabled={loading}>{loading ? "Ajout..." : "Confirmer l'ajout"}</Button>
          ) : (
            <Button onClick={() => setConfirming(true)} disabled={!selected}>Continuer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
