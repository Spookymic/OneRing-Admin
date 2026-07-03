# Changelog

All notable changes to OneRing Admin are documented in this file.

## [1.24.0] — 2026-07-02

### Nouvelle fonctionnalité v1.24.0

- **Délégations orphelines** : détection des permissions de boîtes partagées (accès complet, envoyer en tant que / de la part de) détenues par un **compte supprimé** encore référencé (SID non résolu dans Exchange).
  - **Panneau de délégations** : les SID orphelins s'affichent avec un badge « Compte supprimé » + le nom retrouvé via la corbeille Azure AD (`deletedItems`, best-effort < 30 j) + date de suppression, au lieu du SID brut.
  - **Rapport global** (`/dashboard/orphan-delegations`, accessible depuis l'en-tête Boîtes partagées) : scan de toutes les boîtes partagées en **un seul appel pont** (cmdlets EXO rapides, filtrage direct des SID) avec **nettoyage en un clic** par ligne.
  - Nouvel endpoint pont `/mailbox/orphan-delegations` ; timeout de requête Pode relevé à 15 min (`exo-bridge/server.psd1`) pour les gros volumes.
  - Aucune nouvelle permission (récupération des noms couverte par `Directory.ReadWrite.All`).

---

## [1.23.1] — 2026-07-02

### Améliorations v1.23.1

- **Stockage / SharePoint — noms de sites fiables** : résolution des vrais noms et URLs via `/sites/getAllSites` en **app-only** (client-credentials sur l'app registration existante). Le rapport Graph renvoyant une URL vide chez certains tenants et `/sites/getAllSites` n'étant pas accessible en délégué (403), c'est la seule voie fiable — elle donne exactement les noms du portail d'administration SharePoint (y compris sites renommés et sites autonomes).
  - Nouvelle permission requise : **Application** `Sites.Read.All` (+ consentement admin). Best-effort : sans elle, on retombe sur le nom dérivé (URL ou groupe de propriétaires).
  - Retrait du scope **délégué** `Sites.Read.All` (devenu inutile).
  - Badge de type de site clarifié : « Groupe M365 » (au lieu de « Teams / Groupe »), le rapport ne permettant pas de savoir si un Team existe réellement.
- Nouveau helper `src/lib/graph-app.ts` (jeton Graph app-only, mis en cache).

---

## [1.23.0] — 2026-07-02

### Nouvelles fonctionnalités v1.23.0

- **Page Stockage** : visualisation de l'espace occupé pour OneDrive, Exchange et SharePoint (rapports d'utilisation Microsoft 365, latence ~1-2 j). Nouvelle entrée de menu « Stockage ».
  - **OneDrive / Exchange** : barre utilisé / quota par entité + synthèse (total utilisé, quota total, nb ≥ 90 %).
  - **Exchange** : le quota réel (ProhibitSendReceiveQuota) est récupéré via le pont Exchange (`Get-EXOMailbox` en un seul appel), car le rapport Graph renvoie souvent un quota par défaut erroné (50 Go). Dégradation propre si le pont est indisponible.
  - **SharePoint** : part de chaque site dans l'espace total consommé (le quota 25 To/site par défaut n'est pas significatif). Badge de type de site (Teams / Groupe, Canal Teams, Communication, SharePoint seul) d'après `Root Web Template`. Nom de site dérivé de l'URL ou du groupe de propriétaires ; résolution best-effort du vrai nom des sites autonomes via `/sites/{siteId}`.
  - Permissions requises : `Reports.Read.All` (données) et, optionnellement, `Sites.Read.All` (résolution des noms de sites autonomes). Dégradation explicite si absentes.
- **Groupes à propriétaire désactivé** : détection group-centric des groupes dont un propriétaire est un compte désactivé. Nouvelle page dédiée `/dashboard/disabled-owners` (clic → réattribution de la propriété) + carte de synthèse sur le tableau de bord avec lien « Voir tout ».

### Notes techniques v1.23.0

- Scopes Graph ajoutés : `Reports.Read.All`, `Sites.Read.All` (nécessitent consentement admin + reconnexion).
- Nouveau helper `graphFetchCsv` (les rapports d'utilisation ne sont disponibles qu'en CSV), utilitaires `formatBytes` / `usagePercent`, endpoint pont `/mailbox-quotas`.

---

## [1.22.7] — 2026-07-02

### Sécurité v1.22.7 (findings d'audit Moyens M2, M5, M7)

- **M2 — Rôle « Directory Readers » retiré** des rôles Azure AD autorisés : un compte en lecture seule n'ouvre plus l'accès à tout le périmètre de lecture de l'outil.
- **M5 — `exo-bridge` en utilisateur non privilégié** : ajout d'un `USER` dédié (uid 10001) dans le Dockerfile — une RCE éventuelle n'obtient plus root alors que le conteneur monte le certificat app-only Exchange.
- **M7 — Secret TOTP chiffré au repos** : nouveau `src/lib/crypto.ts` (AES-256-GCM), le `totpSecret` est chiffré en base (clé `TOTP_ENCRYPTION_KEY`, sinon `NEXTAUTH_SECRET`). Rétro-compatible : un secret en clair existant reste lisible et sera ré-écrit chiffré à la prochaine configuration.

---

## [1.22.6] — 2026-07-02

### Sécurité v1.22.6 (findings d'audit Faibles — lot complet B1→B9)

