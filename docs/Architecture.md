# Architecture — M365 Administrator

## Stack technique

| Couche           | Technologie                       | Justification                                    |
| ---------------- | --------------------------------- | ------------------------------------------------ |
| Framework        | Next.js 16 (App Router)           | SSR, routing intégré, params async               |
| Langage          | TypeScript strict                 | Sécurité des types, meilleure DX                 |
| Authentification | NextAuth v4 + Azure AD provider   | SSO Microsoft natif, gestion tokens Graph        |
| Session          | JWT pur (sans PrismaAdapter)      | Évite la boucle auth liée au double storage      |
| API              | Microsoft Graph API v1.0          | Source unique de vérité pour M365                |
| UI               | shadcn/ui v4 + @base-ui/react     | Composants accessibles, design system cohérent   |
| Styles           | Tailwind CSS v4                   | Utilitaires CSS, responsive, design rapide       |
| Accessibilité    | CSS filters + SVG feColorMatrix   | Monochrome, contraste, protanopie/deutéranopie   |
| Base de données  | PostgreSQL 16 (container Docker)  | Self-hosted, aucune dépendance cloud externe     |
| ORM              | Prisma v7 + PrismaPg adapter      | Type-safe, connexion via prisma.config.ts        |
| État client      | TanStack Query v5                 | Cache, refetch, partage de données entre pages   |
| Toasts           | Sonner                            | Toast composant supprimé de shadcn v4            |
| Conteneurisation | Docker + Docker Compose           | Déploiement reproductible, stack isolée          |

## Infrastructure Docker

Trois services orchestrés par `docker-compose.yml` :

```text
┌─────────────────────────────────────────────────────┐
│                   docker-compose                     │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ postgres │  │   migrate    │  │      app      │  │
│  │  :5432   │  │ (exit 0 ok)  │  │   :3000       │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│                 prisma db push      Next.js           │
│                                                      │
│  Volume : postgres_data (persistant)                 │
└─────────────────────────────────────────────────────┘
```

- **`postgres`** : PostgreSQL 16-alpine, volume persistant
- **`migrate`** : stage `builder` du Dockerfile, exécute `prisma db push --accept-data-loss` puis s'arrête (`restart: no`)
- **`app`** : stage `runner` allégé (standalone Next.js), dépend de `migrate`

Port configurable via `APP_PORT` dans `.env` (défaut : 3001, le container interne reste sur :3000).

## Authentification et autorisation

```text
Navigateur → /auth/signin → Azure AD OAuth2 → callback NextAuth
                                                     ↓
                                         JWT stocké en cookie splitté
                                         (.0 / .1 si > 4KB)
                                                     ↓
                          API Route → getServerSession() → accessToken
                                                     ↓
                                        Microsoft Graph API
```

**Choix JWT pur :** le `PrismaAdapter` a été retiré car il créait une boucle d'authentification infinie (conflit entre sessions stockées en DB et stratégie JWT). La session existe uniquement dans le cookie signé ; la DB ne stocke que les `AuditLog`.

**Contrôle d'accès au login :** le callback `signIn` appelle `/me/transitiveMemberOf/microsoft.graph.directoryRole` avec le token initial d'Azure AD. Si l'utilisateur n'a aucun des 11 rôles AD acceptés (Global Admin, User Admin, Helpdesk Admin, License Admin, Groups Admin, Directory Readers, Exchange Admin, Security Admin, Auth Admin, App Admin, Teams Admin), la connexion est refusée et redirigée vers `/auth/error?error=AccessDenied`.

Permissions requises sur le tenant (Microsoft Graph, Delegated) :

- `User.ReadWrite.All`
- `Group.ReadWrite.All`
- `GroupMember.ReadWrite.All`
- `Directory.ReadWrite.All`
- `Organization.Read.All`
- `MailboxSettings.ReadWrite`
- `Presence.ReadWrite.All` *(admin consent requis ; graceful 403 si absent)*

## Couche services Graph

Tous les appels Microsoft Graph passent par `src/services/graph/`. Aucun appel Graph direct dans les API routes ou composants.

```text
src/services/graph/
  users.ts    listUsers, getUser, listUserMemberOf, resetUserPassword,
              updateUserEnabled, getMailboxSettings, updateMailboxSettings,
              setTeamsStatusMessage, listUserSignInLogs
  groups.ts   listGroups, getGroup, listGroupMembers, listGroupOwners,
              addGroupMember, addGroupOwner, removeGroupMember, removeGroupOwner,
              createGroup, listGroupCounts (via $batch)
  licenses.ts listSubscribedSkus, assignLicense, removeLicense
  roles.ts    listDirectoryRoles, listUserRoles, assignRole, removeRole
```

### Détection des types de comptes

`src/lib/account-types.ts` fournit une détection heuristique sans appel supplémentaire :

| Type      | Critère principal                                         |
|-----------|-----------------------------------------------------------|
| user      | Member actif avec licences                                |
| guest     | `userType = 'Guest'`                                      |
| shared    | Member sans licence, `mail` renseigné                     |
| room      | UPN/displayName contient "room" ou "salle"                |
| equipment | UPN/displayName contient "equip", "ressource"…            |
| service   | Member sans licence, sans mail                            |
| disabled  | `accountEnabled = false`                                  |

