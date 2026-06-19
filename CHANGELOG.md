# Changelog

All notable changes to OneRing Admin are documented in this file.

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
