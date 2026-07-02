# Rapport d'audit de sécurité — OneRing Admin

> **Date** : 2026-07-02 · **Version auditée** : 1.22.1 · **Type** : audit de code en lecture seule (aucune modification)
> **Méthode** : 4 revues parallèles indépendantes — (1) authentification & autorisation, (2) injections & pont Exchange, (3) secrets & cryptographie, (4) sécurité web & infrastructure.
> **Statut** : document d'information / suivi. Les corrections ne sont **pas** appliquées dans ce rapport.

## Résumé exécutif

Aucune faille **Critique** ni exploitable à distance sans authentification. Les deux points **Élevés** relèvent surtout du durcissement de déploiement (rotation des secrets, en-têtes HTTP). Le modèle de sécurité repose volontairement sur les **droits du compte connecté** (jeton Graph délégué) : l'autorisation fine est déléguée à Entra, sans défense en profondeur applicative — conforme à `CLAUDE.md`, mais toute faille d'injection/validation devient alors la seule ligne de défense côté app.

| Sévérité | Nombre |
|----------|--------|
| Critique | 0 |
| Élevée   | 2 |
| Moyenne  | 9 |
| Faible   | 9 |
| Info     | 3 |

`✔✔` = finding confirmé indépendamment par plusieurs revues (confiance élevée).

---

## 🔴 Élevée

### E1 — Secrets de production réels en clair dans `.env`
**Emplacement** : `.env:2-19`
`AZURE_AD_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `EXO_BRIDGE_SECRET`, `EXO_CERT_PASSWORD` ont l'apparence de vraies valeurs. Non committés (`.gitignore` / `.dockerignore` vérifiés OK, `.pfx` monté en lecture seule au runtime), mais en clair dans un profil utilisateur Windows → exposés à tout backup/synchro cloud/copie/process tiers. Le client secret Azure ouvre l'app registration à scopes larges.
**Correctif** : traiter comme compromis et faire tourner l'ensemble des secrets ; ne pas conserver de valeurs réelles dans un working tree partagé.

### E2 — Absence totale d'en-têtes de sécurité (clickjacking)
**Emplacement** : `next.config.ts` (aucun `headers()`), `Caddyfile` (aucun bloc `header`)
Ni CSP, ni `X-Frame-Options`/`frame-ancestors`, ni `Strict-Transport-Security`, ni `X-Content-Type-Options: nosniff`. Sur une console qui réinitialise des mots de passe et offboarde des comptes, l'absence d'anti-clickjacking permet à un site tiers d'intégrer l'app en iframe et de piéger un admin authentifié.
**Correctif** : bloc `headers()` (Next) ou `header {}` (Caddy) — `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, CSP `frame-ancestors 'none'`.

---

## 🟠 Moyenne

### M1 — La 2FA `setup` désactive la 2FA sans code courant ni audit ✔✔
**Emplacement** : `src/app/api/admin/local-admin/totp/route.ts:45-54`
`disable` exige un code TOTP valide, mais `setup` écrit `{ totpSecret: <nouveau>, totpEnabled: false }` sans exiger le code courant et sans `logAudit`. Une session locale déjà compromise (cookie volé, poste ouvert) peut appeler `POST {"action":"setup"}` pour ramener `totpEnabled=false` silencieusement → les connexions suivantes ne réclament plus la 2FA.
**Correctif** : exiger un code TOTP courant pour re-provisionner quand `totpEnabled` est déjà vrai ; journaliser l'action.

### M2 — Rôle en lecture seule « Directory Readers » accorde l'accès complet
**Emplacement** : `src/lib/auth.ts:18` (`88d8e3e3-8f55-4a1e-953a-9b9898b8876b`)
Le callback `signIn` accorde l'accès dès qu'un rôle de la liste est présent. Un titulaire read-only obtient une session avec un jeton portant les scopes délégués ReadWrite et accède à tout le périmètre de lecture sensible (auth-methods, signin-logs, credentials, audit). Les écritures échouent au niveau Graph, mais l'exposition en lecture est plus large que voulu.
**Correctif** : retirer « Directory Readers » de `ADMIN_ROLE_TEMPLATE_IDS`, ou restreindre les routes de lecture sensibles.

