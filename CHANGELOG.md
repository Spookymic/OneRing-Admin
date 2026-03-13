# Changelog

All notable changes to OneRing Admin are documented in this file.

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
