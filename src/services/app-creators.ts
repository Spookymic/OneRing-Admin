import { prisma } from "@/lib/prisma";
import { listAppCreationEvents, type AppCreator } from "@/services/graph/applications";

/**
 * Créateurs des inscriptions d'applications.
 *
 * Le journal d'audit Entra n'est conservé que ~30 jours : chaque lecture (écrans Applications et
 * Secrets & certificats, synchronisation quotidienne de `src/instrumentation.ts`) recopie les
 * événements « Add application » en base. Le créateur reste ainsi connu après la purge d'Entra.
 */

/** Lit le journal d'audit, enregistre les nouveaux événements et renvoie tous les créateurs connus. */
export async function syncAndLoadAppCreators(accessToken: string): Promise<Map<string, AppCreator>> {
  const events = await listAppCreationEvents(accessToken);
  const map = new Map<string, AppCreator>(events.map((e) => [e.appObjectId, { by: e.by, at: e.at }]));
  try {
    if (events.length > 0) {
      await prisma.appCreation.createMany({
        data: events.map((e) => ({
          appObjectId: e.appObjectId,
          appName: e.appName,
          createdBy: e.by,
          createdAt: new Date(e.at),
        })),
        skipDuplicates: true,
      });
    }
    const stored = await prisma.appCreation.findMany({ select: { appObjectId: true, createdBy: true, createdAt: true } });
    for (const s of stored) {
      if (!map.has(s.appObjectId)) map.set(s.appObjectId, { by: s.createdBy, at: s.createdAt.toISOString() });
    }
  } catch (error) {
    // Base indisponible : on se contente du journal Entra (non bloquant).
    console.error("[app-creators] base indisponible:", error instanceof Error ? error.message.slice(0, 120) : error);
  }
  return map;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const globalForSync = globalThis as unknown as { appCreatorsSync?: NodeJS.Timeout };

/**
 * Synchronisation quotidienne avec le jeton app-only (AuditLog.Read.All applicatif) : garantit la
 * copie des événements même si personne n'ouvre les écrans pendant 30 jours. Best-effort.
 */
export function startAppCreatorsDailySync(): void {
  if (globalForSync.appCreatorsSync) return;
  const run = async () => {
    try {
      const { getAppOnlyGraphToken } = await import("@/lib/graph-app");
      const map = await syncAndLoadAppCreators(await getAppOnlyGraphToken());
      console.info(`[app-creators] synchronisation : ${map.size} créateur(s) connu(s)`);
    } catch (error) {
      console.error("[app-creators] synchronisation impossible:", error instanceof Error ? error.message.slice(0, 120) : error);
    }
  };
  // Premier passage différé : laisse le serveur démarrer.
  setTimeout(run, 60_000).unref();
  globalForSync.appCreatorsSync = setInterval(run, DAY_MS);
  globalForSync.appCreatorsSync.unref();
}
