import { graphFetchAll } from "@/lib/graph";
import {
  latest,
  usageStatus,
  type AppSignInActivity,
  type UsageStatus,
} from "@/lib/credential-usage";

export interface ExpiringCredential {
  appObjectId: string;
  appId: string;
  appName: string;
  type: "secret" | "certificate";
  name: string | null;
  /** Identifiant de l'identifiant (clé de rapprochement avec les rapports d'activité). */
  keyId: string | null;
  endDateTime: string;
  daysLeft: number; // négatif = déjà expiré
  /** Date de création de l'inscription d'application. */
  appCreatedDateTime: string | null;
  /** Propriétaires de l'inscription (le créateur via le portail en fait partie d'office). */
  appOwners: AppOwner[];
  /** Renseignés uniquement si l'utilisation a été demandée (`withUsage`). */
  lastUsed?: string | null;
  usage?: UsageStatus;
  app?: AppSignInActivity | null;
  /** Créateur exact d'après le journal d'audit (conservé ~30 j) ; null si plus ancien. */
  appCreator?: AppCreator | null;
}

export interface AppOwner {
  displayName: string;
  userPrincipalName: string | null;
  /** Utilisateur ou application (principal de service). */
  kind: "user" | "servicePrincipal" | "other";
}

export interface AppCreator {
  by: string;
  at: string;
}

interface RawCredential {
  keyId?: string | null;
  displayName?: string | null;
  endDateTime?: string | null;
}

interface RawOwner {
  "@odata.type"?: string;
  displayName?: string | null;
  userPrincipalName?: string | null;
}

interface RawApp {
  id: string;
  appId: string;
  displayName: string;
  createdDateTime?: string | null;
  owners?: RawOwner[];
  passwordCredentials?: RawCredential[];
  keyCredentials?: RawCredential[];
}

function toOwner(o: RawOwner): AppOwner {
  const t = (o["@odata.type"] ?? "").replace("#microsoft.graph.", "");
  return {
    displayName: o.displayName ?? o.userPrincipalName ?? "(sans nom)",
    userPrincipalName: o.userPrincipalName ?? null,
    kind: t === "user" || t === "servicePrincipal" ? t : "other",
  };
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
    "/applications?$select=id,appId,displayName,createdDateTime,passwordCredentials,keyCredentials" +
      "&$expand=owners($select=id,displayName,userPrincipalName)&$top=999"
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
        keyId: c.keyId ?? null,
        endDateTime: c.endDateTime,
        daysLeft,
        appCreatedDateTime: app.createdDateTime ?? null,
        appOwners: (app.owners ?? []).map(toOwner),
      });
    }
  };

  for (const app of apps) {
    (app.passwordCredentials ?? []).forEach((c) => add(app, "secret", c));
    (app.keyCredentials ?? []).forEach((c) => add(app, "certificate", c));
  }

  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ── Utilisation (rapports d'activité Entra, API beta) ───────────────

const BETA = "https://graph.microsoft.com/beta";

interface RawCredentialActivity {
  keyId: string;
  signInActivity?: { lastSignInDateTime?: string | null } | null;
}

type RawActivity = { lastSignInDateTime?: string | null } | null | undefined;

interface RawSpActivity {
  appId: string;
  lastSignInActivity?: RawActivity;
  delegatedClientSignInActivity?: RawActivity;
  applicationAuthenticationClientSignInActivity?: RawActivity;
}

export interface CredentialUsageIndex {
  supported: boolean;
  /** keyId (minuscules) → dernière utilisation. Absent = jamais vu par Microsoft. */
  byKeyId: Map<string, string | null>;
  /** appId → activité de connexion de l'application. */
  byAppId: Map<string, AppSignInActivity>;
}

/**
 * Index d'utilisation des identifiants et des applications.
 * Rapports en préversion (beta) ; requièrent AuditLog.Read.All et un rôle de lecture
 * (Lecteur général, Lecteur sécurité, Lecteur de rapports…). Refus → `supported: false`.
 */
export async function getCredentialUsageIndex(accessToken: string): Promise<CredentialUsageIndex> {
  try {
    const [creds, sps] = await Promise.all([
      graphFetchAll<RawCredentialActivity>(accessToken, `${BETA}/reports/appCredentialSignInActivities`),
      graphFetchAll<RawSpActivity>(accessToken, `${BETA}/reports/servicePrincipalSignInActivities`),
    ]);
    const byKeyId = new Map<string, string | null>();
    // Un même identifiant peut figurer plusieurs fois (une ligne par ressource) : date la plus récente.
    for (const c of creds) {
      const k = c.keyId.toLowerCase();
      byKeyId.set(k, latest(byKeyId.get(k), c.signInActivity?.lastSignInDateTime));
    }
    const byAppId = new Map<string, AppSignInActivity>();
    for (const s of sps) {
      byAppId.set(s.appId, {
        lastSignIn: s.lastSignInActivity?.lastSignInDateTime ?? null,
        lastDelegated: s.delegatedClientSignInActivity?.lastSignInDateTime ?? null,
        lastAppOnly: s.applicationAuthenticationClientSignInActivity?.lastSignInDateTime ?? null,
      });
    }
    return { supported: true, byKeyId, byAppId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.startsWith("[403]") || msg.startsWith("[400]")) {
      return { supported: false, byKeyId: new Map(), byAppId: new Map() };
    }
    throw error;
  }
}

interface RawAuditEvent {
  activityDateTime?: string;
  initiatedBy?: {
    user?: { userPrincipalName?: string | null; displayName?: string | null } | null;
    app?: { displayName?: string | null } | null;
  } | null;
  targetResources?: { id?: string | null; type?: string | null }[];
}

/**
 * Créateurs des inscriptions d'applications d'après le journal d'audit Entra (« Add application »).
 * Un seul appel paginé. Le journal n'est conservé que ~30 jours (7 sans licence P1) :
 * les applications plus anciennes n'y figurent pas. Best-effort : map vide en cas de refus.
 */
export async function getAppCreators(accessToken: string): Promise<Map<string, AppCreator>> {
  const map = new Map<string, AppCreator>();
  try {
    const filter = encodeURIComponent("activityDisplayName eq 'Add application'");
    const events = await graphFetchAll<RawAuditEvent>(
      accessToken,
      `/auditLogs/directoryAudits?$filter=${filter}&$top=999`
    );
    for (const e of events) {
      const target = (e.targetResources ?? []).find((t) => t.type === "Application") ?? e.targetResources?.[0];
      const by =
        e.initiatedBy?.user?.userPrincipalName ??
        e.initiatedBy?.user?.displayName ??
        e.initiatedBy?.app?.displayName ??
        null;
      if (target?.id && by && e.activityDateTime) map.set(target.id, { by, at: e.activityDateTime });
    }
  } catch (error) {
    console.error("[applications] journal d'audit indisponible:", error instanceof Error ? error.message.slice(0, 120) : error);
  }
  return map;
}

/** Ajoute la dernière utilisation, le statut et le créateur (journal d'audit) à chaque identifiant. */
export function withUsage(
  credentials: ExpiringCredential[],
  index: CredentialUsageIndex,
  now: number,
  creators: Map<string, AppCreator> = new Map()
): ExpiringCredential[] {
  return credentials.map((c) => {
    const lastUsed = c.keyId ? (index.byKeyId.get(c.keyId.toLowerCase()) ?? null) : null;
    return {
      ...c,
      lastUsed,
      usage: usageStatus(lastUsed, now, index.supported),
      app: index.supported ? (index.byAppId.get(c.appId) ?? null) : null,
      appCreator: creators.get(c.appObjectId) ?? null,
    };
  });
}
