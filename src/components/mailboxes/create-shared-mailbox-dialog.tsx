"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateSharedMailboxDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ displayName: "", alias: "" });

  function handleNameChange(name: string) {
    const alias = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 64);
    setForm({ displayName: name, alias });
  }

  async function handleCreate() {
    if (!form.displayName || !form.alias) return;
    setLoading(true);
    try {
      await apiFetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      queryClient.invalidateQueries({ queryKey: ["shared-mailboxes"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Boîte partagée créée", description: form.displayName });
      setForm({ displayName: "", alias: "" });
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
          <DialogTitle>Créer une boîte partagée</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          <div className="space-y-1">
            <Label>Nom d&apos;affichage *</Label>
            <Input
              placeholder="Ex: Support Commercial"
              value={form.displayName}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Alias mail *</Label>
            <Input
              placeholder="support-commercial"
              value={form.alias}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  alias: e.target.value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64),
                }))
              }
            />
            <p className="text-xs text-gray-400">Lettres, chiffres, tirets et points uniquement</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleCreate} disabled={loading || !form.displayName || !form.alias}>
            {loading ? "Création..." : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
