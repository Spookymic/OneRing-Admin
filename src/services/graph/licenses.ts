import { graphFetch } from "@/lib/graph";

export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  consumedUnits: number;
  prepaidUnits: { enabled: number; suspended: number; warning: number };
  servicePlans?: { servicePlanName: string; provisioningStatus: string }[];
}

export async function listSubscribedSkus(accessToken: string): Promise<SubscribedSku[]> {
  const data = await graphFetch<{ value: SubscribedSku[] }>(accessToken, "/subscribedSkus");
  return data.value;
}

export async function assignLicense(
  accessToken: string,
  userId: string,
  skuId: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}/assignLicense`, {
    method: "POST",
    body: JSON.stringify({ addLicenses: [{ skuId }], removeLicenses: [] }),
  });
}

export async function removeLicense(
  accessToken: string,
  userId: string,
  skuId: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}/assignLicense`, {
    method: "POST",
    body: JSON.stringify({ addLicenses: [], removeLicenses: [skuId] }),
  });
}