- **B1 — Confinement admin local côté serveur** : nouveau `src/middleware.ts` qui redirige un compte `local` vers /dashboard/admin (non contournable, en plus de la redirection client existante).
- **B2 — `GET /api/admin/local-admin`** : un compte local ne voit plus que son propre compte (plus d'énumération de tous les comptes) ; liste complète réservée aux admins SSO.
- **B3 — Anti-énumération par timing** : comparaison bcrypt factice à coût constant quand l'identifiant local n'existe pas.
- **B4 — `encodeURIComponent`** appliqué à tous les segments d'identifiant interpolés dans les URL Graph (`users`, `groups`, `roles`, `licenses`).
- **B5 — Cookie de session** : `SameSite=Lax` + `HttpOnly` + `Secure` (prod) déclarés explicitement (protection CSRF documentée).
- **B6 — Écriture d'audit** : `POST /api/audit` valide le payload (objets bornés, garde-fou de taille) — plus d'injection de contenu volumineux.
- **B7 — Pont Exchange** : comparaison du secret à temps constant (SHA-256 + XOR) et route `/health` ne divulgue plus le domaine tenant.
- **B8 — Compte admin local** : mot de passe minimum porté à 12 caractères, coût bcrypt porté à 12.
- **B9 — Logs `graphFetch`** : ne loggue plus le corps d'erreur complet (PII possible), seulement le code d'erreur Graph.

---

## [1.22.5] — 2026-07-02

### Sécurité v1.22.5 (findings d'audit Moyens — lot « quick wins »)

- **M1 — 2FA `setup` durci** : re-provisionner une 2FA déjà active exige désormais un code TOTP courant valide (empêche une session volée de la neutraliser silencieusement) et l'action est journalisée.
- **M6 — Injection de formule CSV** : nouveau helper `src/lib/csv.ts` (`csvCell`) qui neutralise les préfixes `= + - @` (tab/CR) ; appliqué aux exports Historique et Connexions.
- **M3 — Injection OData** : nouveau helper `escapeODataString` (doublage des apostrophes) appliqué aux `$filter` de `listUserSignInLogs` et `getObjectCreator`.
- **M4 — Validation Zod** : schémas ajoutés sur les routes `users/[id]/roles` (roleId en UUID), `users/[id]/mailbox-settings`, `users/[id]/teams-presence` (≤ 280) et `users/[id]` PATCH.
- **M8 — PostgreSQL** : suppression du fallback `changeme` dans `docker-compose.yml` (échec explicite si `POSTGRES_PASSWORD` non défini).

---

## [1.22.4] — 2026-07-02

### Sécurité v1.22.4 (findings d'audit Élevés)

- **En-têtes de sécurité (E2)** : `next.config.ts` ajoute sur toutes les réponses `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (anti-clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy` et `Permissions-Policy`. HSTS ajouté en commentaire dans le `Caddyfile` (à n'activer qu'avec un certificat publiquement reconnu — inopérant/bloquant avec `tls internal`).
- **Rotation des secrets (E1)** : nouveau `docs/Rotation-secrets.md` (procédure par secret + impacts), `.env.example` durci (plus de `changeme`). La rotation des secrets réels reste une opération manuelle côté exploitant.

---

## [1.22.3] — 2026-07-02

### Correctif critique v1.22.3

- **Connexion SSO cassée (boucle `invalid_client` / AADSTS650053)** : le scope `Presence.ReadWrite.All` ajouté en 1.22.2 **n'existe pas** sur Microsoft Graph → Azure rejetait toute la demande de jeton, rendant la connexion impossible. Scope retiré. Microsoft Graph ne propose aucune permission déléguée pour définir la présence/statut Teams d'un *autre* utilisateur (`Presence.ReadWrite` ne couvre que le compte connecté) : la fonctionnalité « statut Teams » pour un tiers reste donc inopérante, et le message d'erreur ainsi que le README ont été corrigés en conséquence.
- Scopes conservés (valides) : `AuditLog.Read.All`, `Application.Read.All`.

---

## [1.22.2] — 2026-07-02

### Fonctionnalités réactivées v1.22.2

- **Scopes Graph complétés** : ajout de `AuditLog.Read.All`, `Presence.ReadWrite.All` et `Application.Read.All` aux permissions demandées à la connexion. Sans elles (non demandées auparavant), les écrans Connexions, « créé par », statut Teams et expiration des secrets/certificats restaient inertes. **Nécessite le consentement admin Azure + une reconnexion.**

### Dégradation explicite v1.22.2

- **« Créé par »** ne se dégrade plus silencieusement : distinction entre permission `AuditLog.Read.All` manquante (indice explicite dans la fiche) et objet trop ancien (journaux d'audit ~30 j, vide normal).
- **Connexions** : l'encart « permission manquante » ne s'affiche que sur un vrai 403 ; les autres erreurs affichent un message d'erreur réel.
- **Expiration secrets/certificats** : message nommant explicitement la permission `Application.Read.All`.

### Documentation v1.22.2

- **Rapport d'audit de sécurité** : nouveau `docs/Audit-Securite.md` (audit en lecture seule, 2 Élevées / 9 Moyennes / 9 Faibles, plan de remédiation priorisé).
- **README** : section Permissions API complétée et corrigée (requises vs optionnelles + note sur le lien consentement/scope), variables d'environnement `EXO_*` ajoutées, tableau des services Docker mis à jour (caddy, exo-bridge).

---

## [1.22.1] — 2026-07-02

### Corrections v1.22.1

- **Panneaux latéraux réellement élargis** : la classe de base du composant `Sheet` (`data-[side=right]:sm:max-w-sm`, sélecteur d'attribut plus spécifique) écrasait la largeur personnalisée — les panneaux restaient à 384 px. Correction avec le même préfixe `data-[side=right]:sm:max-w-2xl` (672 px) sur les 4 panneaux (fiche utilisateur, licences, groupes, boîtes partagées).
- **Badge MFA fonctionnel** : ajout du scope `UserAuthenticationMethod.Read.All` aux permissions demandées à la connexion SSO. Le consentement Azure seul ne suffisait pas — le jeton délégué ne portait pas la permission tant qu'elle n'était pas demandée. **Nécessite une reconnexion** pour rafraîchir le jeton.

---

## [1.22.0] — 2026-07-02

### Nouvelles fonctionnalités v1.22.0

- **2FA (TOTP) pour les comptes admin locaux** : activation self-service depuis Administration (QR code + clé manuelle, compatible Microsoft/Google Authenticator, Authy). Le code à usage unique est exigé à la connexion locale quand la 2FA est active, la désactivation requiert un code valide. Statut « 2FA » visible sur les comptes côté SSO. Vérification côté serveur via `otplib` (fenêtre ±1), échecs comptés dans l'anti-brute-force.
- **Statut MFA par utilisateur** : badge **MFA actif / MFA absent** dans la fiche utilisateur, avec le détail des méthodes en infobulle (Authenticator, téléphone, FIDO2, OATH, Windows Hello…). Best-effort : dégrade proprement si le scope `UserAuthenticationMethod.Read.All` n'est pas consenti (aucun blocage de connexion).

### Améliorations v1.22.0

- **Mode sombre — polish** : variantes `dark:` sur toutes les boîtes d'alerte (`bg-*-50`, bordures, textes rouge/ambre/vert) et les gris Tailwind. Le rendu clair reste inchangé.
- **Chenillard généralisé** : le loader animé remplace les skeletons sur les listes Utilisateurs, Groupes et Licences.
- **Panneaux latéraux élargis** : fiches utilisateur/licences (`max-w-2xl`) et groupes/boîtes partagées (640 px) pour plus de confort de lecture.
- **Export PDF du tableau de bord** : l'impression prend désormais en compte toute la page (correction des conteneurs `h-screen`/`overflow-hidden` qui tronquaient à une page) et conserve les couleurs des cartes/badges.

### Notes techniques v1.22.0

- Schéma `LocalAdmin` : nouveaux champs `totpSecret` / `totpEnabled` (appliqués au démarrage via `prisma db push`).
- Dépendances ajoutées : `otplib`, `qrcode` (+ `@types/qrcode`).

---

## [1.21.2] — 2026-06-21

### Améliorations v1.21.2

- **Onglet Connexions (fiche utilisateur)** : chenillard pendant le chargement (au lieu du skeleton) + note explicative sur la source (journal détaillé `/auditLogs/signIns` ~30 j interactif, distinct du résumé `signInActivity` utilisé par les listes) et message « vide » plus clair.

---

## [1.21.1] — 2026-06-21

### Améliorations v1.21.1

- **Invités inactifs** : page dédiée `/dashboard/inactive-guests` (avec lien « Voir tout » depuis le tableau de bord) et affichage de l'ancienneté du compte (« créé il y a X »).
- **Chenillard** : le loader animé s'affiche désormais dans les zones de chargement lentes (boîtes partagées, secrets & certificats, utilisateurs et invités inactifs), pas seulement l'arborescence.

---

## [1.21.0] — 2026-06-21

### Nouvelles fonctionnalités v1.21.0

- **Mode sombre** : bascule Clair / Sombre / Système (next-themes) dans la sidebar. Migration des couleurs de contenu codées en dur vers les tokens CSS (`bg-muted`, `bg-card`, `text-foreground`…). Les zones volontairement sombres (sidebar, en-têtes, page de connexion) sont préservées.

### Notes v1.21.0

- Premier pass : certaines boîtes d'alerte (`bg-*-50`) et gris Tailwind restent clairs en mode sombre — polish à venir.

---

## [1.20.0] — 2026-06-21

### Nouvelles fonctionnalités v1.20.0

- **Rate-limiting de la connexion locale** : 5 échecs consécutifs → verrouillage du compte 15 min (`failedAttempts` / `lockedUntil`), réinitialisé à la connexion réussie. Anti-brute-force.
- **Invités inactifs** : section tableau de bord des comptes invités sans connexion depuis > 90 j. Endpoint `/api/anomalies/inactive-guests` (best-effort Entra Premium).
- **Licences en conflit** : détection des licences assignées à la fois en direct et via un groupe. Endpoint `/api/anomalies/license-conflicts`.
- **Export PDF** : bouton d'impression du tableau de bord (masque la navigation via CSS `@media print`).

### Corrections v1.20.0

- **Arborescence** : le chenillard de chargement reste affiché pendant tout le chargement des données (plus de zone figée).

---

## [1.19.0] — 2026-06-20

### Nouvelles fonctionnalités v1.19.0

- **Comptes administrateurs locaux multiples** : création de plusieurs comptes (ou réinitialisation du mot de passe d'un identifiant existant), liste avec date de création, suppression unitaire et « supprimer tous ». Endpoints `POST` (upsert) / `DELETE` (`?id=` ou `?all=true`), audit `LOCAL_ADMIN_DELETE`.
- **Thème — couleur d'accent** : sélecteur de couleur d'accent dans la sidebar (Rose, Bleu, Violet, Vert, Ambre, Ardoise), persistant, appliqué globalement. La couleur d'accent codée en dur (`#D8346E`) a été migrée vers le token CSS `primary` dans toute l'interface, la rendant thématisable.

### Notes v1.19.0

- **Fondation mode sombre** : le système de tokens CSS et le bloc `.dark` existent déjà dans `globals.css`. La bascule clair/sombre viendra dans un pass dédié (migration contextuelle des fonds/textes encore codés en dur : `#01031B`, `#F5F5FA`, `bg-white`).

---

## [1.18.0] — 2026-06-20

### Nouvelles fonctionnalités v1.18.0

- **Compte administrateur local** : accès de secours (provider credentials NextAuth, table Prisma `LocalAdmin`, hash bcrypt) **sans aucun accès Graph**, confiné à l'onglet Administration (sidebar réduite + redirection). Création/remplacement par un admin SSO depuis Administration. Connexion via « accès de secours » sur la page de login. Audit `LOCAL_ADMIN_SET`.
- **Utilisateurs inactifs & licences gaspillées** : section « Optimisation des licences » (dashboard) + page dédiée `/dashboard/inactive-users` (comptes licenciés sans connexion > 90 j, ancienneté du compte). Estimation des licences récupérables (désactivés + inactifs). Basé sur `signInActivity` (best-effort, Entra Premium).
- **Secrets & certificats** : page `/dashboard/credentials` (tous les identifiants d'app registrations) + alerte dashboard + carte Administration pour ce qui expire ≤ 30 j. Endpoint `/api/security/expiring-credentials`.
- **Santé du pont Exchange** : carte d'état (joignable / connexion EXO) dans Administration. Endpoint `/api/exchange/health`.
- **Alerte groupes vides** (M365 / Sécurité sans membre) sur le dashboard.
- **Actions groupées** (liste utilisateurs) : sélection multiple → retrait des licences / offboarding en masse (option boîte partagée), barre de progression.
- **Export CSV des anomalies** (dashboard).
- **Config SSO Azure AD** (lecture) dans Administration. Endpoint `/api/config/sso`.
- **Chenillard de chargement** (loader animé) + écran de navigation.
- **Base de tests** : vitest + MSW (logique pure, couche Graph pagination/throttling/`$batch`, route API). `npm test`.

### Corrections / robustesse v1.18.0

- **Rétro** : pagination `@odata.nextLink` et retry throttling (429/503) déjà en place ; ajout de l'ancienneté du compte dans l'optimisation des licences.

---

## [1.17.0] — 2026-06-19

### Nouvelles fonctionnalités v1.17.0

- **Arborescence — membres utilisateurs** : nouvelle case « Afficher les membres utilisateurs » (décochée par défaut). Une fois cochée, l'expansion d'un groupe affiche aussi ses utilisateurs membres, avec un badge **Propriétaire** pour les owners. Chargement paresseux (membres + propriétaires) à l'expansion, actif en sens « Contient ».

---

## [1.16.1] — 2026-06-19

### Nouvelles fonctionnalités v1.16.1

- **Infos objet** : les panneaux utilisateur et groupe affichent la date de création (`createdDateTime`), un badge **Synchronisé AD** / **Cloud** (`onPremisesSyncEnabled`), et le **créateur** en best-effort via les journaux d'audit Entra (objets récents). Endpoint `/api/directory/creator`, composant `ObjectInfo`.

---

## [1.16.0] — 2026-06-19

### Nouvelles fonctionnalités v1.16.0

- **Workflow d'offboarding** : bouton « Offboarder » dans la fiche utilisateur → désactive le compte, retire toutes les licences et toutes les appartenances aux groupes (Graph + pont pour les DL), avec une case optionnelle **« Convertir en boîte partagée »**. Rapport tolérant aux erreurs. Endpoint `/api/users/[id]/offboard`, audit `USER_OFFBOARD`.
- **Rollback UI** : bouton « Annuler » sur les lignes d'audit réversibles (licences, membres/propriétaires, DL, délégations, activation/désactivation). Exécute l'action inverse et la journalise. `/api/audit/[id]/rollback`.
- **Alerte groupes vides** : section tableau de bord listant les groupes M365/Sécurité sans aucun membre. `/api/anomalies/empty-groups` (via `$batch`).
- **Imbrication DL-dans-DL** dans l'arborescence : les nœuds DL chargent leurs sous-groupes via le pont Exchange à l'expansion.

### Corrections / robustesse v1.16.0

- **Pagination** : `listUsers` / `listGroups` suivent `@odata.nextLink` (helper `graphFetchAll`) — fin de la troncature silencieuse au-delà de 999 objets.
- **Throttling** : `graphFetch` et `graphBatch` réessaient en respectant l'en-tête `Retry-After` (429 / 503).

---

## [1.15.1] — 2026-06-19

### Corrections v1.15.1

- **Groupes sans propriétaire — type affiché** : chaque pastille indique désormais le type du groupe (M365 / Sécurité…). Les groupes M365 sans propriétaire étaient bien détectés mais indistinguables des groupes de sécurité faute d'étiquette.

---

## [1.15.0] — 2026-06-19

### Nouvelles fonctionnalités v1.15.0

- **Alerte « comptes désactivés propriétaires d'un groupe »** : le tableau de bord signale les comptes désactivés encore propriétaires d'un groupe (un propriétaire désactivé ne peut plus le gérer). Les groupes possédés sont affichés en pastilles cliquables dans « Gérer » → ouvre le panneau Propriétaires du groupe. Endpoint `/api/anomalies/orphans` enrichi (`ownedObjects`).
- **Alerte « groupes sans propriétaire »** : section dédiée listant les groupes M365 / Sécurité sans propriétaire (clic → ajout d'un propriétaire). Endpoint `/api/anomalies/ownerless` (DL exclues : `managedBy` non exposé par Graph).
- **Arborescence v2** : graphe d'imbrication précalculé en une passe via Graph `$batch` (`/api/groups/structure`). Expansion instantanée, chevron affiché uniquement si le nœud a des enfants, compteur de groupes liés, badge ⚠️ sans propriétaire sur les nœuds, et case « Groupes racines uniquement » immédiate.

### Notes v1.15.0

- L'arborescence s'appuie sur `memberOf` Graph (imbrication Sécurité/M365/Teams). L'imbrication DL-dans-DL (Exchange) n'y figure pas.

---

## [1.14.0] — 2026-06-19

### Nouvelles fonctionnalités v1.14.0

- **Écran Arborescence des groupes** : nouvel onglet visualisant l'imbrication des groupes (groupe membre d'un groupe). Bascule « Contient » / « Membre de » (vue inversée pour l'analyse d'impact), expansion paresseuse au clic, badges de type + Teams, garde anti-cycle. Imbrication Sécurité/M365 via Graph, Distribution via le pont Exchange (`GET /dl/members`).
- **Alertes groupes orphelins** : le tableau de bord signale les comptes **désactivés** et les **boîtes partagées/salles** encore membres de groupes. Les groupes par défaut (« Tous les utilisateurs », « All Users »…) sont exclus du décompte. Endpoint `/api/anomalies/orphans` (récupération `memberOf` par lots).

---

## [1.13.1] — 2026-06-18

### Corrections v1.13.1

- **Pont Exchange — `-Threads 1`** : le sidecar Pode tourne désormais sur un seul runspace. Corrige l'erreur « The term 'Remove-DistributionGroupMember' is not recognized » au premier clic (EXO v3 importe les cmdlets proxy uniquement dans le runspace qui s'est connecté ; un pool de runspaces provoquait l'échec au 1er appel, succès au 2nd).
- **Caddyfile** : fallback `{$APP_DOMAIN:localhost}` — évite le crash en boucle de Caddy (« unrecognized global option: tls ») quand `APP_DOMAIN` n'est pas défini.
- **Diagnostic Graph** : `graphFetch` logue désormais l'erreur Graph complète (`innerError`, request-id) et, sur 403, les scopes effectifs du jeton (`scp`).
- **Licences — message 403** : message explicite quand l'opération est refusée par Entra sur un **compte protégé** (détenteur d'un rôle admin → seul un Administrateur général peut modifier ses licences). Ce n'est pas un défaut de droits du compte connecté.

---

## [1.13.0] — 2026-06-18

### Nouvelles fonctionnalités v1.13.0

- **Accès par nom de domaine en HTTPS** : ajout d'un reverse proxy **Caddy** (service `caddy`) comme point d'entrée unique sur `APP_DOMAIN`, avec TLS via la CA interne de Caddy (`tls internal`). Le conteneur `app` n'expose plus de port hôte (accès uniquement via Caddy). Requis car Azure AD n'autorise l'HTTP que pour `localhost`.
- **Configuration** : nouvelles variables `APP_DOMAIN` + `NEXTAUTH_URL` en `https://`, `Caddyfile` à la racine. Guide complet : [docs/Deploiement-domaine.md](docs/Deploiement-domaine.md) (DNS, URI de redirection Azure AD, installation de la CA interne sur les postes).

---

## [1.12.0] — 2026-06-18

### Nouvelles fonctionnalités v1.12.0

- **Boîtes aux lettres partagées** : nouvelle page « Boîtes partagées » (lien dans la sidebar) listant les boîtes partagées du tenant, avec création (`New-Mailbox -Shared`) via le pont Exchange.
- **Délégations** : panneau latéral par boîte pour gérer les trois types de délégation — **Accès complet** (`Add/Remove-MailboxPermission`), **Envoyer en tant que** (`Add/Remove-RecipientPermission`), **Envoyer de la part de** (`Set-Mailbox -GrantSendOnBehalfTo`). Ajout via sélecteur d'utilisateur, retrait par ligne, bouton de rafraîchissement.
- **Audit** : nouvelles actions `SHARED_MAILBOX_CREATE`, `MAILBOX_PERMISSION_ADD`, `MAILBOX_PERMISSION_REMOVE`.

Étape 4 (dernière) de l'ADR du pont Exchange — le périmètre Exchange du CADRAGE (listes de distribution + boîtes partagées) est désormais couvert.

---

## [1.11.0] — 2026-06-17

### Nouvelles fonctionnalités v1.11.0

- **Propriétaires de listes de distribution** : lecture et gestion (ajout/retrait) des propriétaires de DL via le pont Exchange (champ `ManagedBy`, `Set-DistributionGroup`). La notice « gérés dans Exchange Admin Center, non exposés par Graph » est remplacée par la liste réelle des propriétaires, modifiable depuis le panneau du groupe et le panneau utilisateur.
- **Création de vraies listes de distribution** : le type « Distribution » du dialog de création passe désormais par `New-DistributionGroup` (pont Exchange) au lieu de créer un groupe mail-enabled approximatif via Graph. Les types Sécurité et Microsoft 365 restent sur Graph.
- **Audit** : nouvelles actions `DL_OWNER_ADD`, `DL_OWNER_REMOVE`, `DL_CREATE`.

Étape 3 de l'ADR du pont Exchange ([docs/ADR-001-pont-exchange.md](docs/ADR-001-pont-exchange.md)). Reste l'étape 4 (boîtes partagées : création + délégation).

---

## [1.10.0] — 2026-06-16

### Nouvelles fonctionnalités v1.10.0

- **Pont Exchange Online** : nouveau service sidecar `exo-bridge` (PowerShell 7 + Pode, module `ExchangeOnlineManagement` v3, authentification application par certificat). Il expose une API REST interne consommée uniquement par l'app Next.js (réseau Docker interne, non publié) pour les opérations Exchange non couvertes par Microsoft Graph. Conception : [docs/ADR-001-pont-exchange.md](docs/ADR-001-pont-exchange.md).
- **Gestion des membres de listes de distribution** : l'ajout et le retrait de membres sur les listes de distribution et les groupes de sécurité à extension de messagerie passent désormais par le pont (`Add`/`Remove-DistributionGroupMember`). La bannière « à faire dans Exchange Admin Center » disparaît pour ces groupes. Disponible depuis le panneau du groupe et depuis le panneau utilisateur.
- **Garde de sécurité du canal app-only** : le pont agit avec un rôle Exchange Administrator applicatif. Avant chaque appel, `isExchangeAdmin()` re-vérifie que le compte connecté possède bien un rôle Exchange (ou Global Admin) — sinon `403`. Voir ADR-001 §4.
- **Audit** : nouvelles actions `DL_MEMBER_ADD` / `DL_MEMBER_REMOVE`.
- **Bouton de rafraîchissement** : icône dans le panneau du groupe pour recharger propriétaires et membres sans fermer/rouvrir le panneau (utile après le délai de propagation Exchange → Graph).

### Corrections v1.10.0

- **`getGroupBasic`** : les routes de mutation récupèrent le groupe avec un `$select` minimal. Les propriétés Exchange (`allowExternalSenders`, `requireSenderAuthenticationEnabled`) déclenchaient une erreur `[404] mailbox hosted on-premise` sur les listes de distribution, qui était mappée à tort en `exchange_managed`.
- **Fenêtre « Ajouter au groupe »** : correction du dimensionnement. Les éléments `grid` à largeur minimale `auto` laissaient les longues adresses e-mail déborder horizontalement (ascenseur hors cadre, pied de page désaligné). Ajout de `min-w-0` + `truncate` et largeur portée à `sm:max-w-md`.

---

## [1.9.0] — 2026-03-13

### Corrections v1.9.0

- **Groupes Exchange — bannière explicite** : tentative d'ajout/retrait sur un groupe géré par Exchange Online → bannière ambrée "Ce groupe est géré par Exchange Admin Center" au lieu d'un toast d'erreur générique. La bannière disparaît lors du changement de groupe. Gestion identique sur les routes `/members` et `/owners`.
- **Limitation documentée** : les listes de distribution Exchange ne peuvent pas être modifiées via Microsoft Graph API v1.0. La modification des membres nécessite Exchange Admin Center ou Exchange Online PowerShell (hors périmètre MVP).

---

## [1.8.0] — 2026-03-13

### Corrections v1.8.0

- **Absence — erreur trompeuse** : corrigé la chaîne d'erreur complète pour l'onglet Absence. `graphFetch` inclut désormais le code HTTP dans le message (`[403] ...`), la route détecte correctement les erreurs 403/401, et le frontend affiche le vrai message d'erreur Graph (en rouge, en monospace) au lieu d'afficher systématiquement le message "permission manquante" qui masquait le problème réel.

---

## [1.7.0] — 2026-03-13

### Nouvelles fonctionnalités v1.7.0

- **Panneau groupes glissant** : le bouton "Membres" et la navigation vers `/dashboard/groups/[id]` sont remplacés par un panneau latéral (Sheet) s'ouvrant au clic sur la ligne. Owners en haut, membres en dessous.
- **Propriétaires et membres dans les deux listes** : un utilisateur owner ET membre apparaît désormais dans chacune des deux sections.
- **Tri alphabétique** : owners et membres triés par `displayName` dans le panneau.
- **Notice listes de distribution** : pour les DL, un message explicite indique que les propriétaires ("Géré par") sont gérés dans Exchange Admin Center et ne sont pas exposés par Microsoft Graph (limitation API documentée — seuls les groupes M365, sécurité et sécurité mail-enabled supportent `/owners`).

### Corrections v1.7.0

- Propriétaires des groupes de sécurité désormais visibles : le select `userPrincipalName,jobTitle` causait un 400 silencieux sur les objets non-utilisateurs. Corrigé avec `id,displayName,mail`.

---

## [1.6.0] — 2026-03-12

### Nouvelles fonctionnalités v1.6.0

- **Noms de licences officiels** : dictionnaire remplacé par 609 entrées issues du fichier CSV de référence Microsoft (`Product names and service plan identifiers for licensing`). Couvre tous les plans M365, E3/E5, Dynamics 365, Power Platform, etc.
- **Propriétaires de groupes — tous types** : `listGroupOwners` utilise désormais `/owners` sans cast `/microsoft.graph.user`. Les propriétaires non-utilisateurs (contacts, service principals) sont inclus, ce qui corrige les groupes dont les owners n'apparaissaient pas.
- **Audit des paramètres d'administration** : chaque modification dans l'onglet Administration (toggle, rétention, mots-clés) est journalisée dans l'historique avec l'action `ADMIN_SETTINGS_UPDATE`, la valeur avant et après.
- **Accessibilité — contraste élevé** : remplacement du filtre CSS `invert/hue-rotate` (illisible) par des overrides de variables CSS. Fond blanc pur, texte noir pur, bordures noires. Règles `!important` ciblées sur `<main>` pour corriger les classes Tailwind en opacité réduite (`text-[#01031B]/40`, grays).
- **Mire de connexion** : numéro de version affiché à jour (`v1.6.0`).

### Corrections v1.6.0

- Badge « Paramètres admin » ajouté dans l'onglet Historique pour l'action `ADMIN_SETTINGS_UPDATE`.

---

## [1.5.0] — 2026-03-12

### Nouvelles fonctionnalités v1.5.0

- **Export CSV de l'historique** : bouton « Exporter CSV » dans l'onglet Historique. Colonnes : Date, Administrateur, Action, Détail.
- **Rétention paramétrable** : réglage dans Administration → Historique (30 / 60 / 90 / 180 / 365 jours ou illimité). Filtre côté API, ne supprime pas les données. Valeur par défaut : 90 jours.
- **Noms de produits EMS** : ajout de `EMS` → "Enterprise Mobility + Security E3", `EMSPREMIUM` → E5, `EMS_EDU` dans le dictionnaire des licences.
- **Accessibilité — contraste élevé** : remplacé par `filter: invert(1) hue-rotate(180deg) contrast(1.1)` — mode sombre haute lisibilité, fonctionne sur toutes les couleurs y compris hardcodées.
- **Message d'absence — erreur détaillée** : la bannière d'erreur MailboxSettings indique désormais les étapes à suivre (Azure AD → API permissions → MailboxSettings.ReadWrite + consentement admin + reconnexion).

### Corrections v1.5.0

- Suppression des colonnes membres/owners dans la liste des groupes (trop de requêtes).

---

## [1.4.0] — 2026-03-12

### Nouvelles fonctionnalités v1.4.0

- **Compteurs membres/owners dans la liste des groupes** : deux nouvelles colonnes affichent le nombre de membres et d'owners de chaque groupe. Les compteurs sont chargés en parallèle via l'API `$batch` de Microsoft Graph (10 groupes par lot, max 20 requêtes par appel).
- **Connexions — 50 dernières** : l'historique passe de 20 à 50 entrées.
- **Connexions — export CSV** : bouton « Exporter CSV » dans l'onglet Connexions de la fiche utilisateur. Colonnes : Date, Application, Résultat, IP, Lieu, Client.
- **Noms de produits** : les cartes SKU du tableau de bord et de l'onglet Licences n'affichent plus l'identifiant technique `skuPartNumber` en sous-titre.
- **Accessibilité — contraste élevé** : remplace le filtre CSS agressif (`contrast(2.5)`) par des variables CSS ciblées + `contrast(1.4)` pour un résultat lisible.
- **Version** : numéro de version dans la sidebar et l'administration mis à jour (`v1.4.0`).

### Technique v1.4.0

- Nouveau service `listGroupCounts(token, groupIds[])` dans `services/graph/groups.ts` — utilise `/$batch`.
- Nouvelle route API `POST /api/groups/counts` — corps `{ ids: string[] }`, retourne `Record<string, { memberCount, ownerCount }>`.

---

## [1.3.0] — 2026-03-12

### Correctif sécurité

- **Blocage SSO sans rôle admin** : le callback `signIn` est réintégré sans modification des scopes OAuth (la coupure en v1.2.0 était causée par l'ajout de scopes non consentis). Seuls les comptes avec un rôle Azure AD valide peuvent se connecter. Redirection vers `/auth/error?error=AccessDenied` sinon.

### Fonctionnalités ajoutées

- **Actifs** (Santé des comptes) : affiche la répartition par type primaire (utilisateurs, boîtes partagées, salles, comptes service…) sous le compteur.
- **Invités** (Santé des comptes) : affiche le nombre d'invités avec et sans licence (indicateur de risque).
- **Exporter JSON** (Administration) : télécharge tous les paramètres locaux sous forme de fichier JSON horodaté.
- **Importer JSON** (Administration) : charge un fichier exporté précédemment et applique les paramètres immédiatement. Note : la configuration SSO (variables d'environnement Azure AD) n'est pas incluse.

### Hors périmètre

- **Création/suppression d'utilisateur en console** : opérations déléguées au portail Entra officiel.
- **Renvoi de mail** : `forwardingSmtpAddress` n'est disponible que sur l'endpoint beta de Microsoft Graph, pas sur v1.0.

---

## [1.2.0] — 2026-03-12

### Sécurité

- **Contrôle d'accès au login** : le callback `signIn` vérifie les rôles Azure AD avant d'autoriser l'accès. Si aucun rôle admin valide n'est présent, redirection vers `/auth/error?error=AccessDenied`. Rôles acceptés : Global Admin, User Admin, Helpdesk Admin, License Admin, Groups Admin, Directory Readers, Exchange Admin, Security Admin, Auth Admin, App Admin, Teams Admin.
- Page d'erreur d'authentification redessinée avec icônes et messages lisibles.

### Nouvelles fonctionnalités

#### Fiche utilisateur — nouvelles actions

- **Désactiver / réactiver un compte** : bouton avec confirmation inline (masquable via l'Administration). Journalisé en `ACCOUNT_DISABLE` / `ACCOUNT_ENABLE`.
- **Attribution de rôles AD** : onglet « Rôles AD » (masquable). Attribuer / retirer des rôles Azure AD avec confirmation inline. Journalisé en `ROLE_ASSIGN` / `ROLE_REMOVE`.
- **Message d'absence mail (OOO)** : onglet « Absence ». Configure `automaticRepliesSetting` via `mailboxSettings`. Journalisé en `OOO_UPDATE`.
- **Statut Teams** : section dans l'onglet Absence. Gestion gracieuse des 403 si `Presence.ReadWrite.All` n'est pas consenti. Journalisé en `TEAMS_STATUS_UPDATE`.

#### Tri des colonnes

- Toutes les vues tabulaires (Utilisateurs, Groupes, Détail groupe, Audit) supportent le tri ascendant/descendant au clic sur les en-têtes de colonnes.

#### Tableau de bord — précisions

- Les comptes désactivés affichent leur répartition par type primaire (boîtes partagées, salles, équipements…).
- Chaque type de compte affiche un tooltip expliquant la règle de classification.

### Améliorations

- Nouveaux labels dans l'historique : `ACCOUNT_DISABLE`, `ACCOUNT_ENABLE`, `ROLE_ASSIGN`, `ROLE_REMOVE`, `OOO_UPDATE`, `TEAMS_STATUS_UPDATE`.
- Onglet « Rôles AD » et bouton désactiver masquables depuis l'Administration.
- Composant `PermissionWarning` pour avertir en cas de 403 Graph (permissions manquantes).
- Permissions OAuth étendues : `MailboxSettings.ReadWrite`, `Presence.ReadWrite.All`.

### Architecture

- Nouveau service `src/services/graph/roles.ts`.
- Nouvelles routes API : `users/[id]` PATCH, `users/[id]/mailbox-settings`, `users/[id]/teams-presence`, `users/[id]/roles`, `roles`.
- Hook `src/lib/use-sort.ts` + composant `src/components/ui/sortable-head.tsx` pour le tri générique.

---

## [1.1.0] — 2026-03-12

### Nouveautés

#### Interface responsive (mobile/tablette)
- Sidebar masquée sur mobile avec un bouton hamburger dans la barre de navigation supérieure
- Overlay sombre sur mobile lorsque la sidebar est ouverte
- Padding adaptatif du contenu principal selon la taille d'écran (`p-4` → `p-8`)
- Composant `DashboardShell` pour encapsuler la logique de mise en page responsive

#### Accessibilité visuelle
- Bouton **Accessibilité** dans la sidebar avec 6 modes visuels :
  - Normal (défaut)
  - Monochrome (niveaux de gris)
  - Contraste élevé
  - Protanopie (daltonisme rouge)
  - Deutéranopie (daltonisme vert)
  - Tritanopie (daltonisme bleu-jaune)
- Filtres SVG `feColorMatrix` pour la simulation de daltonisme
- Mode persisté dans `localStorage`
- Indication visuelle « actif » dans la sidebar quand un mode est activé

#### Tableau de bord — statistiques cliquables
- Chaque ligne de **Types de comptes** navigue vers `/dashboard/users?type=xxx`
- Chaque ligne de **Types de groupes** navigue vers `/dashboard/groups?type=xxx`
- Les blocs **Actifs** / **Désactivés** / **Invités** de Santé des comptes naviguent vers la liste filtrée correspondante

#### Tableau de bord — anomalies
- Cliquer sur un compte dans le dialogue « Gérer » ouvre directement son panneau de gestion des licences
- Le dialogue se ferme automatiquement lors de ce clic

#### Onglet Utilisateurs
- Sélection des colonnes **persistée** dans `localStorage` (survit aux changements d'onglet)
- Filtres **type** et **statut** initialisables depuis l'URL (`?type=xxx&status=xxx`)
- **Scrollbar horizontale** sur le tableau pour afficher toutes les colonnes
- Bouton « Supprimer le compte » dans la fiche utilisateur (masqué par défaut, ouverture du portail Entra)

#### Onglet Groupes
- Filtre **type** initialisable depuis l'URL (`?type=xxx`)

#### Onglet Licences — refonte complète
- **Cartes SKU** en grille (au lieu d'un tableau par utilisateur)
- Panneau latéral **Bénéficiaires** avec liste des utilisateurs ayant la licence et bouton « Retirer »
- Section **Assigner** pour attribuer la licence à un utilisateur
- Navigation depuis le tableau de bord (clic sur une carte SKU) toujours fonctionnelle

#### Fiche utilisateur
- Prop `initialTab` sur `UserGroupsSheet` pour ouvrir directement l'onglet **Licences** ou **Groupes**
- Bouton « Supprimer le compte » (conditionnel sur le paramètre admin `showDeleteUser`)

#### Administration
- Nouveau paramètre **Afficher la suppression de compte** (`showDeleteUser`, masqué par défaut)
- Version affichée : v1.1.0

### Corrections

- Suppression de `sticky top-0` sur la sidebar (désormais gérée par `DashboardShell`)
- `InactivityWatcher` intégré dans `DashboardShell` (simplification du layout)

---

## [1.0.0] — 2026-02-28

### Fonctionnalités initiales

- Authentification SSO Microsoft via NextAuth v4 + Azure AD (JWT pur, sans PrismaAdapter)
- **Tableau de bord** : KPIs, anomalies, répartition types de comptes/groupes, SKUs cliquables, audit récent, export CSV
- **Utilisateurs** : liste filtrée avec détection des types de comptes, fiche avec gestion des groupes et licences, réinitialisation de mot de passe
- **Groupes** : liste, détail membres/owners, création, ajout/retrait de membres et owners
- **Licences** : vue par utilisateur, assignation et retrait de licences
- **Historique** : audit log des modifications (groupe, licence, MDP)
- **Administration** : paramètres locaux (localStorage) pour masquer les actions sensibles, mots-clés personnalisés pour la détection des types de comptes
- Journalisation audit via `logAudit()` / table `audit_logs` (Prisma + PostgreSQL)
- Design Conserto : Dark Blue `#01031B`, Pink `#D8346E`, shadcn/ui v4