### Noms de licences

`src/lib/license-names.ts` mappe ~60 `skuPartNumber` vers leurs noms commerciaux (Microsoft 365 Business Premium, Exchange Online Plan 1, etc.).

## Audit et Rollback

### Table `audit_logs`

```sql
id             uuid PRIMARY KEY
user_id        varchar       -- UPN du compte admin connecté
user_upn       varchar
action         varchar       -- voir liste ci-dessous
target_id      varchar       -- ID objet modifié (userId, groupId…)
target_name    varchar       -- Nom lisible
target_type    varchar       -- "User", "Group"
payload_before jsonb         -- État avant (pour rollback)
payload_after  jsonb         -- État après
created_at     timestamptz   DEFAULT now()
```

### Actions tracées

| Action              | Déclencheur                              |
|---------------------|------------------------------------------|
| GROUP_MEMBER_ADD    | Ajout d'un membre dans un groupe         |
| GROUP_MEMBER_REMOVE | Retrait d'un membre                      |
| GROUP_OWNER_ADD     | Ajout d'un owner                         |
| GROUP_OWNER_REMOVE  | Retrait d'un owner                       |
| GROUP_CREATE        | Création d'un nouveau groupe             |
| DL_MEMBER_ADD       | Ajout membre liste distribution (Exch.)  |
| DL_MEMBER_REMOVE    | Retrait membre liste distribution (Exch.)|
| DL_OWNER_ADD        | Ajout proprietaire DL (Exchange)         |
| DL_OWNER_REMOVE     | Retrait proprietaire DL (Exchange)       |
| DL_CREATE           | Creation liste de distribution (Exch.)   |
| LICENSE_ASSIGN      | Attribution de licence à un utilisateur  |
| LICENSE_REMOVE      | Retrait de licence                       |
| PASSWORD_RESET      | Réinitialisation de mot de passe         |
| ACCOUNT_DISABLE     | Désactivation d'un compte utilisateur    |
| ACCOUNT_ENABLE      | Réactivation d'un compte utilisateur     |
| ROLE_ASSIGN         | Attribution d'un rôle AD à un utilisateur|
| ROLE_REMOVE         | Retrait d'un rôle AD                     |
| OOO_UPDATE          | Mise à jour de l'absence mail (OOO)      |
| TEAMS_STATUS_UPDATE | Mise à jour du message de statut Teams   |

### Principe du rollback (UI à implémenter)

`payload_before` contient l'état avant chaque mutation. Opérations rollbackables : ajout/retrait membre/owner, attribution/retrait licence. Non rollbackable : réinitialisation MDP.

## Flux de données

```text
UI (React/TanStack Query)
        ↓  fetch
API Route Next.js (Zod + getServerSession)
        ↓  accessToken
Service Graph → Microsoft Graph API v1.0
        ↓  logAudit
Service Audit → PostgreSQL (audit_logs)
```

## Mise en page responsive

`DashboardShell` (`src/components/layout/dashboard-shell.tsx`) est un client component qui encapsule la sidebar et le contenu principal :

- **Desktop** (`lg:`) : sidebar statique 256 px à gauche, contenu scrollable à droite
- **Mobile** : sidebar en `fixed` avec transform CSS, cachée par défaut, ouverture via bouton hamburger dans la barre supérieure, backdrop overlay cliquable pour fermer
- `InactivityWatcher` est rendu directement dans `DashboardShell`

## Accessibilité visuelle

`src/lib/accessibility.ts` expose un hook `useAccessibility()` utilisé par la `Sidebar` :

- Mode stocké dans `localStorage` (`onering-a11y-mode`)
- `applyA11yMode()` ajoute une classe CSS sur `document.body` (`a11y-monochrome`, `a11y-high-contrast`, etc.)
- Filtres CSS `grayscale` et `contrast` pour les modes simples
- Filtres SVG `feColorMatrix` définis dans `src/app/layout.tsx` pour simuler la protanopie, deutéranopie et tritanopie

## Tri des colonnes

`src/lib/use-sort.ts` expose un hook générique `useSort<T, K>` utilisé par toutes les vues tabulaires (utilisateurs, groupes, détail groupe, audit). `src/components/ui/sortable-head.tsx` affiche l'icône de tri active/inactive et dispatche les clics.

## Paramètres locaux d'administration

`src/lib/admin-settings.ts` (hook `useAdminSettings` + `getAdminSettings`) stocke dans `localStorage` les préférences de l'administrateur : masquage des boutons destructifs, affichage des actions avancées (désactiver compte, rôles AD, création/suppression d'utilisateurs via portail Entra), et mots-clés personnalisés pour la détection de types de comptes.

## Sécurité

- Validation des inputs côté serveur (Zod) avant tout appel Graph
- `getServerSession()` vérifié dans chaque API route — retourne 401 si absent
- **Contrôle des rôles AD au login** — signIn callback, retourne 401 si aucun rôle admin valide
- Token Graph jamais exposé côté client
- Cookies de session signés avec `NEXTAUTH_SECRET`
- Confirmation utilisateur obligatoire avant toute mutation destructive (inline ou dialog)
- Gestion gracieuse des 403 (permissions manquantes sur le tenant) — `PermissionWarning` UI
