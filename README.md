# M365 Administrator

Outil d'administration centralisé pour Microsoft 365, conçu pour remplacer les consoles Entra, Exchange et Admin Center par une interface unique, rapide et fiable.

## Fonctionnalités

- **Utilisateurs** — Liste, recherche, réinitialisation de mot de passe
- **Groupes** — Liste par type : Microsoft 365, distribution, sécurité, boîte partagée
- **Membres** — Ajout et suppression de membres dans les groupes
- **Licences** — Assignation et retrait de licences par SKU
- **Historique** — Audit log complet (Qui, Quand, Quoi)

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

# 2. Lancer la stack
docker compose up -d

# 3. Appliquer le schéma base de données (premier démarrage)
docker compose exec app npx prisma migrate deploy
```

Accéder à l'application : http://localhost:3000

## Configuration Azure AD

Dans le portail Azure → App registrations → New registration :

1. **Redirect URI** : `http://localhost:3000/api/auth/callback/azure-ad`
2. **Permissions API** (Microsoft Graph, type Application) :
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
NEXTAUTH_URL=             # URL publique de l'app (http://localhost:3000 en local)
NEXTAUTH_SECRET=          # Clé secrète (openssl rand -base64 32)
POSTGRES_PASSWORD=        # Mot de passe PostgreSQL
```

## Développement local

```bash
npm install
docker compose up -d postgres   # BDD uniquement
npx prisma migrate dev          # Migrations
npm run dev                     # Serveur de développement
```

## Stack technique

Voir [docs/Architecture.md](docs/Architecture.md).

## Reprise de contexte

Voir [docs/Reprise.md](docs/Reprise.md).
