# Runbook — Rotation des secrets

> Référence : finding **E1** de [Audit-Securite.md](Audit-Securite.md). Les secrets réels ne doivent jamais rester en clair dans un working tree partagé ni être considérés comme fiables une fois exposés. Ce document décrit la rotation de chaque secret.

## Principe

Tous les secrets vivent dans `.env` (non committé, cf. `.gitignore`). Après toute exposition potentielle (copie, backup, partage d'écran, machine partagée), **traiter le secret comme compromis et le faire tourner**.

Générer une valeur forte :

```bash
openssl rand -base64 32
```

## Secrets et procédure de rotation

| Secret | Où le régénérer | Impact de la rotation |
|--------|-----------------|-----------------------|
| `AZURE_AD_CLIENT_SECRET` | Portail Azure → App registration → Certificates & secrets → New client secret (puis supprimer l'ancien) | Aucune déconnexion (le secret sert à l'échange de jeton côté serveur) ; mettre à jour `.env` + redémarrer `app` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | **Déconnecte toutes les sessions** (invalide les JWT en cours) |
| `EXO_BRIDGE_SECRET` | `openssl rand -base64 32` | Mettre à jour **des deux côtés** (`app` et `exo-bridge`) puis redémarrer les deux |
| `EXO_CERT_PASSWORD` + `.pfx` | Régénérer le certificat app-only Exchange (voir `exo-bridge/README.md`), redéposer `exo-bridge/secrets/onering-exo.pfx`, choisir une passphrase forte | Nécessite aussi de charger le nouveau certificat public dans l'app registration Exchange |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` | ⚠️ Sur une base **déjà initialisée**, changer la variable ne change pas le mot de passe réel du rôle. Il faut soit `ALTER USER m365admin WITH PASSWORD '…'` dans Postgres, soit recréer le volume. Mettre à jour `POSTGRES_PASSWORD` **et** `DATABASE_URL` |

## Procédure générale

1. Générer la nouvelle valeur.
2. Mettre à jour `.env` (et `DATABASE_URL` si Postgres).
3. Pour les secrets à double extrémité (`EXO_BRIDGE_SECRET`) : mettre à jour les deux services.
4. Redémarrer les services concernés :
   ```bash
   docker compose up -d --force-recreate app exo-bridge
   ```
5. Vérifier la connexion SSO et la santé du pont Exchange (onglet Administration).
6. Révoquer/supprimer l'ancienne valeur côté fournisseur (Azure client secret notamment).

## Bonnes pratiques

- Ne jamais committer `.env` (déjà couvert par `.gitignore` — vérifié).
- Utiliser une valeur **forte et unique** pour `POSTGRES_PASSWORD` et `EXO_CERT_PASSWORD` (jamais `changeme`/mot du dictionnaire — cf. findings M8/M9).
- En production, envisager un coffre à secrets (Docker secrets, Vault, variables d'environnement injectées par l'orchestrateur) plutôt qu'un fichier `.env` sur disque.
