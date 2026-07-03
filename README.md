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

Accéder à l'application : `https://<APP_DOMAIN>` (servi par Caddy en HTTPS).
Mise en place du domaine et du certificat : voir [docs/Deploiement-domaine.md](docs/Deploiement-domaine.md).

## Configuration Azure AD

Dans le portail Azure → App registrations → New registration :

1. **Redirect URI** : `https://<APP_DOMAIN>/api/auth/callback/azure-ad` (HTTPS obligatoire hors `localhost`)
2. **Permissions API** (Microsoft Graph, type **Délégué**).

   Requises (demandées automatiquement à la connexion) :
   - `User.ReadWrite.All` — utilisateurs, réinitialisation MDP, activation/désactivation, licences
   - `Group.ReadWrite.All` — groupes (création, membres, owners)
   - `GroupMember.ReadWrite.All` — membres de groupe
   - `Directory.ReadWrite.All` — rôles d'annuaire et opérations annuaire
   - `Organization.Read.All` — abonnements / SKUs de licences
   - `MailboxSettings.ReadWrite` — réponses automatiques (absence)
   - `UserAuthenticationMethod.Read.All` — statut MFA / méthodes d'authentification par utilisateur

   Optionnelles (déjà déclarées dans le scope demandé au login ; il reste à accorder le consentement admin Azure pour activer la fonctionnalité — sans elles, la fonctionnalité se désactive proprement) :
   - `AuditLog.Read.All` — journal de connexion détaillé (onglet Connexions) + « créé par » (auteur d'un objet)
   - `Application.Read.All` — alertes d'expiration des secrets/certificats d'applications
   - `Reports.Read.All` — page **Stockage** (espace OneDrive / Exchange / SharePoint). Rapports avec ~1-2 j de latence. Pour afficher les noms réels plutôt que des identifiants masqués, désactiver l'anonymisation : centre d'admin Microsoft 365 → Paramètres → Rapports → décocher « Afficher les noms masqués ».
   - `Sites.Read.All` (**type Application**, pas Délégué) — page Stockage / SharePoint : résout les vrais noms et URLs des sites via `/sites/getAllSites` (réservé à l'app-only). Utilise le flux client-credentials de l'app registration (CLIENT_ID/SECRET). Best-effort : sans cette permission applicative consentie, le nom dérivé (URL ou groupe de propriétaires) est affiché à la place.

   > **Note** : les permissions déléguées ne sont actives que si elles figurent **à la fois** dans le consentement Azure **et** dans la chaîne `scope` demandée au login (`src/lib/auth.ts`). Toutes celles ci-dessus y sont déjà déclarées ; il suffit d'accorder le consentement admin dans Azure puis de se reconnecter (le jeton est régénéré au login).
   >
   > **Message de statut Teams** : Microsoft Graph ne fournit **pas** de permission déléguée permettant de définir la présence/le statut d'un *autre* utilisateur (`Presence.ReadWrite.All` n'existe pas ; `Presence.ReadWrite` ne couvre que le compte connecté). Cette fonctionnalité reste donc inopérante pour un tiers et n'est pas incluse dans les scopes demandés.

3. Accorder le consentement administrateur
4. Créer un **Client secret** et copier les valeurs dans `.env`

> **Pont Exchange (optionnel)** : les fonctionnalités listes de distribution et boîtes partagées passent par un service `exo-bridge` (PowerShell) en authentification **app-only** (certificat). Voir la documentation dédiée pour l'enregistrement d'application et la génération du certificat.

## Variables d'environnement

```env
AZURE_AD_CLIENT_ID=       # ID de l'application Azure AD
AZURE_AD_CLIENT_SECRET=   # Secret client Azure AD
AZURE_AD_TENANT_ID=       # ID du tenant Azure AD
APP_DOMAIN=               # Nom de domaine servi par Caddy (ex: onering.example.local)
NEXTAUTH_URL=             # URL HTTPS de l'app (https://<APP_DOMAIN>)
NEXTAUTH_SECRET=          # Clé secrète (openssl rand -base64 32)
POSTGRES_PASSWORD=        # Mot de passe PostgreSQL (choisir une valeur forte)
DATABASE_URL=             # URL PostgreSQL complète

# Pont Exchange (optionnel — listes de distribution & boîtes partagées)
EXO_BRIDGE_URL=           # URL interne du service exo-bridge (ex: http://exo-bridge:8080)
EXO_BRIDGE_SECRET=        # Secret partagé app <-> bridge (en-tête X-Bridge-Secret)
EXO_ORG=                  # Domaine tenant Exchange (ex: contoso.onmicrosoft.com)
EXO_APP_ID=               # App ID de l'enregistrement app-only Exchange
EXO_CERT_PASSWORD=        # Passphrase du certificat .pfx (choisir une valeur forte)
```

> Les secrets ci-dessus sont sensibles : ne jamais les committer (déjà couverts par `.gitignore`) et privilégier une passphrase/mot de passe fort pour `EXO_CERT_PASSWORD` et `POSTGRES_PASSWORD`.

## Développement local

```bash
npm install
docker compose up -d postgres   # BDD uniquement
npx prisma db push              # Appliquer le schéma (pas de migrations)
npm run dev                     # Serveur de développement sur :3000
```

## Architecture Docker

Services :

| Service      | Rôle                                                         |
|--------------|--------------------------------------------------------------|
| `caddy`      | Reverse-proxy HTTPS (TLS interne ou ACME), point d'entrée    |
| `app`        | Next.js 16 en mode standalone, port :3000                    |
| `exo-bridge` | Pont PowerShell/Pode pour Exchange Online (app-only, optionnel) |
| `migrate`    | Lance `prisma db push` puis s'arrête (exit 0)                |
| `postgres`   | PostgreSQL 16, volume persistant                             |

## Stack technique

Voir [docs/Architecture.md](docs/Architecture.md).

## Reprise de contexte

Voir [docs/Reprise.md](docs/Reprise.md).
