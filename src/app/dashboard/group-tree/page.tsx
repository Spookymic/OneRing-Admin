"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { M365Group, GroupType } from "@/services/graph/groups";
import { GroupTreeNode, type GroupNode } from "@/components/groups/group-tree-node";
import { GroupMembersSheet } from "@/components/groups/group-members-sheet";

type GroupWithType = M365Group & { type: GroupType };
type Direction = "children" | "parents";

export default function GroupTreePage() {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Direction>("children");
  const [selected, setSelected] = useState<GroupWithType | null>(null);

  const { data: groups, isLoading, error } = useQuery<GroupWithType[]>({
    queryKey: ["groups"],
    queryFn: () => apiFetch<GroupWithType[]>("/api/groups"),
  });

  const filtered = (groups ?? [])
    .filter(
      (g) =>
        g.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (g.mail ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  function toNode(g: GroupWithType): GroupNode {
    return {
      id: g.id,
      displayName: g.displayName,
      type: g.type,
      isTeam: (g.resourceProvisioningOptions ?? []).includes("Team"),
      mail: g.mail,
    };
  }

  function handleSelect(n: GroupNode) {
    // Objet minimal pour réutiliser le panneau de groupe existant (il recharge par id).
    setSelected({
      id: n.id,
      displayName: n.displayName,
      type: n.type,
      mail: n.mail,
      description: null,
      groupTypes: [],
      mailEnabled: false,
      securityEnabled: false,
      membershipRule: null,
    });
  }

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Arborescence des groupes</h2>
        <div className="rounded-md border bg-red-50 border-red-200 p-4 text-red-700 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold">Arborescence des groupes</h2>
          <p className="text-sm text-[#01031B]/50 mt-0.5">
            Imbrication des groupes (groupe membre d&apos;un groupe). Déroulez un groupe pour explorer ses dépendances.
          </p>
        </div>
        <Badge variant="secondary">{filtered.length} groupe{filtered.length > 1 ? "s" : ""}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          placeholder="Rechercher un groupe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            size="sm"
            variant={direction === "children" ? "default" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setDirection("children")}
          >
            <ChevronDown className="h-3.5 w-3.5 mr-1" />
            Contient
          </Button>
          <Button
            size="sm"
            variant={direction === "parents" ? "default" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setDirection("parents")}
          >
            <ChevronUp className="h-3.5 w-3.5 mr-1" />
            Membre de
          </Button>
        </div>
        <p className="text-xs text-[#01031B]/40">
          {direction === "children"
            ? "Affiche les groupes imbriqués dans chaque groupe."
            : "Affiche les groupes dont chaque groupe est membre (analyse d'impact)."}
        </p>
      </div>

      <Card className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[#01031B]/40 p-4">Aucun groupe.</p>
        ) : (
          // key={direction} : réinitialise les expansions au changement de sens
          <div key={direction}>
            {filtered.map((g) => (
              <GroupTreeNode
                key={g.id}
                node={toNode(g)}
                direction={direction}
                ancestors={new Set()}
                depth={0}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </Card>

      <GroupMembersSheet
        group={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