### M3 — Injection OData `$filter` non échappée
**Emplacement** : `src/services/graph/users.ts:103` (`userId eq '${userId}'`), `src/services/graph/directory.ts:20` (`targetResources/any(...eq '${id}')`)
`userId`/`id` proviennent de segments de route / query non validés et non échappés. Une apostrophe ou une clause OData injectée altère le filtre (borné par le scope du jeton). Défense en profondeur absente.
**Correctif** : échapper (`id.replace(/'/g, "''")`), valider en UUID, borner ces routes à des GUID.

### M4 — Routes de mutation sans validation Zod
**Emplacement** : `src/app/api/users/[id]/mailbox-settings/route.ts:41-46`, `src/app/api/users/[id]/roles/route.ts:37-41`, `src/app/api/users/[id]/teams-presence/route.ts:19-21`, `src/app/api/users/[id]/route.ts:17-21`
Violation de la règle CLAUDE.md « Zod obligatoire côté serveur avant tout appel Graph ». Le plus sensible : `users/[id]/roles` (attribution de rôles d'annuaire, endpoint privilégié) ne valide que la présence de `roleId`, pas son format, et l'interpole dans le chemin Graph.
**Correctif** : schémas Zod (`roleId` en `uuid()`, statut/scope/longueur des messages OOO et Teams, `accountEnabled` booléen).

### M5 — Conteneur `exo-bridge` en root
**Emplacement** : `exo-bridge/Dockerfile` (aucune directive `USER`)
Contrairement au Dockerfile principal (`USER nextjs`, uid 1001). Le bridge monte le `.pfx` app-only Exchange → une RCE Pode/EXO donnerait root + accès au certificat d'admin Exchange.
**Correctif** : créer un utilisateur non privilégié et `USER` avant `CMD`.

### M6 — Injection de formule CSV dans les exports ✔✔
**Emplacement** : `src/app/dashboard/audit/page.tsx:142-161`, `src/components/users/user-groups-sheet.tsx:616-638`
Les exports échappent les guillemets mais pas les préfixes de formule (`=`, `+`, `-`, `@`, tab, CR). Des champs issus de données Graph (displayName, nom de groupe, appDisplayName) valant `=HYPERLINK(...)` ou `=cmd|'/c calc'!A1` s'exécutent à l'ouverture dans Excel côté poste de l'admin.
**Correctif** : préfixer d'une apostrophe toute valeur commençant par `= + - @`/tab/CR avant le quotage.

### M7 — Secret TOTP stocké en clair en base
**Emplacement** : `prisma/schema.prisma:76` (`totpSecret String?`), `src/app/api/admin/local-admin/totp/route.ts:47-49`
Le secret base32 est écrit brut. Un accès lecture Postgres (dump, backup, mot de passe faible) permet de régénérer des codes valides et neutraliser la 2FA du compte de secours.
**Correctif** : chiffrer le champ au repos avec une clé applicative distincte de la DB.

### M8 — Mot de passe PostgreSQL par défaut `changeme` ✔✔
**Emplacement** : `docker-compose.yml:9,22,79` (`${POSTGRES_PASSWORD:-changeme}`), `.env:13`
Fallback trivial, et c'est la valeur actuelle. Port non publié (atténuation), mais tout accès au réseau interne Docker donne la base entière (audit_logs, hash admin, totpSecret).
**Correctif** : supprimer le fallback ou faire échouer le démarrage si non défini ; définir un mot de passe fort.

### M9 — Mot de passe du certificat `.pfx` faible (`conserto`)
**Emplacement** : `.env:18`, `exo-bridge/ExoHelpers.psm1:12-17`
Le `.pfx` (auth app-only Exchange) est protégé par un mot du dictionnaire de 8 caractères. Si le `.pfx` fuit, il est trivialement déchiffrable → authentification app-only Exchange Online complète.
**Correctif** : passphrase forte aléatoire.

---

## 🟡 Faible

### B1 — Confinement de l'admin local à l'Administration purement côté client
**Emplacement** : `src/components/layout/dashboard-shell.tsx:17-21`, `src/app/dashboard/layout.tsx:6-11`
Le layout serveur ne vérifie que `if (!session)`, pas le rôle ; seule la redirection React confine l'admin local. Impact réel cosmétique : les données restent bloquées côté serveur (401 sur les routes Graph via `accessToken` forcé à `undefined`).
**Correctif** : dupliquer le contrôle de rôle dans `layout.tsx`.

### B2 — `GET /api/admin/local-admin` ouvert à toute session ✔✔
**Emplacement** : `src/app/api/admin/local-admin/route.ts:10-20`
Ne vérifie que `session?.user` → un admin local (ou session compromise) liste tous les `username` + statut `totpEnabled` (reconnaissance des comptes sans 2FA). Aucun hash exposé.
**Correctif** : exiger `session?.accessToken` (SSO) ou restreindre au compte local courant.

### B3 — Énumération d'utilisateurs par timing sur le login local ✔✔
**Emplacement** : `src/lib/auth.ts:50-51`
`return null` immédiat si le compte n'existe pas, sans exécuter `bcrypt.compare` → écart de temps mesurable révélant les identifiants valides. (La casse n'est pas contournable : `findUnique` exact.)
**Correctif** : exécuter un `bcrypt.compare` factice pour les comptes inexistants.

