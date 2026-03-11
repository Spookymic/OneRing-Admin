# Reprise de contexte — M365 Administrator

Ce document permet de reprendre le projet rapidement entre deux sessions Claude.

## Résumé du projet

Outil Next.js + TypeScript remplaçant les consoles M365 (Entra, Exchange, Admin Center).
Auth SSO Microsoft. Appels Microsoft Graph API. Audit log + rollback. Echéance : 31/03/2026.

## Etat d'avancement

| Phase                        | Statut   | Notes                                    |
| ---------------------------- | -------- | ---------------------------------------- |
| Cadrage                      | Termine  |                                          |
| Documentation initiale       | Termine  |                                          |
| Initialisation du projet     | Termine  | Next.js 16, Prisma v7, shadcn/ui v4      |
| Infrastructure Docker        | Termine  | docker-compose + PostgreSQL 16           |
| Authentification MSAL        | Termine  | NextAuth v4 + Azure AD provider          |
| Liste utilisateurs           | Termine  | Page /dashboard/users                    |
| Reinitialisation MDP         | Termine  | Dialog + API route + audit               |
| Gestion groupes              | Termine  | Page /dashboard/groups avec filtres      |
| Gestion membres              | Termine  | Page /dashboard/groups/[id]              |
| Gestion licences             | Termine  | Page /dashboard/licenses                 |
| Audit log                    | Termine  | Page /dashboard/audit + PostgreSQL       |
| Rollback                     | A faire  | payloadBefore present, UI manquante      |

## Adaptations techniques notables (vs spec initiale)

- **Prisma v7** : n'accepte plus `url` dans `schema.prisma`. Connexion via `prisma.config.ts` + adaptateur `PrismaPg`.
- **shadcn/ui v4** : `Button` sans `asChild` (base-ui). Les liens sont wrappés avec `<Link>` natif.
- **Next.js 15/16** : `params` est une `Promise<{...}>` dans les routes dynamiques — `await params` obligatoire.
- **Toast** : composant `toast` supprime du registry shadcn v4, remplace par `sonner` + hook de compatibilite `src/hooks/use-toast.ts`.

## Fichiers cles

```text
src/
  app/
    api/
      auth/[...nextauth]/route.ts   # Handler NextAuth
      users/route.ts                # GET liste utilisateurs
      users/[id]/reset-password/    # POST reset MDP
      groups/route.ts               # GET liste groupes
      groups/[id]/members/route.ts  # GET/POST membres
      licenses/route.ts             # GET SKUs
      licenses/[userId]/route.ts    # POST assigner/retirer
      audit/route.ts                # GET historique
    dashboard/
      users/page.tsx
      groups/page.tsx
      groups/[id]/page.tsx
      licenses/page.tsx
      audit/page.tsx
  services/
    graph/users.ts
    graph/groups.ts
    graph/licenses.ts
    audit.ts
  lib/
    auth.ts      # Config NextAuth
    graph.ts     # Factory GraphClient
    prisma.ts    # Singleton PrismaClient
prisma/
  schema.prisma  # 5 modeles : AuditLog, Account, Session, User, VerificationToken
prisma.config.ts # Connexion Prisma v7
```

## Prochaines actions prioritaires

1. **Rollback UI** — ajouter un bouton "Annuler" sur les lignes d'audit rollbackables (GROUP_MEMBER_ADD/REMOVE, LICENSE_ASSIGN/REMOVE)
2. **Validation droits admin** — verifier au login que le compte connecte a bien un role admin sur le tenant (appel `/me/memberOf`)
3. **Tests** — ajouter tests des API routes avec MSW pour mocker Graph API
4. **Gestion erreurs Graph** — affichage lisible des erreurs 403/throttling Microsoft Graph

## Commandes utiles

```bash
# Developement local
docker compose up -d postgres
npx prisma migrate dev
npm run dev

# Build et deploiement
docker compose up -d --build

# Migrations en prod
docker compose exec app npx prisma migrate deploy

# Logs
docker compose logs -f app
```

## Questions ouvertes

- Hebergement cible : Azure Container Apps, VPS, ou on-premise ?
- Faut-il une page de dashboard/accueil avec des metriques (nb users, groupes, licences utilisees) ?
- Gestion des boites partagees via Exchange Online (endpoint different de /groups) ?
