/** Démarrage du serveur Next.js : tâches de fond (runtime Node uniquement). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAppCreatorsDailySync } = await import("@/services/app-creators");
  startAppCreatorsDailySync();
}
