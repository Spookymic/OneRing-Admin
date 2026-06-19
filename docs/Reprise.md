# Reprise de contexte — M365 Administrator

Ce document permet de reprendre le projet rapidement entre deux sessions Claude.

## Résumé du projet

Outil Next.js 16 + TypeScript remplaçant les consoles M365 (Entra, Exchange, Admin Center).
Auth SSO Microsoft (NextAuth v4 + Azure AD). Appels Microsoft Graph API. Audit log PostgreSQL. Échéance : 31/03/2026.

## Version actuelle : 1.15.1 (2026-06-19)

Voir [CHANGELOG.md](../CHANGELOG.md) pour le détail des modifications.

## État d'avancement

| Phase | Statut | Notes |
| ----- | ------ | ----- |
| Cadrage | Terminé | |
| Documentation | Terminé | README, CLAUDE.md, Architecture.md, Reprise.md, CHANGELOG.md |
| Initialisation du projet | Terminé | Next.js 16, Prisma v7, shadcn/ui v4 |
| Infrastructure Docker | Terminé | 3 services : postgres, migrate, app |
| Authentification MSAL | Terminé | NextAuth v4 + JWT pur (sans PrismaAdapter) |
| Validation droits admin au login | Terminé | signIn callback → rôles AD via Graph, AccessDenied/RoleCheckFailed |
| Tableau de bord principal | Terminé | Stats cliquables, anomalies, SKUs, audit récent, précisions types + Actifs/Invités |
| Liste utilisateurs | Terminé | Filtres URL, colonnes persistées, tri, scrollbar horizontale |
| Panneau utilisateur (sheet) | Terminé | Groupes, licences, réinit MDP, désactiver/activer, rôles AD, absence |
| Réinitialisation MDP | Terminé | Dialog + API route + audit |
| Gestion groupes | Terminé | Liste avec filtres URL, tri, création de groupe |
| Gestion membres/owners | Terminé | Page detail : liste unifiée membre+owner, ajout avec rôle, tri |
| Gestion licences | Terminé | Cartes SKU + panneau bénéficiaires avec ajout/retrait |
| Audit log | Terminé | Page historique + PostgreSQL, tri, nouveaux labels d'action |
| Interface responsive | Terminé | Sidebar collapsible sur mobile, DashboardShell |
| Accessibilité visuelle | Terminé | 6 modes (monochrome, contraste, daltonisme), localStorage |
| Administration | Terminé | Paramètres locaux, contrôle actions sensibles, mots-clés types, export/import JSON |
| Export CSV connexions | Terminé | 50 entrées + bouton export dans fiche user |
| Noms produits licences | Terminé | skuPartNumber retiré des cartes SKU, EMS mappés |
| Accessibilité contraste | Terminé | CSS variables overrides + règles !important ciblées sur main |
| Export CSV historique | Terminé | Bouton dans onglet Historique |
| Rétention historique | Terminé | Administration → 30/60/90/180/365/illimité |
| Noms licences officiels | Terminé | 609 entrées depuis référence Microsoft officielle |
| Propriétaires groupes | Terminé | Sheet glissant, tri alpha, notice DL (limitation Graph API) |
| Audit paramètres admin | Terminé | POST /api/audit, ADMIN_SETTINGS_UPDATE journalisé |
| Pont Exchange — socle | Terminé | Sidecar `exo-bridge` (pwsh + Pode, app-only cert), `/health` + `/diag/dl` validés |
| Pont Exchange — membres DL | Terminé | Add/Remove via bridge, garde `isExchangeAdmin`, audit `DL_MEMBER_ADD/REMOVE` |
| Pont Exchange — owners DL + création DL | Terminé | `ManagedBy` (lecture+écriture), `New-DistributionGroup`, audit `DL_OWNER_ADD/REMOVE`, `DL_CREATE` |
| Pont Exchange — boîtes partagées | Terminé | Page dédiée, création `New-Mailbox -Shared`, délégations FullAccess/SendAs/SendOnBehalf, audit `SHARED_MAILBOX_CREATE`, `MAILBOX_PERMISSION_ADD/REMOVE` |
| Rollback UI | À faire | payloadBefore présent, bouton UI manquant |

## Adaptations techniques notables

- **Prisma v7** : connexion via `prisma.config.ts` + adaptateur `PrismaPg`. Pas d'`url` dans `schema.prisma`.
- **shadcn/ui v4** : base `@base-ui/react`. `Button` sans `asChild`. Links wrappés avec `<Link>` natif.
- **Next.js 16** : `params` est une `Promise<{...}>` dans les routes dynamiques — `await params` obligatoire.
- **Toast** : composant supprimé du registry shadcn v4, remplacé par Sonner + hook `src/hooks/use-toast.ts`.
- **JWT pur** : `PrismaAdapter` retiré — boucle auth infinie causée par conflit DB sessions + stratégie JWT.
- **listUsers** : filtre `userType eq 'Member'` retiré — retourne tout le répertoire. Filtrage côté client.
- **ConsistencyLevel** : header `eventual` + `$count=true` requis sur `/users` pour éviter "Sorting not supported".
- **prisma db push** : utilisé à la place de `migrate deploy` (pas de fichiers de migration générés).

