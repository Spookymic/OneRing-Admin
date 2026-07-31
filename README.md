# M365 Administrator

Outil d'administration centralisé pour Microsoft 365, conçu pour remplacer les consoles Entra, Exchange et Admin Center par une interface unique, rapide et fiable.

## Fonctionnalités

### Tableau de bord

- KPIs tenant (utilisateurs, groupes, licences), répartition par type de compte, actifs / désactivés
- Abonnements Microsoft 365 avec jauge de consommation, audit récent
- **Détection d'anomalies** : comptes désactivés licenciés, invités licenciés, boîtes partagées/ressources licenciées, désactivés/ressources encore membres de groupes, **groupes à propriétaire désactivé**, groupes sans propriétaire, groupes vides, licences en conflit
- **Utilisateurs & invités inactifs** (nécessite Entra Premium), pages dédiées
- Export CSV des anomalies, export PDF du tableau de bord

### Utilisateurs

- Liste de tous les types de comptes, détection automatique du type, filtres (type, statut, département), tri, colonnes persistées, pagination
- Panneau latéral : groupes, licences, **connexions** (journal + export CSV), **rôles Azure AD**, **absence** (réponse automatique + statut Teams), **statut MFA / méthodes d'authentification**
- Réinitialisation de mot de passe, activation / désactivation, **offboarding**, actions groupées

### Groupes & arborescence

- Liste par type (Microsoft 365, distribution, sécurité), création, gestion membres/owners
- **Arborescence** des groupes (imbrication) avec expansion à la demande

### Boîtes partagées

- Liste, création et gestion des délégations (via le pont Exchange)
- **Délégations orphelines** : détection des permissions détenues par un compte supprimé (SID non résolu) — badge « Compte supprimé » dans le panneau (nom retrouvé via la corbeille Azure) + **rapport global** avec nettoyage en un clic

### Accès conditionnel & connexions à risque

- **Stratégies d'accès conditionnel** : liste triable (nom, état, utilisateurs/groupes et applications ciblés — noms résolus, contrôles d'octroi, dernière modification), avec détail dépliable par stratégie (plateformes, types de client, emplacements, niveaux de risque, contrôles de session)
- **Connexions à risque** (Identity Protection) : détections de risque (niveau, type, motif détaillé, IP, localisation, date), nécessite une licence **Microsoft Entra ID P2** ; la bannière d'indisponibilité indique si une licence incluant P2 est déjà présente sur le tenant

### Journaux de connexion

