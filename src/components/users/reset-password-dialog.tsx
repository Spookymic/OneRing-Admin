"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { M365User } from "@/services/graph/users";

interface Props {
  user: M365User;
  open: boolean;
  onClose: () => void;
}

export function ResetPasswordDialog({ user, open, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function handleSubmit() {
    if (password.length < 12) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 12 caractères.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Mot de passe réinitialisé", description: `Le mot de passe de ${user.displayName} a été réinitialisé. L'utilisateur devra le changer à la prochaine connexion.` });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
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
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            Réinitialisation pour <strong>{user.displayName}</strong> ({user.userPrincipalName}).
            Cette action n&apos;est pas réversible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 12 caractères"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "En cours..." : "Réinitialiser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
