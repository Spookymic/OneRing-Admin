# Déploiement en production sur Proxmox VE

Procédure de mise en production de OneRing Admin sur une VM hébergée par un hyperviseur Proxmox VE.

Ce document couvre l'hébergement et l'exploitation. Il s'appuie sur deux documents existants :

- [Deploiement-domaine.md](Deploiement-domaine.md) — DNS, domaine, certificat HTTPS (Caddy) ;
- [Rotation-secrets.md](Rotation-secrets.md) — renouvellement des secrets.

Les fichiers prêts à l'emploi cités ici sont dans [deploy/](../deploy/).

---

## Vue d'ensemble

```text
Postes admins (LAN / VPN)
        │ HTTPS 443
        ▼
┌─────────────── VM Debian 12 (Proxmox) ───────────────┐
│  Docker Compose                                       │
│   caddy ──► app (Next.js :3000) ──► postgres          │
│                   │                                   │
│                   └──► exo-bridge (PowerShell :8080)  │
│   migrate : s'exécute au démarrage puis s'arrête      │
└───────────────────────────────────────────────────────┘
        │ HTTPS sortant
        ▼
Microsoft Entra ID / Graph / Exchange Online / SharePoint
```

Seul Caddy publie des ports (80/443). `app`, `postgres` et `exo-bridge` ne sont joignables que sur le réseau Docker interne.

**L'outil ne doit pas être exposé sur Internet** : il agit avec des droits d'administrateur sur tout le tenant Microsoft 365.

---

## 1. Créer la VM

Une **VM** est préférable à un conteneur LXC. Docker dans un LXC est possible (`nesting=1`, `keyctl=1`) mais fragile (AppArmor, overlayfs, mises à jour de Proxmox), et une VM se sauvegarde et se restaure d'un seul bloc.

| Paramètre | Valeur |
|---|---|
| OS | Debian 12 (netinst), sans environnement graphique |
| CPU | 4 vCPU, type `host` (minimum 2) |
| RAM | 8 Go (minimum 4 Go — le build Next.js consomme 2 à 3 Go) |
| Disque | 40 Go, VirtIO SCSI, stockage SSD, option *Discard* cochée |
| Réseau | VirtIO, pont du VLAN d'administration, IP fixe ou réservation DHCP |
| Options | *QEMU Guest Agent* activé, démarrage automatique activé |

## 2. Préparer le système

```bash
apt update && apt full-upgrade -y
apt install -y qemu-guest-agent unattended-upgrades chrony git ca-certificates curl ufw
systemctl enable --now qemu-guest-agent chrony
dpkg-reconfigure -plow unattended-upgrades
```

- **Heure** : `chrony` doit être synchronisé (`chronyc tracking`). Une horloge décalée fait refuser les jetons Azure et les codes TOTP du compte administrateur local.
- **SSH** : utilisateur nominatif avec clé, puis dans `/etc/ssh/sshd_config` : `PermitRootLogin no` et `PasswordAuthentication no`.
- **Pare-feu** (à adapter aux sous-réseaux) :

  ```bash
  ufw default deny incoming
  ufw allow from 10.0.10.0/24 to any port 22 proto tcp   # sous-reseau d'administration
  ufw allow from 10.0.0.0/16  to any port 443 proto tcp  # postes autorises
  ufw allow from 10.0.0.0/16  to any port 80  proto tcp  # redirection vers HTTPS
  ufw enable
  ```

  ⚠️ Docker contourne `ufw` pour les ports publiés. Le filtrage réellement fiable se fait au niveau du **pare-feu Proxmox** (Datacenter → VM → Firewall) ou du pare-feu réseau, avec les mêmes règles.

## 3. Installer Docker

Installer Docker Engine et le plugin compose depuis le **dépôt officiel Docker** (pas le paquet Debian `docker.io`) : <https://docs.docker.com/engine/install/debian/>.

Limiter ensuite la taille des journaux des conteneurs, sinon ils finissent par remplir le disque :

```bash
cp deploy/daemon.json /etc/docker/daemon.json   # apres le clonage (etape 4)
systemctl restart docker
```

## 4. Récupérer le code

```bash
git clone https://forgejo.si.consertotech.pro/INFRA/OneRing-Admin.git /opt/onering-admin
cd /opt/onering-admin
git checkout v1.34.1        # toujours deployer une version precise, jamais master
```

Pour l'accès au dépôt, utiliser un **jeton de déploiement en lecture seule** (forgejo → dépôt → Paramètres → Clés de déploiement), pas un compte personnel.

## 5. Secrets de production

Ne **jamais** reprendre le `.env` d'un poste de développement : l'audit de sécurité (finding E1) considère ces valeurs comme exposées.

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32   # a executer une fois par secret
```

| Variable | Valeur |
|---|---|
| `NEXTAUTH_SECRET`, `EXO_BRIDGE_SECRET`, `POSTGRES_PASSWORD`, `TOTP_ENCRYPTION_KEY` | Une valeur aléatoire distincte chacune |
| `APP_DOMAIN` | Nom DNS interne, ex. `onering.example.local` |
| `NEXTAUTH_URL` | `https://<APP_DOMAIN>` (strictement identique) |
| `AZURE_AD_*` | Inscription d'application de **production** (voir étape 6) |
| `EXO_APP_ID`, `EXO_ORG`, `EXO_CERT_PASSWORD` | Voir [Exchange-Bridge-Setup.md](Exchange-Bridge-Setup.md) |
| `SPO_ADMIN_URL` | URL d'administration SharePoint du tenant |

