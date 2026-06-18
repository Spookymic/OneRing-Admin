"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { M365User } from "@/services/graph/users";
import type { DelegationType } from "@/services/exchange/shared-mailboxes";
import { apiFetch } from "@/lib/api";

interface Props {
  mailbox: string;       // SMTP de la boîte
  open: boolean;
  onClose: () => void;
}

const typeLabels: Record<DelegationType, string> = {
  fullAccess: "Accès complet",
  sendAs: "Envoyer en tant que",
  sendOnBehalf: "Envoyer de la part de",
};

export function AddDelegationDialog({ mailbox, open, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<M365User | null>(null);
  const [type, setType] = useState<DelegationType>("fullAccess");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const filtered = users
    ?.filter(
      (u) =>
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, 10);

  async function handleAdd() {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await apiFetch(`/api/mailboxes/${encodeURIComponent(mailbox)}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: selectedUser.userPrincipalName, type, action: "add" }),
      });
      queryClient.invalidateQueries({ queryKey: ["mailbox-permissions", mailbox] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Délégation ajoutée", description: `${selectedUser.displayName} — ${typeLabels[type]}` });
      onClose();
    } catch (err: any) {
      const description =
        err.message === "exchange_forbidden"
          ? "Un rôle Exchange Administrator est requis."
          : err.message;
      toast({ title: "Erreur", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une délégation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          <Input
            placeholder="Rechercher un utilisateur..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }}
          />
          <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2 min-w-0">
            {filtered?.map((user) => (
              <div
                key={user.id}
                className={`px-3 py-2 rounded cursor-pointer text-sm transition-colors min-w-0 ${
                  selectedUser?.id === user.id ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100"
                }`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="font-medium truncate">{user.displayName}</div>
                <div className="text-gray-500 truncate">{user.userPrincipalName}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Type de délégation</Label>
            <Select value={type} onValueChange={(v) => setType(v as DelegationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fullAccess">Accès complet</SelectItem>
                <SelectItem value="sendAs">Envoyer en tant que</SelectItem>
                <SelectItem value="sendOnBehalf">Envoyer de la part de</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleAdd} disabled={!selectedUser || loading}>
            {loading ? "Ajout..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
