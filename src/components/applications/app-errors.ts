/** Message lisible pour les refus des routes /api/applications/*. */
export function appErrorMessage(message: string): string {
  if (message === "app_forbidden") {
    return "Droits insuffisants : un rôle Administrateur d'applications, Administrateur d'applications cloud ou Administrateur général est requis.";
  }
  return message;
}
