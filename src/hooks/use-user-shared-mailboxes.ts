"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { UserSharedMailboxesResponse } from "@/lib/mailbox-access";

/**
 * Boîtes partagées d'un utilisateur (délégations directes).
 *
 * Le pont Exchange construit un index des délégations par tranches : tant qu'il n'est pas prêt
 * (ou pendant une reconstruction), on rappelle la route en boucle — chaque appel fait avancer
 * l'index et renvoie la progression (`done` / `total`).
 */
export function useUserSharedMailboxes(userId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const queryKey = ["user-shared-mailboxes", userId];

  const query = useQuery<UserSharedMailboxesResponse>({
    queryKey,
    queryFn: () => apiFetch<UserSharedMailboxesResponse>(`/api/users/${userId}/shared-mailboxes`),
    enabled: enabled && !!userId,
    retry: false,
    staleTime: 60 * 1000,
    refetchInterval: (q) => {
      // Sur erreur : on arrête de boucler (sinon la dernière progression resterait affichée, figée)
      if (q.state.status === "error") return false;
      const d = q.state.data;
      return d && (!d.ready || d.building) ? 250 : false;
    },
  });

  /** Force une nouvelle analyse (les données actuelles restent affichées pendant ce temps). */
  async function refresh() {
    if (!userId) return;
    setRefreshing(true);
    try {
      const data = await apiFetch<UserSharedMailboxesResponse>(`/api/users/${userId}/shared-mailboxes?refresh=1`);
      queryClient.setQueryData(queryKey, data);
    } finally {
      setRefreshing(false);
    }
  }

  const data = query.data;
  return {
    ...query,
    mailboxes: data?.mailboxes,
    /** Index en cours de première construction : pas encore de données */
    indexing: !!data && !data.ready && !query.error,
    refresh,
    refreshing: refreshing || (!!data?.ready && data.building && !query.error),
  };
}
