"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import type { GroupType } from "@/services/graph/groups";

export interface GroupNode {
  id: string;
  displayName: string;
  type: GroupType;
  isTeam: boolean;
  mail: string | null;
}

const typeLabels: Record<GroupType, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  unified: { label: "M365", variant: "default" },
  distribution: { label: "Distribution", variant: "secondary" },
  security: { label: "Sécurité", variant: "outline" },
  sharedMailbox: { label: "Boîte partagée", variant: "outline" },
};

interface Props {
  node: GroupNode;
  direction: "children" | "parents";
  childrenOf: Record<string, string[]>;
  parentsOf: Record<string, string[]>;
  nodeMap: Map<string, GroupNode>;
  ownerlessSet: Set<string>;
  ancestors: Set<string>;
  depth: number;
  onSelect: (node: GroupNode) => void;
}

export function GroupTreeNode({
  node, direction, childrenOf, parentsOf, nodeMap, ownerlessSet, ancestors, depth, onSelect,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const isCycle = ancestors.has(node.id);

  // Imbrication DL-dans-DL : non couverte par la carte Graph → chargée via le pont à l'expansion.
  const isDLChildren = node.type === "distribution" && direction === "children";
  const { data: lazyRelated, isLoading: lazyLoading } = useQuery<GroupNode[]>({
    queryKey: ["group-relations", "children", node.id],
    queryFn: () => apiFetch<GroupNode[]>(`/api/groups/${node.id}/relations?direction=children`),
    enabled: expanded && isDLChildren && !isCycle,
    staleTime: 5 * 60 * 1000,
  });

  const mapNodes = ((direction === "children" ? childrenOf[node.id] : parentsOf[node.id]) ?? [])
    .map((id) => nodeMap.get(id))
    .filter((n): n is GroupNode => !!n);

  const related = (() => {
    if (!isDLChildren) return mapNodes;
    const merged = new Map<string, GroupNode>();
    for (const n of mapNodes) merged.set(n.id, n);
    for (const n of lazyRelated ?? []) merged.set(n.id, n);
    return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  })();

  // Pour une DL on ne connaît pas les enfants sans interroger le pont → toujours dépliable.
  const canExpand = !isCycle && (isDLChildren || related.length > 0);
  const ti = typeLabels[node.type];
  const indent = depth * 18 + 4;

  const childAncestors = new Set(ancestors);
  childAncestors.add(node.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md hover:bg-[#01031B]/5 py-1.5 pr-2"
        style={{ paddingLeft: indent }}
      >
        {isCycle ? (
          <span className="w-5 flex justify-center text-amber-500" title="Référence circulaire">
            <RotateCcw className="h-3.5 w-3.5" />
          </span>
        ) : canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-5 flex justify-center text-[#01031B]/40 hover:text-[#D8346E]"
            aria-label={expanded ? "Réduire" : "Développer"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node)}
          className="flex items-center gap-2 min-w-0 text-left flex-1 hover:text-[#D8346E] transition-colors"
        >
          <span className="text-sm font-medium truncate">{node.displayName}</span>
          {ti && <Badge variant={ti.variant} className="text-[10px] shrink-0">{ti.label}</Badge>}
          {node.isTeam && <Badge variant="secondary" className="text-[10px] shrink-0">Teams</Badge>}
          {ownerlessSet.has(node.id) && (
            <Badge variant="destructive" className="text-[10px] shrink-0 gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> Sans propriétaire
            </Badge>
          )}
          {related.length > 0 && (
            <span className="text-xs text-[#01031B]/40 shrink-0">({related.length})</span>
          )}
          {node.mail && (
            <span className="text-xs text-[#01031B]/40 truncate hidden md:inline">{node.mail}</span>
          )}
        </button>
      </div>

      {expanded && canExpand && (
        <div>
          {isDLChildren && lazyLoading && related.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-[#01031B]/40 py-1" style={{ paddingLeft: indent + 18 }}>
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </div>
          ) : related.length > 0 ? (
            related.map((c) => (
              <GroupTreeNode
                key={c.id}
                node={c}
                direction={direction}
                childrenOf={childrenOf}
                parentsOf={parentsOf}
                nodeMap={nodeMap}
                ownerlessSet={ownerlessSet}
                ancestors={childAncestors}
                depth={depth + 1}
                onSelect={onSelect}
              />
            ))
          ) : (
            <p className="text-xs text-[#01031B]/30 py-1" style={{ paddingLeft: indent + 18 }}>
              {direction === "children" ? "Aucun groupe imbriqué" : "Membre d'aucun groupe"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
