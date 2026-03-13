"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, UserPlus, Crown, Users, Lock, Globe, AlertTriangle } from "lucide-react";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useState, use, useMemo, useCallback } from "react";
import type { M365Group, GroupType } from "@/services/graph/groups";
import { AddMemberDialog } from "@/components/groups/add-member-dialog";
import { useAdminSettings } from "@/lib/admin-settings";
import { apiFetch } from "@/lib/api";

interface GroupMember {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
  isOwner: boolean;
  isMember: boolean;
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const { settings } = useAdminSettings();

  const { data: group } = useQuery<M365Group & { type: GroupType }>({
    queryKey: ["group", id],
    queryFn: async () => {
      const groups = await apiFetch<(M365Group & { type: GroupType })[]>("/api/groups");
      return groups.find((g) => g.id === id)!;
    },
  });

  const { data: members, isLoading: membersLoading } = useQuery<any[]>({
    queryKey: ["group-members", id],
    queryFn: () => apiFetch<any[]>(`/api/groups/${id}/members`),
  });

  const { data: owners, isLoading: ownersLoading } = useQuery<any[]>({
    queryKey: ["group-owners", id],
    queryFn: () => apiFetch<any[]>(`/api/groups/${id}/owners`),
  });

  const isLoading = membersLoading || ownersLoading;

  // Fusion owners + members : un utilisateur peut avoir les deux rôles
  const combined: GroupMember[] = useMemo(() => {
    const map = new Map<string, GroupMember>();

    (owners ?? []).forEach((o: any) => {
      map.set(o.id, {
        id: o.id,
        displayName: o.displayName,
        userPrincipalName: o.userPrincipalName ?? o.mail ?? "",
        mail: o.mail ?? null,
        jobTitle: o.jobTitle ?? null,
        isOwner: true,
        isMember: false,
      });
    });

    (members ?? []).forEach((m: any) => {
      if (map.has(m.id)) {
        map.get(m.id)!.isMember = true;
      } else {
        map.set(m.id, {
          id: m.id,
          displayName: m.displayName,
          userPrincipalName: m.userPrincipalName ?? m.mail ?? "",
          mail: m.mail ?? null,
          jobTitle: m.jobTitle ?? null,
          isOwner: false,
          isMember: true,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.isOwner && !b.isOwner) return -1;
      if (!a.isOwner && b.isOwner) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [members, owners]);

  type MemberSortCol = "displayName" | "userPrincipalName" | "jobTitle" | "role";

  const getMemberSortVal = useCallback((p: GroupMember, column: MemberSortCol): string | number => {
    switch (column) {
      case "displayName":      return p.displayName;
      case "userPrincipalName": return p.userPrincipalName;
      case "jobTitle":         return p.jobTitle ?? "";
      case "role":             return p.isOwner ? 0 : 1; // owners first on asc
      default:                 return "";
    }
  }, []);

  const { sorted: sortedMembers, col: sortCol, dir: sortDir, toggle: toggleSort } = useSort<GroupMember, MemberSortCol>(
    combined,
    getMemberSortVal
  );

  const ownerCount = owners?.length ?? 0;
  const memberOnlyCount = combined.filter((p) => p.isMember && !p.isOwner).length;

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/groups/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members", id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Membre retiré" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const removeOwner = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/groups/${id}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-owners", id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Owner retiré" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const moderationEnabled = group?.requireSenderAuthenticationEnabled === true;
  const allowsExternal = group?.allowExternalSenders === true;

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/groups">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />Groupes
          </Button>
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">{group?.displayName}</h2>
            {group?.description && <p className="text-[#01031B]/50 text-sm mt-0.5">{group.description}</p>}
            {group?.mail && <p className="text-[#01031B]/40 text-xs mt-0.5">{group.mail}</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-sm text-[#01031B]/60">
              <Crown className="h-4 w-4 text-[#D8346E]" />
              <span>{ownerCount} owner{ownerCount !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-[#01031B]/60">
              <Users className="h-4 w-4" />
              <span>{memberOnlyCount} membre{memberOnlyCount !== 1 ? "s" : ""}</span>
            </div>
            {moderationEnabled && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Modéré
              </Badge>
            )}
            {group?.allowExternalSenders === false && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Interne seulement
              </Badge>
            )}
            {allowsExternal && (
              <Badge variant="outline" className="text-xs flex items-center gap-1 text-amber-600 border-amber-300">
                <Globe className="h-3 w-3" />
                Externes autorisés
              </Badge>
            )}
            {!settings.hideMemberAdd && (
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" />Ajouter
              </Button>
            )}
          </div>
        </div>

        {/* Alerte modération pour les DL sans restriction */}
        {group?.requireSenderAuthenticationEnabled === false && group?.type === "distribution" && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Cette liste de distribution accepte les expéditeurs non authentifiés (externes).
              Activez la modération dans Exchange Admin Center si ce n&apos;est pas intentionnel.
            </span>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Nom"        col="displayName"       activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Email / UPN" col="userPrincipalName" activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Fonction"   col="jobTitle"          activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              <SortableHead label="Rôle(s)"    col="role"              activeCol={sortCol} dir={sortDir} onToggle={toggleSort} />
              {!settings.hideGroupDeletion && <th className="p-3"></th>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : sortedMembers.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {person.isOwner && (
                          <Crown className="h-3.5 w-3.5 text-[#D8346E] shrink-0" />
                        )}
                        {person.displayName}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#01031B]/50 text-sm">
                      {person.userPrincipalName || person.mail || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{person.jobTitle ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {person.isOwner && (
                          <Badge variant="default" className="text-xs">Owner</Badge>
                        )}
                        {person.isMember && (
                          <Badge variant="secondary" className="text-xs">Membre</Badge>
                        )}
                      </div>
                    </TableCell>
                    {!settings.hideGroupDeletion && (
                      <TableCell>
                        <div className="flex gap-1">
                          {person.isMember && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                              onClick={() => removeMember.mutate(person.id)}
                              disabled={removeMember.isPending || removeOwner.isPending}
                              title="Retirer comme membre"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />Mbr
                            </Button>
                          )}
                          {person.isOwner && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                              onClick={() => removeOwner.mutate(person.id)}
                              disabled={removeMember.isPending || removeOwner.isPending}
                              title="Retirer comme owner"
                            >
                              <Crown className="h-3 w-3 mr-1" />Owr
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {addMemberOpen && (
        <AddMemberDialog
          groupId={id}
          open={addMemberOpen}
          onClose={() => setAddMemberOpen(false)}
        />
      )}
    </div>
  );
}
