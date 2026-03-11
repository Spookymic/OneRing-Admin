# Architecture — M365 Administrator

## Stack technique

| Couche           | Technologie                      | Justification                                    |
| ---------------- | -------------------------------- | ------------------------------------------------ |
| Framework        | Next.js 14+ (App Router)         | SSR, routing intégré, compatibilité MSAL         |
| Langage          | TypeScript strict                | Sécurité des types, meilleure DX                 |
| Authentification | MSAL.js / NextAuth avec Azure AD | SSO Microsoft natif, gestion tokens Graph        |
| API              | Microsoft Graph API v1.0         | Source unique de vérité pour M365                |
| UI               | shadcn/ui + Tailwind CSS         | Composants accessibles, design system cohérent   |
| Base de données  | PostgreSQL (container Docker)    | Self-hosted, aucune dépendance cloud externe     |
| ORM              | Prisma                           | Type-safe, migrations versionnées                |
| État client      | TanStack Query (React Query)     | Cache, refetch, optimistic updates               |
| Conteneurisation | Docker + Docker Compose          | Déploiement reproductible, stack isolée          |

## Infrastructure Docker

L'application tourne via `docker-compose` avec deux services :

```text
┌─────────────────────────────────────┐
│           docker-compose            │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  app:3000   │  │  postgres    │  │
│  │  (Next.js)  │──│  :5432       │  │
│  └─────────────┘  └──────────────┘  │
│                                     │
│  Volume : postgres_data (persistant)│
└─────────────────────────────────────┘
```

```yaml
# docker-compose.yml (aperçu)
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://m365admin:password@postgres:5432/m365admin
      NEXTAUTH_URL: http://localhost:3000
      AZURE_AD_CLIENT_ID: ...
      AZURE_AD_CLIENT_SECRET: ...
      AZURE_AD_TENANT_ID: ...
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: m365admin
      POSTGRES_USER: m365admin
      POSTGRES_PASSWORD: password

volumes:
  postgres_data:
```

## Authentification et autorisation

```text
Utilisateur → SSO Microsoft (MSAL) → Token Azure AD
                                          ↓
                              Vérification rôles admin
                              (via /me/memberOf ou /me/transitiveMemberOf)
                                          ↓
                              Accès accordé / refusé
```

Les droits nécessaires sur le tenant :

- `User.ReadWrite.All`
- `Group.ReadWrite.All`
- `GroupMember.ReadWrite.All`
- `Directory.ReadWrite.All`
- `Organization.Read.All`

## Couche Graph API

Tous les appels Microsoft Graph passent par `src/services/graph/`. Chaque module correspond à un domaine :

```text
src/services/graph/
  users.ts            # Gestion utilisateurs (read, resetPassword, assignLicense)
  groups.ts           # Groupes M365, listes de distribution, groupes de sécurité
  sharedMailboxes.ts  # Boîtes aux lettres partagées
  members.ts          # Ajout/suppression de membres dans les groupes
  licenses.ts         # Liste et assignation des SKUs
```

## Audit et Rollback

### Table `audit_logs`

```sql
id             uuid PRIMARY KEY
user_id        varchar       -- UPN du compte admin
action         varchar       -- ex: "GROUP_MEMBER_ADD", "LICENSE_ASSIGN"
target_id      varchar       -- ID de l'objet modifié (userId, groupId...)
target_name    varchar       -- Nom lisible
payload_before jsonb         -- État avant modification (pour rollback)
payload_after  jsonb         -- État après modification
created_at     timestamptz   DEFAULT now()
```

### Principe du rollback

Avant chaque modification, un snapshot de l'état courant est sauvegardé dans `payload_before`. Le rollback rejoue l'état précédent via un appel Graph inverse.

Opérations rollbackables :

- Ajout/suppression de membre dans un groupe
- Attribution/retrait de licence
- Réinitialisation de mot de passe (non rollbackable — signalé à l'utilisateur)

## Flux de données

```text
UI (React) → API Route Next.js → Service Graph → Microsoft Graph API
                    ↓
             Service Audit → PostgreSQL (audit_logs)
```

## Sécurité

- Validation des inputs côté serveur (Zod) avant tout appel Graph
- Middleware Next.js vérifiant la session à chaque route `/api/*`
- Pas de token Graph stocké côté client
- Les tokens sont gérés server-side via MSAL Node
