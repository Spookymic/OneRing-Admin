import type { Client } from "@microsoft/microsoft-graph-client";

export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  consumedUnits: number;
  prepaidUnits: { enabled: number; suspended: number; warning: number };
}

export async function listSubscribedSkus(client: Client): Promise<SubscribedSku[]> {
  const response = await client.api("/subscribedSkus").get();
  return response.value;
}

export async function assignLicense(
  client: Client,
  userId: string,
  skuId: string
): Promise<void> {
  await client.api(`/users/${userId}/assignLicense`).post({
    addLicenses: [{ skuId }],
    removeLicenses: [],
  });
}

export async function removeLicense(
  client: Client,
  userId: string,
  skuId: string
): Promise<void> {
  await client.api(`/users/${userId}/assignLicense`).post({
    addLicenses: [],
    removeLicenses: [skuId],
  });
}
