import crypto from "crypto";

/**
 * Chiffrement symétrique au repos pour les secrets sensibles (secret TOTP).
 * AES-256-GCM. La clé dérive de TOTP_ENCRYPTION_KEY (recommandé, dédié) ou, à défaut,
 * de NEXTAUTH_SECRET. Format stocké : `enc:v1:<iv>:<tag>:<ciphertext>` (base64).
 *
 * Rétro-compatibilité : une valeur sans le préfixe `enc:` est considérée en clair
 * (secret d'avant le chiffrement) et renvoyée telle quelle par decryptSecret ; elle
 * sera ré-écrite chiffrée à la prochaine (re)configuration.
 */
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const material = process.env.TOTP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
  if (!material) {
    throw new Error("TOTP_ENCRYPTION_KEY ou NEXTAUTH_SECRET requis pour chiffrer les secrets TOTP");
  }
  return crypto.createHash("sha256").update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // rétro-compat : ancien secret en clair
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