## Fichiers clés

```text
src/
  app/
    dashboard/page.tsx                    # Stats + SKUs + audit récent, précisions types comptes
    auth/error/page.tsx                   # Page erreur auth (AccessDenied, RoleCheckFailed)
    api/
      users/route.ts                      # GET tous comptes
      users/[id]/route.ts                 # PATCH accountEnabled (désactiver/réactiver)
      users/[id]/groups/route.ts          # GET groupes d'un user
      users/[id]/mailbox-settings/route.ts# GET/PATCH absence mail (OOO)
      users/[id]/teams-presence/route.ts  # POST statut Teams
      users/[id]/roles/route.ts           # GET/POST rôles AD d'un user
      roles/route.ts                      # GET tous les rôles AD du tenant
      groups/route.ts                     # GET liste + POST création
      groups/[id]/members/route.ts
      groups/[id]/owners/route.ts
      licenses/[userId]/route.ts
      audit/route.ts
    dashboard/
      users/page.tsx                      # Filtres type compte, tri colonnes
      groups/page.tsx                     # Tri colonnes, bouton créer groupe
      groups/[id]/page.tsx                # Owners + membres fusionnés, tri
      licenses/page.tsx
      audit/page.tsx                      # Tri, labels actions v1.2.0
      admin/page.tsx                      # Paramètres locaux
  components/
    users/
      user-groups-sheet.tsx               # + désactiver/activer, onglet Rôles, onglet Absence
      reset-password-dialog.tsx
    groups/
      add-member-dialog.tsx
      create-group-dialog.tsx
  services/exchange/                      # Pont Exchange Online (sidecar) — non couvert par Graph
    client.ts                             # bridgeFetch (X-Bridge-Secret, EXO_BRIDGE_URL)
    distribution-groups.ts                # membres + owners + création DL
    shared-mailboxes.ts                   # boîtes partagées : liste, création, délégations
  app/dashboard/mailboxes/page.tsx        # Liste boîtes partagées + création + délégations
  app/api/mailboxes/                      # GET/POST liste+création, [id]/permissions GET/POST
  components/mailboxes/                   # create-shared-mailbox, mailbox-delegations-sheet, add-delegation
  services/graph/
    users.ts                              # + updateUserEnabled, getMailboxSettings, updateMailboxSettings, setTeamsStatusMessage
    groups.ts                             # + isExchangeManagedGroup
    licenses.ts
    roles.ts                              # listDirectoryRoles, listUserRoles, assignRole, removeRole
  lib/
    account-types.ts                      # detectAccountType, ACCOUNT_TYPE_CONFIG
    license-names.ts
    auth.ts                               # + signIn callback rôles AD
    exchange-guard.ts                     # isExchangeAdmin — garde du canal app-only
    admin-settings.ts                     # + showDisableUser, showUserRoles
    use-sort.ts                           # Hook générique tri colonnes
  components/ui/
    sortable-head.tsx                     # Composant en-tête de colonne triable
  services/audit.ts                       # + ACCOUNT_DISABLE/ENABLE, ROLE_ASSIGN/REMOVE, OOO_UPDATE, TEAMS_STATUS_UPDATE
```

## Prochaines actions prioritaires

1. **Rollback UI** — ajouter bouton "Annuler" sur les lignes d'audit rollbackables (membres, licences)
2. **Gestion erreurs Graph** — affichage lisible des erreurs 403 / throttling Microsoft
3. **Types de compte améliorés** — utiliser `/places/microsoft.graph.room` et `/places/microsoft.graph.equipment` pour détecter salles/équipements de façon fiable
4. **Tests** — API routes avec MSW pour mocker Graph API
5. **Admin SSO** — déplacer la config Azure AD dans l'onglet Administration
6. **Administrateur local** — compte sans accès Graph, uniquement gestion de l'application

## Commandes utiles

```bash
# Développement local
docker compose up -d postgres
npx prisma db push
npm run dev

# Build et déploiement
docker compose up -d --build

# Logs
docker compose logs -f app

# Vérification TypeScript
npx tsc --noEmit
```

## Questions ouvertes

- Hébergement cible : on-premise Docker. Accès par domaine HTTPS via Caddy (`tls internal`) — voir [Deploiement-domaine.md](Deploiement-domaine.md). Reste à trancher : domaine définitif + distribution de la CA interne (GPO) ou bascule DNS-01 pour des certificats publiquement reconnus.
- **Pont Exchange Online** (DL, groupes mail-enabled, boîtes partagées) : cadré dans [ADR-001-pont-exchange.md](ADR-001-pont-exchange.md). Décision : sidecar PowerShell Docker on-premise, livraison par étapes (DL membres en premier). En attente du provisionnement tenant (app reg + certificat + rôle Exchange Admin).
- Pagination côté serveur pour les tenants de très grande taille (> 999 utilisateurs) ?
