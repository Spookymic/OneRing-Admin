# M365 Administrator

Outil d'administration centralisé pour Microsoft 365, conçu pour remplacer les consoles Entra, Exchange et Admin Center par une interface unique, rapide et fiable.

## Fonctionnalités

### Tableau de bord

- Vue d'ensemble du tenant : KPIs utilisateurs, groupes, licences
- Répartition des types de comptes (utilisateurs, boîtes partagées, salles, équipements, invités…)
- Statut des comptes (actifs / désactivés)
- Abonnements Microsoft 365 avec jauge de consommation
- Dernières modifications de l'historique d'audit

### Utilisateurs

- Liste complète avec tous les types de comptes (membres, invités, boîtes partagées, salles, équipements, comptes service)
- Détection automatique du type de compte (heuristique sans appel extra)
- Filtres : type de compte, statut, département, recherche libre
- Clic sur un compte → panneau latéral de gestion des groupes (ajouter / retirer, choix du rôle)
- Réinitialisation de mot de passe avec confirmation

### Groupes

- Liste par type : Microsoft 365, distribution, sécurité
- Création de groupe (sécurité / M365 / distribution)
- Détail : liste unifiée owners + membres avec colonne Rôle
- Ajout de membre avec choix du rôle (Membre / Owner)
- Suppression de membre ou d'owner

### Licences

- Assignation et retrait de licences par SKU
- Noms conviviaux des licences (Microsoft 365 Business Premium, Exchange Online Plan 1…)
- Vue par utilisateur avec badges de licence

### Historique

- Audit log complet : Qui, Quand, Quoi, Cible
- Toutes les actions tracées : membres, owners, licences, réinitialisations MDP, créations de groupe

**Hors périmètre :** création et suppression de comptes utilisateurs.

## Prérequis

- Docker et Docker Compose
- Un tenant Microsoft 365
- Un compte avec droits d'administration sur le tenant
- Une App Registration Azure AD (voir [Configuration Azure AD](#configuration-azure-ad))

## Démarrage rapide

```bash
# 1. Copier et remplir les variables d'environnement
cp .env.example .env

# 2. Lancer la stack (build + migrate + démarrage)
docker compose up -d --build
```

Accéder à l'application : `http://localhost` (port configurable via `APP_PORT` dans `.env`)

## Configuration Azure AD

Dans le portail Azure → App registrations → New registration :

1. **Redirect URI** : `http://localhost/api/auth/callback/azure-ad` (adapter selon votre URL)
2. **Permissions API** (Microsoft Graph, type Delegated) :
   - `User.ReadWrite.All`
   - `Group.ReadWrite.All`
   - `GroupMember.ReadWrite.All`
   - `Directory.ReadWrite.All`
   - `Organization.Read.All`
3. Accorder le consentement administrateur
4. Créer un **Client secret** et copier les valeurs dans `.env`

## Variables d'environnement

```env
AZURE_AD_CLIENT_ID=       # ID de l'application Azure AD
AZURE_AD_CLIENT_SECRET=   # Secret client Azure AD
AZURE_AD_TENANT_ID=       # ID du tenant Azure AD
NEXTAUTH_URL=             # URL publique de l'app (ex: http://localhost)
NEXTAUTH_SECRET=          # Clé secrète (openssl rand -base64 32)
POSTGRES_PASSWORD=        # Mot de passe PostgreSQL
APP_PORT=                 # Port exposé (défaut: 3001)
DATABASE_URL=             # URL PostgreSQL complète
```

## Développement local

```bash
npm install
docker compose up -d postgres   # BDD uniquement
npx prisma db push              # Appliquer le schéma (pas de migrations)
npm run dev                     # Serveur de développement sur :3000
```

## Architecture Docker

Trois services :

| Service    | Rôle                                          |
|------------|-----------------------------------------------|
| `postgres` | PostgreSQL 16, volume persistant              |
| `migrate`  | Lance `prisma db push` puis s'arrête (exit 0) |
| `app`      | Next.js 16 en mode standalone, port :3000     |

## Stack technique

Voir [docs/Architecture.md](docs/Architecture.md).

## Reprise de contexte

Voir [docs/Reprise.md](docs/Reprise.md).