### B4 — Identifiants interpolés dans les chemins Graph sans `encodeURIComponent`
**Emplacement** : `src/services/graph/users.ts`, `groups.ts`, `roles.ts`, `licenses.ts` (nombreux `/…/${id}/…`)
Un `?` dans une valeur d'id permet d'injecter/fusionner des query params OData sur un GET. Impact limité (borné par le scope du jeton). `skuId` est validé `uuid()`.
**Correctif** : `encodeURIComponent` sur tous les segments d'identifiant.

### B5 — CSRF : mutations reposant sur le cookie de session (SameSite implicite)
**Emplacement** : `src/lib/auth.ts` (aucun bloc `cookies`)
NextAuth v4 applique `SameSite=lax` par défaut → les mutations non-GET sont en pratique protégées, mais le contrôle est **implicite** (dépend du défaut du framework).
**Correctif** : verrouiller explicitement `cookies.sessionToken.options.sameSite = "lax"` (voire `strict`) ; ne jamais créer de route de mutation en GET.

### B6 — Écriture d'entrées d'audit à contenu libre
**Emplacement** : `src/app/api/audit/route.ts:21-38`
Le POST accepte `payloadBefore`/`payloadAfter` arbitraires (action figée `ADMIN_SETTINGS_UPDATE`, cible forcée à l'email appelant). Permet d'injecter du bruit / contenus trompeurs dans le journal ; cible et action non usurpables.
**Correctif** : valider/restreindre le contenu, ou générer l'entrée côté serveur.

### B7 — Bridge : comparaison de secret non constant-time + `/health` non authentifié ✔✔
**Emplacement** : `exo-bridge/server.ps1:40,49`
`$provided -ne $env:EXO_BRIDGE_SECRET` (timing) ; `/health` contourne l'auth et divulgue `$env:EXO_ORG` (domaine tenant). Réseau interne uniquement.
**Correctif** : comparaison à temps constant ; retirer `EXO_ORG` de `/health` ou l'authentifier.

### B8 — Politique de mot de passe admin local permissive
**Emplacement** : `src/app/api/admin/local-admin/route.ts:24` (`min(8)`), `:38` (bcrypt cost 10)
Le compte de secours n'exige que 8 caractères sans complexité (vs 12 pour le reset des utilisateurs M365). Anti-brute-force présent (5 échecs → 15 min). bcrypt cost 10 acceptable mais sous le 12 recommandé.
**Correctif** : `min(12)` + coût bcrypt 12.

### B9 — `graphFetch` logge le corps d'erreur complet et le claim `scp`
**Emplacement** : `src/lib/graph.ts:29,33-36`
Le corps d'erreur Graph (peut contenir UPN/PII selon l'endpoint) et le claim `scp` du jeton sont loggés. Le token n'est **pas** logué en entier ; décodage encadré par try/catch.
**Correctif** : filtrer/rotationner les logs applicatifs contenant de la PII.

