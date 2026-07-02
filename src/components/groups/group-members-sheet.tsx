"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Crown, Users, Trash2, UserPlus, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect } from "react";
import type { M365Group, GroupType } from "@/services/graph/groups";
import { AddMemberDialog } from "@/components/groups/add-member-dialog";
import { ObjectInfo } from "@/components/common/object-info";
import { useAdminSettings } from "@/lib/admin-settings";
import { apiFetch } from "@/lib/api";

interface Props {
  group: (M365Group & { type: GroupType }) | null;
  open: boolean;
  onClose: () => void;
}

const groupTypeLabels: Record<GroupType, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  unified:      { label: "Microsoft 365", variant: "default" },
  distribution: { label: "Distribution",  variant: "secondary" },
  security:     { label: "Sécurité",      variant: "outline" },
  sharedMailbox:{ label: "Boîte partagée",variant: "outline" },
};

interface Member {
  id: string;
  displayName: string;
  userPrincipalName?: string;
  mail?: string | null;
  jobTitle?: string | null;
}

export function GroupMembersSheet({ group, open, onClose }: Props) {
  const { toast } = useToast();
  const { settings } = useAdminSettings();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [exchangeError, setExchangeError] = useState(false);

  const groupId = group?.id ?? "";

  // Réinitialiser la bannière Exchange quand on change de groupe
  useEffect(() => { setExchangeError(false); }, [groupId]);

  const { data: owners, isLoading: ownersLoading, isFetching: ownersFetching } = useQuery<Member[]>({
    queryKey: ["group-owners", groupId],
    queryFn: () => apiFetch<Member[]>(`/api/groups/${groupId}/owners`),
    enabled: open && !!groupId,
  });

  const { data: members, isLoading: membersLoading, isFetching: membersFetching } = useQuery<Member[]>({
    queryKey: ["group-members", groupId],
    queryFn: () => apiFetch<Member[]>(`/api/groups/${groupId}/members`),
    enabled: open && !!groupId,
  });

  const refreshing = ownersFetching || membersFetching;
  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
    queryClient.invalidateQueries({ queryKey: ["group-owners", groupId] });
  }

  // Tri alphabétique — owners et membres affichés séparément, doublons autorisés
  const sortedOwners = useMemo(
    () => [...(owners ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [owners]
  );
  const sortedMembers = useMemo(
    () => [...(members ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members]
  );

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      toast({ title: "Membre retiré" });
    },
    onError: (err: any) => {
      if (err.message === "exchange_forbidden") {
        toast({ title: "Droits insuffisants", description: "Un rôle Exchange Administrator est requis pour modifier cette liste.", variant: "destructive" });
        return;
      }
      if (err.message === "exchange_managed") { setExchangeError(true); return; }
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const removeOwner = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/groups/${groupId}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-owners", groupId] });
      toast({ title: "Owner retiré" });
    },
    onError: (err: any) => {
      if (err.message === "exchange_forbidden") {
        toast({ title: "Droits insuffisants", description: "Un rôle Exchange Administrator est requis pour modifier cette liste.", variant: "destructive" });
        return;
      }
      if (err.message === "exchange_managed") { setExchangeError(true); return; }
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const typeInfo = group ? groupTypeLabels[group.type] : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {typeInfo && <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>}
              <SheetTitle className="text-lg leading-tight">{group?.displayName}</SheetTitle>
            </div>
            {group?.mail && (
              <SheetDescription className="text-xs">{group.mail}</SheetDescription>
            )}
            {group?.description && !group?.mail && (
              <SheetDescription className="text-xs">{group.description}</SheetDescription>
            )}
            {group && (
              <ObjectInfo
                id={group.id}
                type="group"
                createdDateTime={group.createdDateTime}
                onPremisesSyncEnabled={group.onPremisesSyncEnabled}
                open={open}
              />
            )}
          </SheetHeader>

          <div className="mb-4 flex items-center gap-2">
            {!settings.hideMemberAdd && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" />Ajouter
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {exchangeError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Ce groupe est géré par Exchange. Les modifications de membres doivent être effectuées
                dans <span className="font-medium">Exchange Admin Center</span>.
              </span>
            </div>
          )}

          {/* Section Owners */}
          <div className="mb-1 flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              Propriétaires
              {sortedOwners.length > 0 && (
                <span className="ml-1 text-foreground/40 font-normal">({sortedOwners.length})</span>
              )}
            </span>
          </div>
          <Separator className="mb-3" />

          {ownersLoading ? (
            <div className="space-y-2 mb-6">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sortedOwners.length > 0 ? (
            <div className="space-y-1 mb-6">
              {sortedOwners.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-foreground/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{o.displayName}</p>
                    <p className="text-xs text-foreground/40 truncate">{o.userPrincipalName ?? o.mail ?? ""}</p>
                  </div>
                  {!settings.hideGroupDeletion && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 dark:text-red-300 h-7 px-2 shrink-0"
                      onClick={() => removeOwner.mutate(o.id)}
                      disabled={removeOwner.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/40 mb-6">Aucun propriétaire</p>
          )}

          {/* Section Membres */}
          <div className="mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-foreground/60" />
            <span className="text-sm font-semibold">
              Membres
              {sortedMembers.length > 0 && (
                <span className="ml-1 text-foreground/40 font-normal">({sortedMembers.length})</span>
              )}
            </span>
          </div>
          <Separator className="mb-3" />

          {membersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sortedMembers.length > 0 ? (
            <div className="space-y-1">
              {sortedMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-foreground/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.displayName}</p>
                    <p className="text-xs text-foreground/40 truncate">{m.userPrincipalName ?? m.mail ?? ""}</p>
                    {m.jobTitle && <p className="text-xs text-foreground/40 truncate">{m.jobTitle}</p>}
                  </div>
                  {!settings.hideGroupDeletion && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 dark:text-red-300 h-7 px-2 shrink-0"
                      onClick={() => removeMember.mutate(m.id)}
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/40">Aucun membre</p>
          )}
        </SheetContent>
      </Sheet>

      {addOpen && groupId && (
        <AddMemberDialog
          groupId={groupId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  );
}