> `TOTP_ENCRYPTION_KEY` chiffre les secrets TOTP stockés en base. Si elle est perdue ou changée, les comptes administrateurs locaux doivent réenrôler leur TOTP.

**Certificat du pont Exchange** : le conteneur `exo-bridge` tourne avec l'uid **10001** et doit pouvoir lire le fichier.

```bash
cp onering-exo.pfx exo-bridge/secrets/onering-exo.pfx
chown 10001 exo-bridge/secrets/onering-exo.pfx
chmod 400 exo-bridge/secrets/onering-exo.pfx
```

**Ranger une copie de `.env` et du `.pfx` dans le coffre-fort de mots de passe.** Sans eux, une sauvegarde de base seule ne permet pas de remonter le service.

## 6. Configuration Microsoft Entra

1. Créer de préférence une **inscription d'application dédiée à la production**, avec son propre secret client (voir README, section *Configuration Azure AD*).
2. URI de redirection : `https://<APP_DOMAIN>/api/auth/callback/azure-ad`.
3. Accorder les permissions déléguées listées dans le README, puis le **consentement administrateur**.
4. Inscription Exchange (pont) : charger la clé publique du certificat et attribuer le rôle (voir [Exchange-Bridge-Setup.md](Exchange-Bridge-Setup.md)).
5. Noter les **dates d'expiration** du secret client et du certificat. L'écran *Secrets & certificats* de l'application aide à les suivre.
6. Recommandé : une stratégie d'**accès conditionnel** ciblant cette application (MFA, poste conforme ou emplacement de confiance).

## 7. DNS et HTTPS

Suivre [Deploiement-domaine.md](Deploiement-domaine.md) : enregistrement A interne vers l'IP de la VM, puis l'une des deux options de certificat.

| Option | Avantage | Contrainte |
|---|---|---|
| CA interne de Caddy (`tls internal`, configuration actuelle) | Aucune dépendance externe | Distribuer la racine de la CA aux postes (GPO) ; pas de HSTS |
| Certificat public par challenge DNS-01 | Reconnu partout, HSTS activable | Domaine public et accès API au fournisseur DNS |

La racine de la CA interne se récupère après le premier démarrage :

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./onering-root.crt
```

## 8. Premier démarrage

```bash
cd /opt/onering-admin
docker compose up -d --build
docker compose ps
```

Résultat attendu : `migrate` à l'état `Exited (0)`, et `postgres`, `app`, `exo-bridge`, `caddy` à l'état `Up`.

```bash
docker compose logs -f caddy app exo-bridge   # Ctrl+C pour quitter
```

### Recette

- [ ] `https://<APP_DOMAIN>` répond, sans avertissement de certificat sur un poste du domaine.
- [ ] La connexion SSO aboutit, sans erreur `redirect_uri` (AADSTS50011).
- [ ] *Administration* : le pont Exchange est au vert.
- [ ] *Administration* : le **compte administrateur local de secours** est créé avec TOTP, et la connexion avec ce compte est testée.
- [ ] *Boîtes partagées* : la liste se charge (l'index initial peut prendre une à deux minutes).
- [ ] *Rapports* et *Copilot* : les données s'affichent.
- [ ] *Audit* : une action de test apparaît dans le journal.
- [ ] La sauvegarde et une **restauration de test** sont faites (étape 9).

## 9. Sauvegardes

Deux niveaux complémentaires.

### Sauvegarde de la VM entière (Proxmox)

Datacenter → Backup → *Add* : sauvegarde quotidienne de la VM, mode *Snapshot*, compression ZSTD, vers un **Proxmox Backup Server** ou un stockage distinct de l'hyperviseur. Rétention suggérée : 7 quotidiennes, 4 hebdomadaires, 6 mensuelles.

### Sauvegarde logique de la base

La base contient le **journal d'audit**, les comptes administrateurs locaux et les imports Copilot Cowork. Elle est sauvegardée chaque nuit par [deploy/backup-db.sh](../deploy/backup-db.sh) (dump compressé, contrôle d'intégrité, rétention de 30 jours) :

```bash
chmod +x deploy/*.sh
cp deploy/onering-backup.cron /etc/cron.d/onering-backup
deploy/backup-db.sh               # premier essai manuel
```

Copier ensuite `/var/backups/onering` **hors de la VM** (partage réseau, PBS, rsync) : une sauvegarde stockée sur la machine sauvegardée ne protège pas contre la perte de cette machine.

### Restauration

```bash
deploy/restore-db.sh /var/backups/onering/onering-AAAA-MM-JJ_HHMM.sql.gz
```

Le script demande de taper `RESTAURER`, sauvegarde d'abord l'état actuel dans `/var/backups/onering/avant-restauration/`, arrête l'application pendant l'opération, puis la redémarre.