---

## ℹ️ Informationnel / conception

- **Autorisation applicative = « possède un jeton Graph »** : toute session `graph` peut appeler toute route de mutation ; la granularité est entièrement déléguée à Entra. Conforme à `CLAUDE.md`, mais pas de défense en profondeur.
- **Déconnexion pour inactivité 100 % côté client** (`inactivity-watcher.tsx`, 10 min) ; JWT pur non révocable jusqu'à `maxAge` 8h (le PrismaAdapter a été retiré volontairement).
- **`@auth/prisma-adapter`** reste dans `package.json` — dépendance morte sans impact sécurité. Fallback `APP_DOMAIN:localhost` = mauvaise config plutôt qu'exposition.

---

## Points forts confirmés

- ✅ **Aucune injection de commande PowerShell** dans le pont Exchange : liaison de paramètres nommés uniquement, aucun `Invoke-Expression`, aucune construction de commande par concaténation, aucun `-Filter` OPATH exposé. `action`/`type` en liste blanche côté PS **et** côté app.
- ✅ **Les 41 routes API** appellent toutes `getServerSession` ; le **confinement Graph de l'admin local est appliqué côté serveur** (le callback `jwt` force `accessToken = undefined` → 401 sur toutes les routes Graph).
- ✅ La 2FA self-service est confinée au compte courant (impossible d'agir sur un autre compte). Le canal app-only Exchange réimpose `isExchangeAdmin()` avant chaque mutation.
- ✅ `$select`/`$search` toujours construits à partir de constantes serveur (non injectables). Majorité des mutations validées par Zod (reset-password ≥12, licences `uuid`, création groupe/mailbox avec regex sur alias, local-admin, totp).
- ✅ Pas de `dangerouslySetInnerHTML`/`innerHTML`, pas d'open redirect, `signIn` en fail-closed, `clientSecret` jamais exposé par `/api/config/sso`.
- ✅ Conteneurs sans ports publiés (postgres/exo-bridge/app), app Next.js en non-root (uid 1001), secrets absents des images, dépendances à jour (next 16.1.6, next-auth 4.24.13, otplib 12).

---

## Plan de remédiation suggéré (par priorité)

1. **Rotation des secrets** exposés dans `.env` (E1) + passphrase `.pfx` forte (M9) + mot de passe Postgres fort sans fallback (M8).
2. **En-têtes de sécurité** dans le Caddyfile / `next.config.ts` (E2).
3. **2FA `setup`** : exiger le code courant + audit (M1) — *code récent, correctif ciblé*.
4. **Injection de formule CSV** (M6) et **validation Zod** des routes de mutation restantes (M4).
5. **Échappement/validation OData** (M3) + `encodeURIComponent` (B4).
6. **Durcissement** : retrait de « Directory Readers » (M2), chiffrement `totpSecret` (M7), `GET local-admin` restreint (B2), bcrypt factice anti-timing (B3), `exo-bridge` non-root (M5).
7. Cosmétique/défense en profondeur : contrôle de rôle serveur (B1), SameSite explicite (B5), audit non falsifiable (B6), bridge constant-time (B7), politique MDP admin local (B8), filtrage logs PII (B9).
