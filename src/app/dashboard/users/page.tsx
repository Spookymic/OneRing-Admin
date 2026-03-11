"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import type { M365User } from "@/services/graph/users";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<M365User | null>(null);

  const { data: users, isLoading } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  const filtered = users?.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Utilisateurs</h2>
        <Badge variant="secondary">{users?.length ?? 0} utilisateurs</Badge>
      </div>
      <Input
        placeholder="Rechercher un utilisateur..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Département</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Licences</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="text-gray-500">{user.userPrincipalName}</TableCell>
                    <TableCell>{user.department ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={user.accountEnabled ? "default" : "destructive"}>
                        {user.accountEnabled ? "Actif" : "Désactivé"}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.assignedLicenses.length}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUser(user)}
                      >
                        Réinitialiser MDP
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {selectedUser && (
        <ResetPasswordDialog
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
