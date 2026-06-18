# Déploiement derrière un nom de domaine (HTTPS interne)

L'application est servie sur un nom de domaine en **HTTPS** via un reverse proxy **Caddy**
(service `caddy` du `docker-compose.yml`). Contrainte clé : **Azure AD n'autorise les URI de
redirection en HTTP que pour `localhost`** — un domaine impose donc le HTTPS.

Cible documentée ici : **accès interne (LAN/VPN)** avec certificat de la **CA interne de Caddy**.

```text
Navigateur ──HTTPS──> Caddy (:443, tls internal) ──HTTP──> app:3000 (réseau Docker interne)
```

## 1. DNS

Créer un enregistrement **A** (ou CNAME) sur ton DNS interne pointant le domaine choisi vers
l'IP du serveur Docker. Exemple : `onering.consertotech.pro → 10.0.0.20`.

## 2. Variables d'environnement

Dans `.env` à la racine :

```bash
APP_DOMAIN=onering.consertotech.pro
NEXTAUTH_URL=https://onering.consertotech.pro
```

`APP_DOMAIN` est injecté dans le `Caddyfile` ; `NEXTAUTH_URL` doit correspondre **exactement**
(même schéma, même hôte), sinon les callbacks de connexion échouent.

## 3. Azure AD — URI de redirection

Dans l'app registration **SSO** (celle du `AZURE_AD_CLIENT_ID`) → **Authentification** →
**Ajouter un URI de redirection** (plateforme Web) :

```text
https://onering.consertotech.pro/api/auth/callback/azure-ad
```

On peut conserver l'URI `http://localhost:3000/...` en parallèle pour le dev local.

## 4. Pare-feu

Ouvrir le port **443** (et **80**, que Caddy utilise pour la redirection vers HTTPS) en entrée
sur le serveur, depuis le réseau interne uniquement.

## 5. Démarrage

```bash
docker compose up -d --build
docker compose logs -f caddy        # doit obtenir/générer le certificat sans erreur
```

`app` n'expose plus de port hôte : tout passe par Caddy.

## 6. Faire confiance à la CA interne de Caddy (postes clients)

Avec `tls internal`, Caddy signe le certificat avec sa **propre autorité**. Tant que cette
racine n'est pas installée sur les postes, le navigateur affiche un avertissement.

Extraire la racine puis la distribuer (GPO, MDM, ou installation manuelle dans
« Autorités de certification racines de confiance ») :

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

> Alternative sans distribution de CA : certificats **publiquement reconnus** via un challenge
> **DNS-01** (le serveur reste interne, seul le DNS est public). Nécessite une image Caddy avec
> le plugin du fournisseur DNS + un token API. À envisager si la distribution de la CA interne
> est trop lourde.

## 7. Vérification

- `https://onering.consertotech.pro` répond (cadenas valide une fois la CA installée).
- La connexion SSO redirige vers Microsoft puis revient sur le domaine sans erreur `redirect_uri`.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| `redirect_uri mismatch` à la connexion | URI Azure AD absent/incorrect (étape 3) ou `NEXTAUTH_URL` ≠ domaine |
| Boucle de connexion / cookies | `NEXTAUTH_URL` n'est pas en `https://` ou ne correspond pas au domaine |
| Avertissement certificat | CA interne de Caddy non installée sur le poste (étape 6) |
| 502 Bad Gateway (Caddy) | `app` pas démarré / pas sain — voir `docker compose logs app` |
| Caddy ne démarre pas | `APP_DOMAIN` vide dans `.env` |
