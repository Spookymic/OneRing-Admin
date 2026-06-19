"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, RotateCcw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  const relatedIds = (direction === "children" ? childrenOf[node.id] : parentsOf[node.id]) ?? [];
  const related = relatedIds.map((id) => nodeMap.get(id)).filter((n): n is GroupNode => !!n);
  const hasChildren = related.length > 0 && !isCycle;

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
        ) : hasChildren ? (
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

      {expanded && hasChildren && (
        <div>
          {related.map((c) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