- Analyse des connexions Entra ID du tenant sur 24h ou 7 jours : tuiles de synthèse (total, % succès, % MFA, % authentification legacy), timeline succès/échec, top applications/pays/IP/motifs d'échec, tableau détaillé des 100 événements les plus récents (export Excel)
- Aucune permission supplémentaire (`AuditLog.Read.All`, déjà optionnelle) ; analyse plafonnée à 2000 événements par souci de performance (Graph ne permet pas d'agréger côté serveur), signalé explicitement si atteint

### Sites SharePoint

- Écran dédié : tableau triable des sites (volumes, fichiers, activité, pages vues), recherche
- **Info-bulle de paramétrage par site** (via PnP app-only) : partage externe, verrou, étiquette de confidentialité, quota configuré, modèle, hub, connexion à un Groupe M365, accès conditionnel, scripts personnalisés

### Comptes supprimés

- Écran dédié listant la **corbeille Azure AD** (comptes supprimés < 30 j avant purge) : nom, UPN, **SID**, date de suppression, jours restants — utile pour corréler avec les délégations orphelines

### Postes de travail

- Vue **unifiée** des machines corrélées à travers **Entra ID**, **Intune** et **Autopilot** (dédoublonnage par identifiant d'appareil Azure AD puis numéro de série) : Machine, OS, Propriétaire, Présence par source, dernière activité, conformité — recherche, tri par colonne, export Excel
- **« Supprimer partout »** (1 clic + confirmation) retire la machine de **tous les référentiels** où elle existe, sans changer de console — opération **irréversible** et **journalisée** (`DEVICE_DELETE`), avec résultat par source. Ne touche pas l'AD on-premise (postes hybrides — hors portée Graph)
- **Badge « Propriétaire désactivé »** (croisement avec `accountEnabled`) et **surbrillance des noms en doublon** pour repérer machines orphelines et homonymes

### Licences

- Assignation / retrait par SKU, noms conviviaux, vue par utilisateur, ancienneté du compte

### Stockage

- Espace **OneDrive** et **Exchange** (utilisé / quota — quota Exchange réel via le pont) et **SharePoint** (part du total consommé, type de site, noms résolus via `getAllSites`)

### Sécurité & administration

- **Secrets & certificats** d'applications proches de l'expiration
- **Administration** : paramètres d'interface (masquer des actions sensibles), mots-clés de détection de type, configuration SSO, **comptes administrateur locaux (accès de secours) avec 2FA TOTP**, santé du pont Exchange, export/import des paramètres
- **Historique** d'audit complet (Qui/Quand/Quoi/Cible), rétention configurable, rollback, export CSV

### Exports Excel

- **Exports `.xlsx`** sur tous les écrans en liste (Utilisateurs, Groupes, Licences, Boîtes partagées, Stockage, Sites SharePoint, Accès conditionnel, Journaux de connexion, Comptes supprimés, Délégations orphelines, Secrets & certificats, inactifs, Historique) — colonnes détaillées, respectent les filtres en cours
- **Tableau de bord** : export global multi-onglets (« Tout exporter ») + un export par cadre

### Confort & accessibilité

- Mode clair / sombre + couleurs d'accent, 6 modes d'accessibilité, interface responsive, déconnexion automatique après inactivité

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
   - `Policy.Read.All` — page Accès conditionnel : liste des stratégies. Sans elle, l'écran fonctionne mais affiche une bannière « indisponible » sur cette section.
   - `IdentityRiskEvent.Read.All` — page Accès conditionnel : connexions à risque (Identity Protection). Nécessite en plus une licence **Microsoft Entra ID P2** sur le tenant ; sans l'une ou l'autre, la section se désactive proprement.
   - `Device.ReadWrite.All` — page Postes de travail : lecture et suppression des appareils **Entra ID**. Sans elle, la source Entra apparaît « ✗ » et est ignorée.
   - `DeviceManagementManagedDevices.ReadWrite.All` — page Postes de travail : lecture et suppression des appareils **Intune** (MDM). Source ignorée si absente.
   - `DeviceManagementServiceConfig.ReadWrite.All` — page Postes de travail : lecture et suppression des inscriptions **Autopilot**. Source ignorée si absente.

   > **Note** : les permissions **déléguées** ne sont actives que si elles figurent **à la fois** dans le consentement Azure **et** dans la chaîne `scope` demandée au login (`src/lib/auth.ts`) — toutes celles listées ci-dessus (requises + optionnelles déléguées) y sont déjà déclarées ; il suffit d'accorder le consentement admin puis de se reconnecter (jeton régénéré au login). `Sites.Read.All` fait exception : c'est une permission **Application** (voir ci-dessous), obtenue en app-only côté serveur, sans rapport avec le scope de login.
   >
   > **Message de statut Teams** : Microsoft Graph ne fournit **pas** de permission déléguée permettant de définir la présence/le statut d'un *autre* utilisateur (`Presence.ReadWrite.All` n'existe pas ; `Presence.ReadWrite` ne couvre que le compte connecté). Cette fonctionnalité reste donc inopérante pour un tiers et n'est pas incluse dans les scopes demandés.

3. Accorder le consentement administrateur
4. Créer un **Client secret** et copier les valeurs dans `.env`

> **Pont Exchange (optionnel)** : les fonctionnalités listes de distribution et boîtes partagées passent par un service `exo-bridge` (PowerShell) en authentification **app-only** (certificat). Voir la documentation dédiée pour l'enregistrement d'application et la génération du certificat.
>
> **Paramètres de sites SharePoint (optionnel)** : l'info-bulle de paramétrage par site (page Sites SharePoint) utilise PnP PowerShell en app-only (même certificat) et nécessite la permission **`Sites.FullControl.All` de type Application sous la ressource « SharePoint »** (⚠️ pas « Microsoft Graph »), avec consentement admin. Sans elle, l'écran fonctionne mais sans la colonne Paramètres. URL admin optionnelle via `SPO_ADMIN_URL` (déduite de `EXO_ORG` sinon).

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
