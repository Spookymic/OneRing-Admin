import { graphFetch, graphFetchAll } from "@/lib/graph";

/**
 * Appareils / postes de travail à travers les 3 référentiels Microsoft :
 * Entra ID (annuaire), Intune (MDM) et Autopilot. Chaque source est best-effort
 * (nécessite sa propre permission ; un 403 ne casse pas les autres).
 */

export interface EntraDevice {
  id: string;            // objet Entra
  deviceId: string | null; // GUID appareil Azure AD (clé de corrélation)
  displayName: string;
  operatingSystem: string | null;
  operatingSystemVersion: string | null;
  trustType: string | null;
  approximateLastSignInDateTime: string | null;
  accountEnabled: boolean | null;
  isManaged: boolean | null;
  isCompliant: boolean | null;
}

export interface IntuneDevice {
  id: string;
  deviceName: string;
  azureADDeviceId: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  complianceState: string | null;
  managedDeviceOwnerType: string | null;
  userPrincipalName: string | null;
  lastSyncDateTime: string | null;
}

export interface AutopilotDevice {
  id: string;
  serialNumber: string | null;
  azureAdDeviceId: string | null;
  model: string | null;
  manufacturer: string | null;
  displayName: string | null;
}

const ENTRA_SELECT =
  "id,deviceId,displayName,operatingSystem,operatingSystemVersion,trustType,approximateLastSignInDateTime,accountEnabled,isManaged,isCompliant";

/** Appareils Entra ID (annuaire). Requiert Device.Read.All / Device.ReadWrite.All. */
export async function listEntraDevices(accessToken: string): Promise<EntraDevice[]> {
  return graphFetchAll<EntraDevice>(accessToken, `/devices?$select=${ENTRA_SELECT}&$top=999`);
}

const INTUNE_SELECT =
  "id,deviceName,azureADDeviceId,serialNumber,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,lastSyncDateTime";

/** Appareils gérés Intune. Requiert DeviceManagementManagedDevices.Read/ReadWrite.All. */
export async function listIntuneDevices(accessToken: string): Promise<IntuneDevice[]> {
  return graphFetchAll<IntuneDevice>(accessToken, `/deviceManagement/managedDevices?$select=${INTUNE_SELECT}&$top=999`);
}

/** Identités Autopilot. Requiert DeviceManagementServiceConfig.Read/ReadWrite.All. */
export async function listAutopilotDevices(accessToken: string): Promise<AutopilotDevice[]> {
  return graphFetchAll<AutopilotDevice>(
    accessToken,
    `/deviceManagement/windowsAutopilotDeviceIdentities?$top=999`
  );
}

export async function deleteEntraDevice(accessToken: string, id: string): Promise<void> {
  await graphFetch(accessToken, `/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function deleteIntuneDevice(accessToken: string, id: string): Promise<void> {
  await graphFetch(accessToken, `/deviceManagement/managedDevices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function deleteAutopilotDevice(accessToken: string, id: string): Promise<void> {
  await graphFetch(
    accessToken,
    `/deviceManagement/windowsAutopilotDeviceIdentities/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
