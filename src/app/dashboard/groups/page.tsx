"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import Link from "next/link";
import type { M365Group, GroupType } from "@/services/graph/groups";

const groupTypeLabels: Record<GroupType, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  unified: { label: "Microsoft 365", variant: "default" },
  distribution: { label: "Distribution", variant: "secondary" },
  security: { label: "Sécurité", variant: "outline" },
  sharedMailbox: { label: "Boîte partagée", variant: "outline" },
};

export default function GroupsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<GroupType | "all">("all");

  const { data: groups, isLoading } = useQuery<(M365Group & { type: GroupType })[]>({
    queryKey: ["groups"],
    queryFn: () => fetch("/api/groups").then((r) => r.json()),
  });

  const filtered = groups?.filter((g) => {
    const matchSearch =
      g.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (g.mail ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || g.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Groupes</h2>
        <Badge variant="secondary">{groups?.length ?? 0} groupes</Badge>
      </div>
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Rechercher un groupe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as GroupType | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="unified">Microsoft 365</SelectItem>
            <SelectItem value="distribution">Distribution</SelectItem>
            <SelectItem value="security">Sécurité</SelectItem>
            <SelectItem value="sharedMailbox">Boîte partagée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered?.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={groupTypeLabels[group.type].variant}>
                        {groupTypeLabels[group.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{group.mail ?? "-"}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/groups/${group.id}`}>
                        <Button size="sm" variant="outline">Membres</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
