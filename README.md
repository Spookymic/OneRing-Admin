# M365 Administrator

Outil d'administration centralisé pour Microsoft 365, conçu pour remplacer les consoles Entra, Exchange et Admin Center par une interface unique, rapide et fiable.

## Fonctionnalités

### MVP

- **Utilisateurs** — Liste, réinitialisation de mot de passe, gestion des licences
- **Groupes** — Liste, ajout, suppression et administration des :
  - Groupes Microsoft 365
  - Listes de distribution
  - Groupes de sécurité à extension de messagerie
  - Boîtes aux lettres partagées
- **Membres** — Ajout/suppression d'utilisateurs dans les groupes
- **Licences** — Attribution et retrait de licences par utilisateur
- **Audit** — Historique des modifications (Qui, Quand, Quoi)
- **Rollback** — Possibilité d'annuler les modifications

### Hors périmètre

- Création / Suppression de comptes utilisateurs

## Authentification

Connexion SSO Microsoft. L'accès aux fonctionnalités est conditionné par les droits d'administrateur du compte connecté sur le tenant M365 — aucun rôle applicatif spécifique n'est requis.

## Prérequis

- Node.js 20+
- Un tenant Microsoft 365
- Un compte avec droits d'administration sur le tenant

## Installation

```bash
npm install
```

## Démarrage

```bash
npm run dev
```

## Stack technique

Voir [docs/Architecture.md](docs/Architecture.md).

## Reprise de contexte

Voir [docs/Reprise.md](docs/Reprise.md).
