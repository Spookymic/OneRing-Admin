import { bridgeFetch } from "@/services/exchange/client";

/** Paramètres d'un site SharePoint (source : Get-PnPTenantSite via le pont, app-only). */
export interface SpoSiteSettings {
  url: string;
  template: string | null;
  sharingCapability: string | null;
  lockState: string | null;
  sensitivityLabel: string | null;
  storageQuotaMB: number | null;
  storageUsageCurrentMB: number | null;
  isHubSite: boolean | null;
  groupId: string | null;
  conditionalAccessPolicy: string | null;
  denyAddAndCustomizePages: string | null;
}

/** Récupère les paramètres de tous les sites (un seul Get-PnPTenantSite). */
export async function getSpoSiteSettings(): Promise<SpoSiteSettings[]> {
  const data = await bridgeFetch<{ sites?: SpoSiteSettings[] }>("/sharepoint/site-settings");
  return data.sites ?? [];
}
