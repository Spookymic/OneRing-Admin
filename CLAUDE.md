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

## Points techniques importants

- **Prisma v7** : connexion configuree dans `prisma.config.ts` (pas dans `schema.prisma`)
- **Next.js 16** : `params` est une `Promise<{...}>` dans les routes dynamiques — toujours `await params`
- **shadcn/ui v4** : `Button` n'a plus de prop `asChild` — wrapper avec `<Link>` natif
- **Toast** : utiliser `src/hooks/use-toast.ts` (wrapper sonner) — ne pas importer depuis shadcn directement

## Conventions de code

- TypeScript strict, pas de `any` sauf adaptateurs tiers documentes
- Validation Zod obligatoire cote serveur avant tout appel Graph API
- Les appels Microsoft Graph passent uniquement par `src/services/graph/`
- Audit obligatoire dans chaque mutation via `logAudit()` de `src/services/audit.ts`

## Structure des dossiers

```text
src/
  app/
    api/          # API Routes Next.js (auth, users, groups, licenses, audit)
    auth/         # Pages signin et error
    dashboard/    # Pages UI (users, groups, groups/[id], licenses, audit)
  components/
    layout/       # Sidebar
    users/        # Composants specifiques utilisateurs
    groups/       # Composants specifiques groupes
    ui/           # Composants shadcn/ui
  services/
    graph/        # Wrappers Microsoft Graph API (users, groups, licenses)
    audit.ts      # Service de journalisation
  lib/
    auth.ts       # Config NextAuth
    graph.ts      # Factory GraphClient
    prisma.ts     # Singleton PrismaClient
  hooks/
    use-toast.ts  # Wrapper sonner
  types/
    next-auth.d.ts
```

## Workflow de developpement

1. `docker compose up -d postgres` puis `npx prisma migrate dev` puis `npm run dev`
2. Tester les appels Graph sur un tenant de dev avant prod
3. Utiliser `rtk` pour toutes les commandes (voir `~/.claude/CLAUDE.md`)
4. Ne pas committer si TypeScript a des erreurs (`npm run build`)

## Fichiers cles

- [README.md](README.md) — Vue d'ensemble, demarrage rapide, config Azure AD
- [docs/Architecture.md](docs/Architecture.md) — Choix techniques detailles
- [docs/Reprise.md](docs/Reprise.md) — Etat d'avancement et prochaines actions
