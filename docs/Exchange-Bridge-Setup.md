# Mise en place du pont Exchange Online — guide pas à pas

Procédure **reproductible** pour provisionner le canal Exchange app-only du sidecar `exo-bridge` :
certificat, app registration, permission, rôle, configuration et test.

À refaire notamment lors du **renouvellement du certificat** (validité 2 ans) ou d'un déploiement
sur un nouveau tenant.

- Vue d'ensemble & justification : [ADR-001-pont-exchange.md](ADR-001-pont-exchange.md)
- Service & variables d'environnement : [../exo-bridge/README.md](../exo-bridge/README.md)

> Droits requis pour réaliser les étapes 3 et 5 : **Global Administrator** (ou Privileged Role
> Admin + Application Administrator). Les étapes 1-2 ne nécessitent qu'un poste Windows.

---

## 1. Générer le certificat (poste Windows, PowerShell)

Certificat auto-signé : la clé privée (`.pfx`) sera montée dans le conteneur, la clé publique
(`.cer`) sera uploadée sur l'app registration.

```powershell
# Certificat valable 2 ans dans le magasin personnel
$cert = New-SelfSignedCertificate `
  -Subject "CN=OneRing-EXO-Bridge" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyExportPolicy Exportable -KeySpec Signature -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(2)

# Clé publique (à uploader dans Entra)
Export-Certificate -Cert $cert -FilePath "$HOME\Downloads\onering-exo.cer"

# Clé privée AVEC mot de passe (obligatoire — à mémoriser)
$pwd = Read-Host "Mot de passe du .pfx" -AsSecureString
Export-PfxCertificate -Cert $cert -FilePath "$HOME\Downloads\onering-exo.pfx" -Password $pwd

# Empreinte (à reporter dans l'app et pour le test)
$cert.Thumbprint
```

> ⚠️ Le `.pfx` **doit** avoir un mot de passe (le sidecar le requiert). Ne jamais committer le `.pfx`.

À noter : `Thumbprint`, et le mot de passe du `.pfx`.

## 2. Créer l'app registration

[entra.microsoft.com](https://entra.microsoft.com) → **Identité → Applications → Inscriptions
d'applications → Nouvelle inscription**.

- Nom : `OneRing — Exchange Bridge` (app **dédiée**, distincte du SSO, pour limiter le périmètre)
- Comptes pris en charge : *ce répertoire organisationnel uniquement*
- Pas de redirect URI (auth app-only, aucun flux interactif)

À noter depuis la page *Vue d'ensemble* : **Application (client) ID** et **Directory (tenant) ID**.

## 3. Uploader le certificat

App → **Certificats et secrets → Certificats → Charger un certificat** → `onering-exo.cer`.
Vérifier que l'empreinte affichée correspond à celle de l'étape 1.

## 4. Permission Exchange + consentement

App → **API autorisées → Ajouter une autorisation → API utilisées par mon organisation** →
**`Office 365 Exchange Online`** → **Autorisations d'application** → cocher **`Exchange.ManageAsApp`**
→ Ajouter → puis **« Accorder le consentement administrateur »**. La colonne *Statut* passe au vert.

## 5. Attribuer le rôle d'annuaire

La permission ne suffit pas : le service principal doit aussi porter un rôle d'annuaire Exchange.

Entra → **Rôles et administrateurs** → **Exchange Administrator** → **Ajouter des attributions** →
chercher le nom de l'app (`OneRing — Exchange Bridge`) → confirmer.

> Variante plus restrictive : *Exchange Recipient Administrator* (couvre DL + boîtes partagées
> sans toucher au transport). Les deux rôles sont acceptés par la garde applicative `isExchangeAdmin`.

## 6. Vérifier la chaîne (avant tout déploiement)

Depuis le poste Windows :

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # une seule fois

Connect-ExchangeOnline `
  -AppId "<APPLICATION_CLIENT_ID>" `
  -CertificateThumbprint "<THUMBPRINT>" `
  -Organization "<tenant>.onmicrosoft.com"

Get-DistributionGroup -ResultSize 5      # doit lister des DL → la chaîne fonctionne
Disconnect-ExchangeOnline -Confirm:$false
```

> La propagation du rôle peut prendre jusqu'à ~15 min. En cas d'erreur d'authentification, réessayer plus tard.

## 7. Configurer l'application

1. Copier la clé privée dans le conteneur (hors git) :
   ```text
   exo-bridge/secrets/onering-exo.pfx
   ```
2. Renseigner `.env` à la racine :
   ```bash
   EXO_APP_ID=<APPLICATION_CLIENT_ID>
   EXO_ORG=<tenant>.onmicrosoft.com
   EXO_CERT_PASSWORD=<mot de passe du .pfx>
   EXO_BRIDGE_SECRET=<secret aléatoire — openssl rand -base64 32>
   ```
   (`EXO_CERT_PATH` est fixé à `/certs/onering-exo.pfx` dans `docker-compose.yml`.)

## 8. Démarrer et tester le sidecar

```bash
docker compose up -d --build exo-bridge

# Le bridge n'a pas de port hôte → on teste depuis le réseau Docker interne
docker compose exec app node -e "fetch('http://exo-bridge:8080/health').then(r=>r.text()).then(console.log)"
docker compose exec app node -e "fetch('http://exo-bridge:8080/diag/dl?top=5',{headers:{'X-Bridge-Secret':process.env.EXO_BRIDGE_SECRET}}).then(r=>r.text()).then(console.log)"
```

`/diag/dl` doit lister des listes de distribution. ✅

---

## Renouvellement du certificat

Avant l'échéance (2 ans) :

1. Refaire l'**étape 1** (nouveau certificat — ou ré-exporter avec une nouvelle validité).
2. Refaire l'**étape 3** (uploader le nouveau `.cer` ; conserver l'ancien jusqu'à bascule).
3. Remplacer `exo-bridge/secrets/onering-exo.pfx` et mettre à jour `EXO_CERT_PASSWORD`.
4. `docker compose up -d --build exo-bridge`, puis vérifier `/diag/dl`.
5. Supprimer l'ancien certificat de l'app registration.
