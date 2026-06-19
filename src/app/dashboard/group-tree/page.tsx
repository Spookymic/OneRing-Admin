"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

type Direction = "children" | "parents";

interface Structure {
  nodes: GroupNode[];
  childrenOf: Record<string, string[]>;
  parentsOf: Record<string, string[]>;
}

export default function GroupTreePage() {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Direction>("children");
  const [rootsOnly, setRootsOnly] = useState(false);
  const [selected, setSelected] = useState<(M365Group & { type: GroupType }) | null>(null);

  const { data: structure, isLoading, error } = useQuery<Structure>({
    queryKey: ["group-structure"],
    queryFn: () => apiFetch<Structure>("/api/groups/structure"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: ownerless } = useQuery<{ id: string }[]>({
    queryKey: ["ownerless-groups"],
    queryFn: () => apiFetch<{ id: string }[]>("/api/anomalies/ownerless"),
    staleTime: 5 * 60 * 1000,
  });

  const nodeMap = useMemo(
    () => new Map((structure?.nodes ?? []).map((n) => [n.id, n])),
    [structure]
  );
  const ownerlessSet = useMemo(() => new Set((ownerless ?? []).map((o) => o.id)), [ownerless]);
  const childrenOf = structure?.childrenOf ?? {};
  const parentsOf = structure?.parentsOf ?? {};

  const roots = (structure?.nodes ?? [])
    .filter(
      (n) =>
        n.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (n.mail ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .filter((n) => !rootsOnly || (parentsOf[n.id]?.length ?? 0) === 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  function handleSelect(n: GroupNode) {
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
            Imbrication des groupes. Déroulez un groupe pour explorer ses dépendances ; un badge signale les groupes sans propriétaire.
          </p>
        </div>
        <Badge variant="secondary">{roots.length} groupe{roots.length > 1 ? "s" : ""}</Badge>
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
        <label className="flex items-center gap-2 text-xs text-[#01031B]/70 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rootsOnly}
            onChange={(e) => setRootsOnly(e.target.checked)}
            className="h-4 w-4 accent-[#D8346E]"
          />
          Groupes racines uniquement
        </label>
      </div>

      <Card className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : roots.length === 0 ? (
          <p className="text-sm text-[#01031B]/40 p-4">Aucun groupe.</p>
        ) : (
          // key={direction} : réinitialise les expansions au changement de sens
          <div key={direction}>
            {roots.map((n) => (
              <GroupTreeNode
                key={n.id}
                node={n}
                direction={direction}
                childrenOf={childrenOf}
                parentsOf={parentsOf}
                nodeMap={nodeMap}
                ownerlessSet={ownerlessSet}
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
