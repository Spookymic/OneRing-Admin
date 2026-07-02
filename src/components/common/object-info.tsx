"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

interface Props {
  id: string;
  type: "user" | "group";
  createdDateTime?: string | null;
  /** Graph : `true` si synchronisé depuis l'AD, `null` si cloud, `undefined` si non chargé */
  onPremisesSyncEnabled?: boolean | null;
  open?: boolean;
}

export function ObjectInfo({ id, type, createdDateTime, onPremisesSyncEnabled, open = true }: Props) {
  // Créateur : best-effort via journaux d'audit Entra (objets récents uniquement)
  const { data: creator } = useQuery<{ by: string | null; at: string | null }>({
    queryKey: ["creator", type, id],
    queryFn: () => apiFetch<{ by: string | null; at: string | null }>(`/api/directory/creator?id=${id}&type=${type}`),
    enabled: open && !!id,
    staleTime: 10 * 60 * 1000,
  });

  const created = createdDateTime
    ? format(new Date(createdDateTime), "dd MMM yyyy", { locale: fr })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
      {created && <span>Créé le {created}</span>}
      {creator?.by && <span>par {creator.by}</span>}
      {onPremisesSyncEnabled === true && (
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
          Synchronisé AD
        </Badge>
      )}
      {onPremisesSyncEnabled === null && <span className="text-foreground/35">Cloud</span>}
    </div>
  );
}
