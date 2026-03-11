"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useState, use } from "react";
import type { M365Group, GroupType } from "@/services/graph/groups";
import { AddMemberDialog } from "@/components/groups/add-member-dialog";

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const { data: group } = useQuery<M365Group & { type: GroupType }>({
    queryKey: ["group", id],
    queryFn: () =>
      fetch("/api/groups").then((r) =>
        r.json().then((groups: any[]) => groups.find((g) => g.id === id))
      ),
  });

  const { data: members, isLoading } = useQuery<any[]>({
    queryKey: ["group-members", id],
    queryFn: () => fetch(`/api/groups/${id}/members`).then((r) => r.json()),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      fetch(`/api/groups/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members", id] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Membre retiré" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/groups">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />Groupes
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{group?.displayName}</h2>
            {group?.mail && <p className="text-gray-500 text-sm">{group.mail}</p>}
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">{members?.length ?? 0} membres</Badge>
            <Button size="sm" onClick={() => setAddMemberOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />Ajouter
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Fonction</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : members?.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.displayName}</TableCell>
                    <TableCell className="text-gray-500">{member.userPrincipalName ?? member.mail ?? "-"}</TableCell>
                    <TableCell>{member.jobTitle ?? "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => removeMember.mutate(member.id)}
                        disabled={removeMember.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
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
