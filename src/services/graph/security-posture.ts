import { graphFetch, graphFetchAll } from "@/lib/graph";
import {
  summarizeConditionalAccess,
  summarizeGuestMfaTrust,
  type CaPolicyLite,
  type ConditionalAccessPosture,
  type DirectorySyncPosture,
  type GuestMfaTrustPosture,
  type PartnerTrustLite,
  type SecurityPosture,
} from "@/lib/security-posture";

/** Exécute un appel Graph best-effort : null en cas de refus (permission, licence, rôle). */
async function tryGraph<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("[security-posture]", error instanceof Error ? error.message.slice(0, 120) : error);
    return null;
  }
}

/**
 * Posture de sécurité du tenant (lecture seule). Chaque bloc est indépendant :
 * un refus sur l'un (ex. Policy.Read.All non consentie) n'empêche pas les autres.
 * Permissions : Policy.Read.All (accès conditionnel, paramètres par défaut, accès inter-locataires),
 * Organization.Read.All (synchronisation).
 */
export async function getSecurityPosture(accessToken: string): Promise<SecurityPosture> {
  const [policies, defaults, ctDefault, ctPartners, org] = await Promise.all([
    tryGraph(() => graphFetchAll<CaPolicyLite>(accessToken, "/identity/conditionalAccess/policies")),
    tryGraph(() =>
      graphFetch<{ isEnabled?: boolean }>(accessToken, "/policies/identitySecurityDefaultsEnforcementPolicy")
    ),
    tryGraph(() =>
      graphFetch<PartnerTrustLite>(accessToken, "/policies/crossTenantAccessPolicy/default?$select=inboundTrust")
    ),
    tryGraph(() => graphFetchAll<PartnerTrustLite>(accessToken, "/policies/crossTenantAccessPolicy/partners")),
    tryGraph(() =>
      graphFetch<{ value: { onPremisesSyncEnabled?: boolean | null; onPremisesLastSyncDateTime?: string | null }[] }>(
        accessToken,
        "/organization?$select=onPremisesSyncEnabled,onPremisesLastSyncDateTime"
      )
    ),
  ]);

  const securityDefaults = defaults ? defaults.isEnabled === true : null;
  const conditionalAccess: ConditionalAccessPosture = policies
    ? summarizeConditionalAccess(policies, securityDefaults)
    : {
        supported: false, enabled: 0, reportOnly: 0, disabled: 0,
        securityDefaults, mfaAllUsers: securityDefaults === true, mfaGlobalAdmins: securityDefaults === true,
      };

  const guestMfaTrust: GuestMfaTrustPosture = ctDefault
    ? summarizeGuestMfaTrust(ctDefault.inboundTrust?.isMfaAccepted ?? false, ctPartners ?? [])
    : { supported: false, defaultAccepted: null, partnersTotal: 0, partnersAccepting: 0 };

  const o = org?.value?.[0];
  const directorySync: DirectorySyncPosture = o
    ? { supported: true, enabled: o.onPremisesSyncEnabled === true, lastSync: o.onPremisesLastSyncDateTime ?? null }
    : { supported: false, enabled: false, lastSync: null };

  return { conditionalAccess, guestMfaTrust, directorySync, generatedAt: new Date().toISOString() };
}
