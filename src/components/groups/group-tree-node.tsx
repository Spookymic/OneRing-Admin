"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, RotateCcw, Loader2 } from "lucide-react";
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
  ancestors: Set<string>;
  depth: number;
  onSelect: (node: GroupNode) => void;
}

export function GroupTreeNode({ node, direction, ancestors, depth, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isCycle = ancestors.has(node.id);

  const { data: children, isLoading } = useQuery<GroupNode[]>({
    queryKey: ["group-relations", direction, node.id],
    queryFn: () => apiFetch<GroupNode[]>(`/api/groups/${node.id}/relations?direction=${direction}`),
    enabled: expanded && !isCycle,
    staleTime: 5 * 60 * 1000,
  });

  const childAncestors = new Set(ancestors);
  childAncestors.add(node.id);
  const ti = typeLabels[node.type];
  const indent = depth * 18 + 4;

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
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-5 flex justify-center text-[#01031B]/40 hover:text-[#D8346E]"
            aria-label={expanded ? "Réduire" : "Développer"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="flex items-center gap-2 min-w-0 text-left flex-1 hover:text-[#D8346E] transition-colors"
        >
          <span className="text-sm font-medium truncate">{node.displayName}</span>
          {ti && <Badge variant={ti.variant} className="text-[10px] shrink-0">{ti.label}</Badge>}
          {node.isTeam && <Badge variant="secondary" className="text-[10px] shrink-0">Teams</Badge>}
          {node.mail && (
            <span className="text-xs text-[#01031B]/40 truncate hidden sm:inline">{node.mail}</span>
          )}
        </button>
      </div>

      {expanded && !isCycle && (
        <div>
          {isLoading ? (
            <div
              className="flex items-center gap-2 text-xs text-[#01031B]/40 py-1"
              style={{ paddingLeft: indent + 18 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </div>
          ) : children && children.length > 0 ? (
            children.map((c) => (
              <GroupTreeNode
                key={c.id}
                node={c}
                direction={direction}
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
