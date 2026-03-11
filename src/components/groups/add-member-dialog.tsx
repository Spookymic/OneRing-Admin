"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { M365User } from "@/services/graph/users";

interface Props {
  groupId: string;
  open: boolean;
  onClose: () => void;
}

export function AddMemberDialog({ groupId, open, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<M365User | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  const filtered = users?.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10);

  async function handleAdd() {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id, action: "add" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Membre ajouté", description: `${selectedUser.displayName} a été ajouté au groupe.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un membre</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Rechercher un utilisateur..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }}
        />
        <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
          {filtered?.map((user) => (
            <div
              key={user.id}
              className={`px-3 py-2 rounded cursor-pointer text-sm transition-colors ${
                selectedUser?.id === user.id ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100"
              }`}
              onClick={() => setSelectedUser(user)}
            >
              <div className="font-medium">{user.displayName}</div>
              <div className="text-gray-500">{user.userPrincipalName}</div>
            </div>
          ))}
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
