"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, HardDrive, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { CopilotUsageResponse } from "@/lib/copilot";
import type { StorageItem } from "@/services/graph/reports";

/** Seuil d'alerte de remplissage d'une boîte aux lettres / d'un OneDrive. */
const QUOTA_ALERT_RATIO = 0.9;
const COPILOT_PERIOD = 28;

type StorageResponse = { supported: boolean; items: StorageItem[] };

function nearQuota(items: StorageItem[] | undefined): number {
  return (items ?? []).filter((i) => i.allocated > 0 && i.used / i.allocated >= QUOTA_ALERT_RATIO).length;
}

function UsageCard({
  title, value, sub, icon: Icon, loading, href,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  loading: boolean;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Card className="relative p-5 flex items-start gap-4 h-full transition-colors hover:bg-foreground/5">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground/60">{title}</p>
          {loading ? <Skeleton className="h-7 w-16 mt-1" /> : <p className="text-2xl font-bold mt-0.5">{value}</p>}
          {sub && !loading && <p className="text-xs text-foreground/40 mt-0.5">{sub}</p>}
        </div>
        <ChevronRight className="absolute top-5 right-5 h-4 w-4 text-foreground/30" />
      </Card>
    </Link>
  );
}

/**
 * Cartes d'usage : adoption Microsoft 365 Copilot et espaces proches du quota.
 * Mêmes clés de cache que les écrans Copilot et Stockage (un seul chargement).
 */
export function UsageCards() {
  const { data: copilot, isLoading: copilotLoading } = useQuery<CopilotUsageResponse>({
    queryKey: ["copilot-usage", COPILOT_PERIOD],
    queryFn: () => apiFetch<CopilotUsageResponse>(`/api/copilot/usage?period=${COPILOT_PERIOD}`),
    staleTime: 30 * 60 * 1000,
  });
  const { data: mailboxes, isLoading: mbxLoading } = useQuery<StorageResponse>({
    queryKey: ["storage", "exchange"],
    queryFn: () => apiFetch<StorageResponse>("/api/reports/storage?type=exchange"),
    staleTime: 30 * 60 * 1000,
  });
  const { data: onedrive, isLoading: odLoading } = useQuery<StorageResponse>({
    queryKey: ["storage", "onedrive"],
    queryFn: () => apiFetch<StorageResponse>("/api/reports/storage?type=onedrive"),
    staleTime: 30 * 60 * 1000,
  });

  // Copilot : titulaires d'une licence = tous sauf « sans licence »
  const licensed = (copilot?.users ?? []).filter((u) => u.status !== "unlicensed");
  const active = licensed.filter((u) => u.status === "active").length;
  const unused = licensed.length - active;
  const adoption = licensed.length > 0 ? Math.round((active / licensed.length) * 100) : 0;
  const showCopilot = copilotLoading || (copilot?.supported && licensed.length > 0);

  const storageSupported = !!mailboxes?.supported || !!onedrive?.supported;
  const mbxFull = nearQuota(mailboxes?.items);
  const odFull = nearQuota(onedrive?.items);

  if (!showCopilot && !storageSupported && !mbxLoading && !odLoading) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {showCopilot && (
        <UsageCard
          title={`Adoption Copilot (${COPILOT_PERIOD} j)`}
          value={`${adoption} %`}
          sub={`${active}/${licensed.length} utilisateurs actifs · ${unused} licence(s) inutilisée(s)`}
          icon={Sparkles}
          loading={copilotLoading}
          href="/dashboard/copilot"
        />
      )}
      {(storageSupported || mbxLoading || odLoading) && (
        <UsageCard
          title={`Espaces remplis à ${Math.round(QUOTA_ALERT_RATIO * 100)} % ou plus`}
          value={mbxFull + odFull}
          sub={`${mbxFull} boîte(s) aux lettres · ${odFull} OneDrive`}
          icon={HardDrive}
          loading={mbxLoading || odLoading}
          href="/dashboard/storage"
        />
      )}
    </div>
  );
}
