import { apiFetch } from "@/lib/api";
import type { AdminReportResponse, MfaReportResponse } from "@/lib/identity-reports";

/**
 * Options React Query partagées entre le tableau de bord (compteurs) et l'onglet Rapports (exports) :
 * même clé de cache, donc un seul appel Graph tant que les données sont fraîches.
 */
export const mfaReportQuery = {
  queryKey: ["identity-report", "mfa"] as const,
  queryFn: () => apiFetch<MfaReportResponse>("/api/reports/mfa"),
  staleTime: 10 * 60 * 1000,
};

export const adminReportQuery = {
  queryKey: ["identity-report", "admins"] as const,
  queryFn: () => apiFetch<AdminReportResponse>("/api/reports/admins"),
  staleTime: 10 * 60 * 1000,
};
