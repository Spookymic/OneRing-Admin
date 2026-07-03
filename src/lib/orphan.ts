/**
 * Détecte un principal « orphelin » : une délégation dont le titulaire n'existe plus
 * dans l'annuaire et n'apparaît plus que sous la forme d'un SID brut (`S-1-5-…`).
 * C'est le cas des comptes supprimés encore référencés dans les permissions Exchange.
 */
export function isOrphanSid(value: string | null | undefined): boolean {
  return !!value && /^S-1-\d/i.test(value.trim());
}
