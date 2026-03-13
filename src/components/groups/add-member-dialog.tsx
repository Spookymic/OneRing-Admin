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
import { apiFetch } from "@/lib/api";

interface Props {
  groupId: string;
  open: boolean;
  onClose: () => void;
}

export function AddMemberDialog({ groupId, open, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<M365User | null>(null);
  const [role, setRole] = useState<"member" | "owner">("member");
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
      const endpoint = role === "owner"
        ? `/api/groups/${groupId}/owners`
        : `/api/groups/${groupId}/members`;
      await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id, action: "add" }),
      });
      queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      queryClient.invalidateQueries({ queryKey: ["group-owners", groupId] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({
        title: role === "owner" ? "Owner ajouté" : "Membre ajouté",
        description: `${selectedUser.displayName} a été ajouté en tant que ${role === "owner" ? "propriétaire" : "membre"}.`,
      });
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
          <DialogTitle>Ajouter au groupe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Rechercher un utilisateur..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }}
          />
          <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2">
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
          <div className="space-y-1">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "member" | "owner")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Membre</SelectItem>
                <SelectItem value="owner">Owner (propriétaire)</SelectItem>
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
