import { graphFetchAll } from "@/lib/graph";

export interface ExpiringCredential {
  appObjectId: string;
  appId: string;
  appName: string;
  type: "secret" | "certificate";
  name: string | null;
  endDateTime: string;
  daysLeft: number; // négatif = déjà expiré
}

interface RawCredential {
  displayName?: string | null;
  endDateTime?: string | null;
}

interface RawApp {
  id: string;
  appId: string;
  displayName: string;
  passwordCredentials?: RawCredential[];
  keyCredentials?: RawCredential[];
}

/**
 * Certificats et secrets d'app registrations arrivant à expiration (ou déjà expirés)
 * dans `withinDays` jours. Nécessite Directory.Read(Write).All ou Application.Read.All.
 */
export async function listExpiringCredentials(
  accessToken: string,
  withinDays: number,
  now: number
): Promise<ExpiringCredential[]> {
  const apps = await graphFetchAll<RawApp>(
    accessToken,
    "/applications?$select=id,appId,displayName,passwordCredentials,keyCredentials&$top=999"
  );

  const out: ExpiringCredential[] = [];
  const add = (app: RawApp, type: "secret" | "certificate", c: RawCredential) => {
    if (!c.endDateTime) return;
    const end = new Date(c.endDateTime).getTime();
    const daysLeft = Math.ceil((end - now) / 86_400_000);
    if (daysLeft <= withinDays) {
      out.push({
        appObjectId: app.id,
        appId: app.appId,
        appName: app.displayName,
        type,
        name: c.displayName ?? null,
        endDateTime: c.endDateTime,
        daysLeft,
      });
    }
  };

  for (const app of apps) {
    (app.passwordCredentials ?? []).forEach((c) => add(app, "secret", c));
    (app.keyCredentials ?? []).forEach((c) => add(app, "certificate", c));
  }

  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
