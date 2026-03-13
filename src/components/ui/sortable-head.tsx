"use client";

import { TableHead } from "@/components/ui/table";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import type { SortDir } from "@/lib/use-sort";

interface SortableHeadProps {
  label: string;
  col: string;
  activeCol: string | null;
  dir: SortDir;
  onToggle: (col: any) => void;
  className?: string;
}

export function SortableHead({ label, col, activeCol, dir, onToggle, className }: SortableHeadProps) {
  const isActive = activeCol === col;
  const Icon = isActive ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;

  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${className ?? ""}`}
      onClick={() => onToggle(col)}
    >
      <span className={`inline-flex items-center gap-1 hover:text-[#D8346E] transition-colors ${isActive ? "text-[#D8346E]" : ""}`}>
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </span>
    </TableHead>
  );
}
