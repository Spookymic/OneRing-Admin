# exo-bridge — Pont Exchange Online (sidecar)

Service PowerShell qui expose une **API REST interne** pour les opérations Exchange Online
non couvertes par Microsoft Graph (listes de distribution, boîtes partagées…).
Consommé **uniquement** par l'app Next.js sur le réseau Docker interne — **jamais exposé publiquement**.

Conception : [docs/ADR-001-pont-exchange.md](../docs/ADR-001-pont-exchange.md).

## Prérequis (côté tenant)

- App registration avec permission applicative `Exchange.ManageAsApp` + admin consent
- Service principal membre du rôle **Exchange Administrator**
- Certificat : clé publique uploadée sur l'app, clé privée `.pfx` disponible

➡️ Procédure pas à pas (création certificat, app, rôle, test) : [docs/Exchange-Bridge-Setup.md](../docs/Exchange-Bridge-Setup.md)

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

## Endpoints

Toutes les routes (sauf `/health`) exigent l'en-tête `X-Bridge-Secret`.
Convention : réponse HTTP 200 + `{ ok, error? }` (évite la page d'erreur HTML de Pode).

| Méthode | Chemin | Description |
| --- | --- | --- |
| GET | `/health` | Sonde légère : `{ status, org, exoConnected }`. N'ouvre pas de connexion. *(sans auth)* |
| GET | `/diag/dl?top=5` | Diagnostic : liste N listes de distribution (chaîne app-only de bout en bout). |
| POST | `/dl/members` | `{ groupSmtp, member, action }` — ajout/retrait d'un membre de DL. |
| GET | `/dl/owners?group=<smtp>` | Propriétaires (`ManagedBy`) d'une DL. |
| POST | `/dl/owners` | `{ groupSmtp, member, action }` — ajout/retrait d'un propriétaire de DL. |
| POST | `/dl` | `{ displayName, alias }` — création d'une liste de distribution. |
| GET | `/mailbox/shared` | Liste des boîtes aux lettres partagées. |
| POST | `/mailbox/shared` | `{ displayName, alias }` — création d'une boîte partagée. |
| GET | `/mailbox/permissions?mailbox=<smtp>` | Délégations : `{ fullAccess, sendAs, sendOnBehalf }`. |
| POST | `/mailbox/permissions` | `{ mailbox, member, type, action }` — ajout/retrait d'une délégation. |

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

## Note technique — `-Threads 1` (un seul runspace)

Pode est lancé avec `-Threads 1` : un unique runspace traite toutes les requêtes. C'est
**nécessaire** avec EXO v3 — l'état de connexion (`Get-ConnectionInformation`) est global au
process, mais les cmdlets proxy (`Add/Remove-DistributionGroupMember`, etc.) ne sont importées
que dans le runspace ayant appelé `Connect-ExchangeOnline`. Avec plusieurs runspaces, une requête
pouvait tomber sur un runspace « connecté » mais dépourvu des cmdlets → erreur
*« The term '…' is not recognized »* au premier appel, puis succès au second (autre runspace).

La connexion est ouverte paresseusement à la première requête puis réutilisée. La concurrence
n'est pas un enjeu pour ce bridge d'administration interne.
