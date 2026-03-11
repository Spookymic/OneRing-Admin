# CLAUDE.md — M365 Administrator

## Contexte du projet

Outil d'administration Microsoft 365 centralisé. Remplace les consoles Entra, Exchange et Admin Center.
Cible : administrateurs M365. Échéance MVP : 31/03/2026.

## Règles absolues

- **Ne jamais implémenter** la création ou suppression de comptes utilisateurs (hors périmètre)
- **Toujours vérifier** les droits admin du compte connecté avant toute opération
- **Toujours demander confirmation** avant toute modification (suppression, réinitialisation, retrait de licence)
- **Toujours journaliser** chaque modification : qui, quand, quoi (table `audit_logs`)
- **Toujours proposer un rollback** pour les opérations réversibles

## Authentification

- SSO Microsoft uniquement (MSAL / Microsoft Identity Platform)
- Les droits sont ceux du compte connecté — pas de rôle applicatif custom
- Vérifier les rôles Graph API au login : `User.ReadWrite.All`, `Group.ReadWrite.All`, `Directory.ReadWrite.All`

## Conventions de code

- TypeScript strict
- Nommage en français pour les variables métier, anglais pour le code technique
- Toujours valider les inputs côté serveur avant appel Graph API
- Les appels Microsoft Graph passent uniquement par la couche service (`/src/services/graph/`)

## Structure des dossiers

```
src/
  app/          # Next.js App Router (pages et layouts)
  components/   # Composants UI réutilisables
  services/
    graph/      # Wrappers Microsoft Graph API
    audit/      # Service de journalisation
  lib/          # Utilitaires, helpers
  types/        # Types TypeScript partagés
docs/
  Architecture.md
  Reprise.md
```

## Workflow de développement

1. Toujours tester les appels Graph sur un tenant de dev avant prod
2. Utiliser `rtk` pour toutes les commandes (voir `~/.claude/CLAUDE.md`)
3. Ne pas committer sans que les types TypeScript compilent

## Fichiers clés

- [README.md](README.md) — Vue d'ensemble et démarrage rapide
- [docs/Architecture.md](docs/Architecture.md) — Choix techniques détaillés
- [docs/Reprise.md](docs/Reprise.md) — Reprise de contexte entre sessions
