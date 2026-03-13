import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  col: K | null;
  dir: SortDir;
}

export interface UseSortResult<T, K extends string> {
  sorted: T[];
  col: K | null;
  dir: SortDir;
  toggle: (col: K) => void;
}

/**
 * Generic sort hook.
 * @param data     Array to sort
 * @param getVal   Map each item + column key to a comparable value (string | number | null/undefined)
 */
export function useSort<T, K extends string>(
  data: T[],
  getVal: (item: T, col: K) => string | number | null | undefined
): UseSortResult<T, K> {
  const [state, setState] = useState<SortState<K>>({ col: null, dir: "asc" });

  const toggle = (col: K) => {
    setState((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  };

  const sorted = useMemo(() => {
    if (!state.col) return data;
    const col = state.col;
    const mul = state.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = getVal(a, col) ?? "";
      const bv = getVal(b, col) ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv), "fr", { sensitivity: "base" }) * mul;
    });
  }, [data, state.col, state.dir, getVal]);

  return { sorted, col: state.col, dir: state.dir, toggle };
}
