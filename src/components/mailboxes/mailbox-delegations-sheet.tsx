"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Trash2, UserPlus, RefreshCw, KeyRound, Send, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AddDelegationDialog } from "@/components/mailboxes/add-delegation-dialog";
import type { SharedMailbox, MailboxPermissions, MailboxDelegate, DelegationType } from "@/services/exchange/shared-mailboxes";

interface Props {
  mailbox: SharedMailbox | null;
  open: boolean;
  onClose: () => void;
}

const sections: { type: DelegationType; label: string; icon: typeof KeyRound; key: keyof MailboxPermissions }[] = [
  { type: "fullAccess", label: "Accès complet", icon: KeyRound, key: "fullAccess" },
  { type: "sendAs", label: "Envoyer en tant que", icon: Send, key: "sendAs" },
  { type: "sendOnBehalf", label: "Envoyer de la part de", icon: Users, key: "sendOnBehalf" },
];

export function MailboxDelegationsSheet({ mailbox, open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const smtp = mailbox?.mail ?? "";

  const { data: perms, isLoading, isFetching } = useQuery<MailboxPermissions>({
    queryKey: ["mailbox-permissions", smtp],
    queryFn: () => apiFetch<MailboxPermissions>(`/api/mailboxes/${encodeURIComponent(smtp)}/permissions`),
    enabled: open && !!smtp,
  });

  const removeDelegation = useMutation({
    mutationFn: (vars: { member: string; type: DelegationType }) =>
      apiFetch(`/api/mailboxes/${encodeURIComponent(smtp)}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: vars.member, type: vars.type, action: "remove" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailbox-permissions", smtp] });
      toast({ title: "Délégation retirée" });
    },
    onError: (err: any) => {
      const description =
        err.message === "exchange_forbidden"
          ? "Un rôle Exchange Administrator est requis."
          : err.message;
      toast({ title: "Erreur", description, variant: "destructive" });
    },
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["mailbox-permissions", smtp] });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg leading-tight">{mailbox?.displayName}</SheetTitle>
            {mailbox?.mail && <SheetDescription className="text-xs">{mailbox.mail}</SheetDescription>}
          </SheetHeader>

          <div className="mb-4 flex items-center gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />Ajouter une délégation
            </Button>
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isFetching} title="Rafraîchir">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            sections.map(({ type, label, icon: Icon, key }) => {
              const delegates: MailboxDelegate[] = perms?.[key] ?? [];
              return (
                <div key={type} className="mb-6">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">
                      {label}
                      {delegates.length > 0 && (
                        <span className="ml-1 text-foreground/40 font-normal">({delegates.length})</span>
                      )}
                    </span>
                  </div>
                  <Separator className="mb-3" />
                  {delegates.length > 0 ? (
                    <div className="space-y-1">
                      {delegates.map((d) => (
                        <div key={`${type}-${d.mail}`} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-foreground/5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{d.displayName}</p>
                            <p className="text-xs text-foreground/40 truncate">{d.mail}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 h-7 px-2 shrink-0"
                            onClick={() => removeDelegation.mutate({ member: d.mail, type })}
                            disabled={removeDelegation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/40">Aucune délégation</p>
                  )}
                </div>
              );
            })
          )}
        </SheetContent>
      </Sheet>

      {addOpen && smtp && (
        <AddDelegationDialog mailbox={smtp} open={addOpen} onClose={() => setAddOpen(false)} />
      )}
    </>
  );
}
