"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    description: "",
    groupType: "security" as "unified" | "security" | "distribution",
    mailNickname: "",
  });

  function handleNameChange(name: string) {
    const nickname = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 64);
    setForm((f) => ({ ...f, displayName: name, mailNickname: nickname }));
  }

  async function handleCreate() {
    if (!form.displayName || !form.mailNickname) return;
    setLoading(true);
    try {
      await apiFetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Groupe créé", description: form.displayName });
      setForm({ displayName: "", description: "", groupType: "security", mailNickname: "" });
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const groupTypeDescriptions = {
    security: "Groupe de sécurité — pour contrôler les accès aux ressources",
    unified: "Groupe Microsoft 365 — avec boîte mail, Teams, SharePoint",
    distribution: "Liste de distribution — pour les envois d'e-mails uniquement",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un groupe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nom du groupe *</Label>
            <Input
              placeholder="Ex: Équipe Marketing"
              value={form.displayName}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              placeholder="Description (optionnel)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Type de groupe *</Label>
            <Select
              value={form.groupType}
              onValueChange={(v) => setForm((f) => ({ ...f, groupType: v as typeof form.groupType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="security">Sécurité</SelectItem>
                <SelectItem value="unified">Microsoft 365</SelectItem>
                <SelectItem value="distribution">Distribution</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">{groupTypeDescriptions[form.groupType]}</p>
          </div>
          <div className="space-y-1">
            <Label>Alias mail *</Label>
            <Input
              placeholder="alias-mail"
              value={form.mailNickname}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  mailNickname: e.target.value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64),
                }))
              }
            />
            <p className="text-xs text-gray-400">Lettres, chiffres, tirets et points uniquement</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !form.displayName || !form.mailNickname}
          >
            {loading ? "Création..." : "Créer le groupe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
