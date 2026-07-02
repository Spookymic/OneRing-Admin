import { authenticator } from "otplib";

// Fenêtre de tolérance : accepte le code précédent/suivant (décalage d'horloge)
authenticator.options = { window: 1 };

const ISSUER = "OneRing Admin";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** URI otpauth:// à encoder dans un QR code pour les applications d'authentification. */
export function totpKeyUri(username: string, secret: string): string {
  return authenticator.keyuri(username, ISSUER, secret);
}

/** Vérifie un code à 6 chiffres contre le secret. Renvoie false si le code est invalide/vide. */
export function verifyTotp(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ""), secret });
  } catch {
    return false;
  }
}
