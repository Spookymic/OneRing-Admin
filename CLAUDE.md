# CLAUDE.md — M365 Administrator

## Contexte du projet

Outil d'administration Microsoft 365 centralisé. Remplace les consoles Entra, Exchange et Admin Center.
Cible : administrateurs M365. Echeance MVP : 31/03/2026.

## Regles absolues

- **Ne jamais implementer** la creation ou suppression de comptes utilisateurs (hors perimetre)
- **Toujours verifier** les droits admin du compte connecte avant toute operation
- **Toujours demander confirmation** avant toute modification (suppression, reinitialisation, retrait de licence)
- **Toujours journaliser** chaque modification : qui, quand, quoi (table `audit_logs` via `src/services/audit.ts`)
- **Toujours proposer un rollback** pour les operations reversibles

## Authentification

- SSO Microsoft uniquement via NextAuth v4 + Azure AD provider
- Les droits sont ceux du compte connecte — pas de role applicatif custom
- Token Graph recupere via le callback `jwt` de NextAuth, passe aux services via `getServerSession`
- Appeler `getGraphClient(session.accessToken)` depuis `src/lib/graph.ts` dans chaque API route
- **JWT pur** : pas de PrismaAdapter (supprime pour eviter boucle auth)

## Points techniques importants

- **Prisma v7** : connexion configuree dans `prisma.config.ts` (pas dans `schema.prisma`)
- **Next.js 16** : `params` est une `Promise<{...}>` dans les routes dynamiques — toujours `await params`
- **shadcn/ui v4** : base sur `@base-ui/react`, `Button` n'a plus de prop `asChild` — wrapper avec `<Link>` natif
- **Toast** : utiliser `src/hooks/use-toast.ts` (wrapper sonner) — ne pas importer depuis shadcn directement
- **Select onValueChange** : peut recevoir `string | null` — toujours fournir une valeur par defaut (`v ?? "all"`)
- **listUsers** : ne filtre plus par `userType eq 'Member'` — retourne tous les comptes. Le tri et filtre par type sont cote client via `detectAccountType()` de `src/lib/account-types.ts`

## Types de comptes utilisateurs

La detection du type se fait cote client dans `src/lib/account-types.ts` :

| Type      | Label            | Criteres (heuristique)                                      |
|-----------|------------------|-------------------------------------------------------------|
| user      | Utilisateur      | Member, actif, avec licences                                |
| guest     | Invite           | userType = 'Guest'                                          |
| shared    | Boite partagee   | Member, sans licence, mail present                          |
| room      | Salle            | UPN/displayName contient "room" ou "salle"                  |
| equipment | Equipement       | UPN/displayName contient "equip", "ressource", "imprimante" |
| service   | Compte service   | Member, sans licence, sans mail                             |
| disabled  | Desactive        | accountEnabled = false avec licences                        |

## Conventions de code

- TypeScript strict, pas de `any` sauf adaptateurs tiers documentes
- Validation Zod obligatoire cote serveur avant tout appel Graph API
- Les appels Microsoft Graph passent uniquement par `src/services/graph/`
- Audit obligatoire dans chaque mutation via `logAudit()` de `src/services/audit.ts`
- Actions audit : `GROUP_MEMBER_ADD/REMOVE`, `GROUP_OWNER_ADD/REMOVE`, `GROUP_CREATE`, `LICENSE_ASSIGN/REMOVE`, `PASSWORD_RESET`

## Structure des dossiers

```text
src/
  app/
    api/
      users/route.ts              # GET tous les comptes (sans filtre userType)
      users/[id]/groups/route.ts  # GET/POST groupes d'un utilisateur
      users/[id]/reset-password/  # POST reset MDP
      groups/route.ts             # GET liste + POST creation
      groups/[id]/members/        # GET/POST membres
      groups/[id]/owners/         # GET/POST owners
      licenses/route.ts           # GET SKUs
      licenses/[userId]/route.ts  # POST assigner/retirer
      audit/route.ts              # GET historique
    dashboard/
      page.tsx          # Tableau de bord principal (stats + SKUs + audit recent)
      users/page.tsx
      groups/page.tsx
      groups/[id]/page.tsx
      licenses/page.tsx
      audit/page.tsx
  components/
    layout/
      sidebar.tsx       # Navigation avec lien Dashboard
    users/
      reset-password-dialog.tsx
      user-groups-sheet.tsx     # Panneau lateral groupes utilisateur
    groups/
      add-member-dialog.tsx     # Ajout membre/owner
      create-group-dialog.tsx   # Creation de groupe
    ui/                 # Composants shadcn/ui
  services/
    graph/
      users.ts          # listUsers, getUser, listUserMemberOf, resetUserPassword
      groups.ts         # CRUD groupes + membres + owners
      licenses.ts       # listSubscribedSkus, assignLicense, removeLicense
    audit.ts            # logAudit, getAuditLogs
  lib/
    auth.ts             # Config NextAuth (JWT pur)
    graph.ts            # Factory GraphClient
    prisma.ts           # Singleton PrismaClient
    account-types.ts    # detectAccountType, ACCOUNT_TYPE_CONFIG
    license-names.ts    # SKU_FRIENDLY_NAMES, getSkuFriendlyName
  hooks/
    use-toast.ts        # Wrapper sonner
  types/
    next-auth.d.ts
```

## Workflow de developpement

1. `docker compose up -d postgres` puis `npx prisma db push` puis `npm run dev`
2. Tester les appels Graph sur un tenant de dev avant prod
3. Utiliser `rtk` pour toutes les commandes (voir `~/.claude/CLAUDE.md`)
4. Ne pas committer si TypeScript a des erreurs (`npx tsc --noEmit`)

## Fichiers cles

- [README.md](README.md) — Vue d'ensemble, demarrage rapide, config Azure AD
- [docs/Architecture.md](docs/Architecture.md) — Choix techniques detailles
- [docs/Reprise.md](docs/Reprise.md) — Etat d'avancement et prochaines actions
