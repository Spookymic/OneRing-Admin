# Reprise de contexte — M365 Administrator

Ce document permet de reprendre le projet rapidement entre deux sessions Claude.

## Résumé du projet

Outil Next.js + TypeScript remplaçant les consoles M365 (Entra, Exchange, Admin Center).
Auth SSO Microsoft. Appels Microsoft Graph API. Audit log + rollback. Échéance : 31/03/2026.

## État d'avancement

| Phase                        | Statut       | Notes |
| ---------------------------- | ------------ | ----- |
| Cadrage                      | Terminé      |       |
| Documentation initiale       | Terminé      |       |
| Initialisation du projet     | À faire      |       |
| Authentification MSAL        | À faire      |       |
| Liste utilisateurs           | À faire      |       |
| Réinitialisation mot de passe | À faire     |       |
| Gestion groupes              | À faire      |       |
| Gestion membres              | À faire      |       |
| Gestion licences             | À faire      |       |
| Audit log                    | À faire      |       |
| Rollback                     | À faire      |       |

## Fichiers clés à lire en priorité

1. [CLAUDE.md](../CLAUDE.md) — Règles et conventions du projet
2. [docs/Architecture.md](Architecture.md) — Stack et choix techniques
3. `src/services/graph/` — Point d'entrée de toute la logique métier
4. `prisma/schema.prisma` — Modèle de données (une fois créé)

## Décisions techniques actées

- SSO Microsoft via MSAL Node (server-side) + NextAuth adapter
- Pas de rôle applicatif : les droits sont ceux du compte connecté
- PostgreSQL pour l'audit log (pas de stockage en mémoire)
- Un seul fichier de service par domaine Graph (`users.ts`, `groups.ts`, etc.)
- Validation Zod obligatoire côté serveur avant tout appel Graph

## Points de vigilance

- Toujours vérifier que le compte connecté a bien les rôles admin avant d'exposer une action
- La réinitialisation de mot de passe n'est pas rollbackable — toujours en informer l'utilisateur
- Les boîtes partagées et les listes de distribution s'administrent via Graph mais avec des endpoints différents des groupes M365 classiques
- Tester sur un tenant de dev avant tout déploiement

## Prochaine action

Initialiser le projet Next.js et configurer l'authentification MSAL.

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir
```

## Questions ouvertes

- Hébergement : Azure Static Web Apps, Vercel, ou self-hosted ?
- Base de données : Neon (serverless) ou Supabase ?
- Faut-il un tableau de bord / dashboard ou uniquement des vues liste ?
