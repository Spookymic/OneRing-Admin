import type { M365User } from "@/services/graph/users";

export type AccountType = "user" | "guest" | "shared" | "room" | "equipment" | "service" | "disabled";

/**
 * Mots-clés natifs pour la détection des salles (en minuscules).
 * Appliqués sur UPN et displayName.
 */
export const ROOM_KEYWORDS = [
  "room", "salle", "conf", "meeting", "reunn", "board", "boardroom",
  "conference", "auditorium", "amphi",
];

/**
 * Mots-clés natifs pour la détection des équipements (en minuscules).
 */
export const EQUIPMENT_KEYWORDS = [
  "equip", "ressource", "imprimante", "projecteur", "beamer",
  "ecran", "écran", "scanner", "printer",
];

/**
 * Détecte le type de compte à partir des propriétés disponibles dans Graph.
 *
 * @param user      Compte utilisateur Graph
 * @param customRoomPatterns      Patterns supplémentaires admin (stockés en minuscules)
 * @param customEquipmentPatterns Patterns supplémentaires admin (stockés en minuscules)
 */
export function detectAccountType(
  user: M365User,
  customRoomPatterns: string[] = [],
  customEquipmentPatterns: string[] = []
): AccountType {
  if (user.userType === "Guest") return "guest";

  // employeeType = "Room" ou "Equipment" si configuré par Exchange
  if (user.employeeType) {
    const et = user.employeeType.toLowerCase();
    if (et === "room" || et === "salle") return "room";
    if (et === "equipment" || et === "resource") return "equipment";
  }

  const upnLower = user.userPrincipalName.toLowerCase();
  const nameLower = user.displayName.toLowerCase();

  const roomKeywords = [...ROOM_KEYWORDS, ...customRoomPatterns.map((p) => p.toLowerCase())];
  const equipKeywords = [...EQUIPMENT_KEYWORDS, ...customEquipmentPatterns.map((p) => p.toLowerCase())];

  if (roomKeywords.some((kw) => upnLower.includes(kw) || nameLower.includes(kw))) {
    return "room";
  }

  if (equipKeywords.some((kw) => upnLower.includes(kw) || nameLower.includes(kw))) {
    return "equipment";
  }

  if (!user.accountEnabled) {
    if (user.assignedLicenses.length > 0) return "disabled";
    if (user.mail) return "shared";
    return "disabled";
  }

  if (user.assignedLicenses.length === 0) {
    if (user.mail) return "shared";
    return "service";
  }

  return "user";
}

export const ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  user:      { label: "Utilisateur",     variant: "default" },
  guest:     { label: "Invité",          variant: "secondary" },
  shared:    { label: "Boîte partagée",  variant: "outline" },
  room:      { label: "Salle",           variant: "outline" },
  equipment: { label: "Équipement",      variant: "outline" },
  service:   { label: "Compte service",  variant: "secondary" },
  disabled:  { label: "Désactivé",       variant: "destructive" },
};