**Tester une restauration au moins une fois avant la mise en production**, idéalement sur un clone de la VM.

### Ce qu'il faut pouvoir restaurer

| Élément | Où | Sauvegarde |
|---|---|---|
| Base (audit, comptes locaux, Cowork) | volume `postgres_data` | `backup-db.sh` et sauvegarde VM |
| CA interne de Caddy et certificats | volume `caddy_data` | Sauvegarde VM (la perdre oblige à redistribuer une nouvelle racine) |
| `.env` | `/opt/onering-admin/.env` | Coffre-fort et sauvegarde VM |
| Certificat du pont | `exo-bridge/secrets/onering-exo.pfx` | Coffre-fort et sauvegarde VM |
| Code | dépôt Git | Tags forgejo, codeberg et github |

## 10. Supervision

Raccorder la VM à l'outil de supervision en place (Checkmk, Zabbix, Uptime Kuma…). L'outil importe peu ; ce qui compte, c'est d'être alerté des pannes silencieuses. À surveiller :

- la réponse HTTPS de `https://<APP_DOMAIN>` et la date d'expiration du certificat ;
- les conteneurs `caddy`, `app`, `postgres` et `exo-bridge` à l'état *running* (`migrate` est normalement arrêté) ;
- l'espace disque (`/var/lib/docker`, `/var/backups/onering`) ;
- la présence d'une sauvegarde de moins de 26 heures dans `/var/backups/onering` ;
- côté Azure, l'expiration du secret client et du certificat du pont (alerte à J-30).

Commandes utiles :

```bash
docker compose ps
docker compose logs --since 1h app
docker compose logs --since 1h exo-bridge
docker stats --no-stream
```

## 11. Mises à jour

```bash
cd /opt/onering-admin
deploy/backup-db.sh                       # 1. dump juste avant
# 2. snapshot de la VM dans Proxmox (VM → Snapshots → Take Snapshot)
git fetch --tags
git checkout vX.Y.Z                       # 3. nouvelle version
docker compose up -d --build              # 4. rebuild app + exo-bridge, relance migrate
docker compose ps                         # 5. verification, puis recette rapide (etape 8)
docker image prune -f                     # 6. nettoyage des anciennes images
```

Lire le `CHANGELOG.md` de la version avant de mettre à jour : il signale les nouvelles variables d'environnement ou permissions Graph à ajouter.

**Retour arrière** :

- sans changement de schéma : `git checkout <version precedente> && docker compose up -d --build` ;
- sinon : retour au snapshot Proxmox pris à l'étape 2.

> ⚠️ **À corriger avant la production.** Le conteneur `migrate` exécute `prisma db push --accept-data-loss` ([docker-entrypoint.sh](../docker-entrypoint.sh)). En production, une évolution du schéma peut alors **supprimer des colonnes ou des tables sans avertissement**, journal d'audit compris. Il faut passer à des migrations versionnées (`prisma migrate deploy`) avant la mise en service. D'ici là, toujours faire le dump et le snapshot avant une mise à jour.

## 12. Durcissement complémentaire

- VLAN dédié pour la VM ; flux sortants limités au HTTPS vers Microsoft 365 (`login.microsoftonline.com`, `graph.microsoft.com`, `outlook.office365.com`, `*.sharepoint.com`), au dépôt Git et aux registres Docker (Docker Hub, `mcr.microsoft.com`), et à la PowerShell Gallery au moment des builds.
- Accès SSH uniquement depuis un bastion ou le sous-réseau d'administration.
- Rotation des secrets selon [Rotation-secrets.md](Rotation-secrets.md), au minimum à chaque départ d'un administrateur.
- Suivre les points ouverts de [Audit-Securite.md](Audit-Securite.md).

---

## Check-list de mise en production

- [ ] VM créée (4 vCPU, 8 Go, 40 Go), agent invité, IP fixe, démarrage automatique
- [ ] Système à jour, mises à jour automatiques, NTP synchronisé, SSH durci
- [ ] Pare-feu Proxmox : 443/80 depuis le LAN ou le VPN, 22 depuis l'administration, rien depuis Internet
- [ ] Docker officiel installé, `daemon.json` en place
- [ ] Code cloné sur un tag, avec un jeton de déploiement en lecture seule
- [ ] `.env` neuf (secrets générés), `chmod 600`, copie dans le coffre-fort
- [ ] `.pfx` du pont en place (`chown 10001`, `chmod 400`), copie dans le coffre-fort
- [ ] Inscription Entra de production, URI de redirection, consentement administrateur, accès conditionnel
- [ ] DNS interne et certificat (racine distribuée par GPO, ou DNS-01)
- [ ] Recette de l'étape 8 validée
- [ ] Compte administrateur local de secours créé et testé
- [ ] Sauvegarde VM planifiée, dump quotidien, copie hors VM, **restauration testée**
- [ ] VM raccordée à la supervision (HTTPS, certificat, conteneurs, disque, âge de la dernière sauvegarde, expirations Azure)
- [ ] Migration vers `prisma migrate deploy` faite
