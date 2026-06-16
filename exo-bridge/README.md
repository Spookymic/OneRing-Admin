# exo-bridge — Pont Exchange Online (sidecar)

Service PowerShell qui expose une **API REST interne** pour les opérations Exchange Online
non couvertes par Microsoft Graph (listes de distribution, boîtes partagées…).
Consommé **uniquement** par l'app Next.js sur le réseau Docker interne — **jamais exposé publiquement**.

Conception : [docs/ADR-001-pont-exchange.md](../docs/ADR-001-pont-exchange.md).

## Prérequis (déjà provisionnés côté tenant)

- App registration avec permission applicative `Exchange.ManageAsApp` + admin consent
- Service principal membre du rôle **Exchange Administrator**
- Certificat : clé publique uploadée sur l'app, clé privée `.pfx` disponible

## Installation du certificat

Déposer le `.pfx` (clé privée) ici — **hors git**, monté en lecture seule dans le conteneur :

```text
exo-bridge/secrets/onering-exo.pfx
```

Le dossier `secrets/` est ignoré par git (sauf `.gitkeep`).

## Variables d'environnement

| Variable | Exemple | Rôle |
| --- | --- | --- |
| `EXO_APP_ID` | `00000000-…` | Application (client) ID de l'app registration |
| `EXO_ORG` | `contoso.onmicrosoft.com` | Tenant (paramètre `-Organization`) |
| `EXO_CERT_PATH` | `/certs/onering-exo.pfx` | Chemin du `.pfx` dans le conteneur |
| `EXO_CERT_PASSWORD` | `…` | Mot de passe du `.pfx` |
| `EXO_BRIDGE_SECRET` | `…` | Secret partagé app ↔ bridge (header `X-Bridge-Secret`) |
| `BRIDGE_PORT` | `8080` | Port d'écoute interne (défaut 8080) |

Renseignées via `.env` à la racine et injectées par `docker-compose.yml`.

## Endpoints (étape 1 — socle)

| Méthode | Chemin | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | non | Sonde légère : `{ status, org, exoConnected }`. N'ouvre pas de connexion. |
| GET | `/diag/dl?top=5` | `X-Bridge-Secret` | Liste N listes de distribution — valide la chaîne app-only de bout en bout. |

## Démarrer et tester

```bash
docker compose up -d --build exo-bridge
docker compose logs -f exo-bridge          # doit démarrer sans erreur de variable/cert

# Le bridge n'a pas de port hôte : on teste depuis l'intérieur du réseau Docker.
# Le conteneur app (node:20-alpine) n'a pas curl → on utilise fetch() de Node.
docker compose exec app node -e "fetch('http://exo-bridge:8080/health').then(r=>r.text()).then(console.log)"
docker compose exec app node -e "fetch('http://exo-bridge:8080/diag/dl?top=5',{headers:{'X-Bridge-Secret':process.env.EXO_BRIDGE_SECRET}}).then(r=>r.text()).then(console.log)"
```

`/diag/dl` doit renvoyer la liste des DL → la chaîne fonctionne.

## Note technique — connexion par runspace

Pode traite les requêtes dans un pool de runspaces. Chaque runspace ouvre sa propre session
EXO **à la première requête** (`Connect-ExchangeOnline` paresseux, puis réutilisé via le cache de
jetons du module). À valider en étape 1 : un second appel à `/diag/dl` doit être nettement plus
rapide que le premier (connexion déjà établie). Si la connexion ne « tient » pas entre requêtes,
réduire `-Threads` à `1` dans `server.ps1`.
