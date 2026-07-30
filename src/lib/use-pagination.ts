import { useMemo, useState } from "react";

export interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  pageCount: number;
  totalItems: number;
  pageItems: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Pagination d'affichage côté client : le jeu de données complet reste inchangé
 * (recherche, tri, sélection, export continuent de porter sur `items`) — seule
 * la tranche à rendre (`pageItems`) est calculée ici.
 */
export function usePagination<T>(items: T[], defaultPageSize = 50): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clampe la page courante si le jeu de données filtré a rétréci (évite une page vide).
  const currentPage = Math.min(page, pageCount);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return {
    page: currentPage,
    pageSize,
    pageCount,
    totalItems: items.length,
    pageItems,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}
