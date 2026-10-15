# ADR-001 — Pont Exchange Online PowerShell

> **Statut :** Proposé (cadrage, non implémenté) — 2026-06-16
> **Décision d'ampleur :** périmètre complet à terme, mais **livraison par étapes (DL en premier)**
> **Cible d'hébergement :** sidecar Docker on-premise, aux côtés de `app` et `postgres`

## 1. Contexte et problème

Le CADRAGE demande la gestion des **listes de distribution**, des **groupes de sécurité à
extension de messagerie** et des **boîtes aux lettres partagées** (création, membres, délégation).

Toute l'application repose aujourd'hui sur **Microsoft Graph en délégué**. Or Graph ne couvre
pas ce périmètre (état à jour de janvier 2026, v1.0 **et** beta) :

| Fonction (CADRAGE) | Graph API | État actuel dans l'app |
| --- | --- | --- |
| Membres des listes de distribution (ajout/retrait) | ❌ non supporté | bannière « à faire dans Exchange Admin Center » — [group-members-sheet.tsx:139](../src/components/groups/group-members-sheet.tsx#L139) |
| Propriétaires de DL (`managedBy`) | ❌ non exposé en lecture/écriture | notice « non exposé par Graph » — [group-members-sheet.tsx:163](../src/components/groups/group-members-sheet.tsx#L163) |
| Membres des groupes de sécurité à extension de messagerie | ❌ non supporté | erreur `exchange_managed` |
| Création de liste de distribution | ⚠️ crée un groupe mail-enabled mais **non géré comme une vraie DL** | non fiable |
| Boîtes partagées : création | ❌ non supporté | heuristique de détection seulement ([account-types.ts](../src/lib/account-types.ts)) |
| Boîtes partagées : délégation (Full Access, Send As, Send on Behalf) | ❌ non supporté | absent |

Ces opérations n'ont **pas d'équivalent Graph** : Microsoft les réserve à **Exchange Online
PowerShell**. Ce n'est donc pas contournable côté Graph ; il faut un second canal.

## 2. Options envisagées

| Option | Verdict |
| --- | --- |
| **A. Attendre une couverture Graph** | ❌ Aucune roadmap publique ne couvre DL/boîtes partagées. Bloque indéfiniment le périmètre CADRAGE. |
| **B. Rediriger l'admin vers Exchange Admin Center** (statu quo) | ⚠️ Solution actuelle. Contredit la vision « se passer des consoles ». Acceptable comme repli, pas comme cible. |
| **C. Sidecar Exchange Online PowerShell (app-only certificat)** | ✅ **Retenu.** Seule voie qui débloque réellement le périmètre, automatisable et non interactive. |

## 3. Décision

Ajouter un **service sidecar** dédié à Exchange Online, exposant une **API REST interne**
consommée uniquement par l'application Next.js. Le sidecar exécute les cmdlets EXO via
**authentification application (app-only) par certificat**.

### 3.1 Choix techniques

| Aspect | Choix | Justification |
| --- | --- | --- |
| Runtime | **PowerShell 7 (Linux)** — image `mcr.microsoft.com/powershell:lts` | `ExchangeOnlineManagement` v3 supporte pwsh 7 sous Linux → pas de conteneur Windows, s'intègre au compose actuel |
| Module EXO | `ExchangeOnlineManagement` ≥ 3.x | Cmdlets REST-backed, compatibles app-only cross-platform |
| Exposition HTTP | Framework **Pode** (ou wrapper minimal pwsh) | Serveur HTTP natif PowerShell, pas de runtime supplémentaire |
| Auth EXO | **App-only** : `Connect-ExchangeOnline -AppId -Certificate -Organization` | Non interactif ; pas de mot de passe stocké |
| Auth app → sidecar | **Secret partagé** (header) + réseau Docker interne **non publié** | Le sidecar est privilégié, il ne doit jamais être joignable de l'extérieur |
| Session EXO | Connexion mise en cache côté sidecar, reconnexion paresseuse | Évite le coût de `Connect-ExchangeOnline` à chaque appel |

### 3.2 Schéma d'infrastructure cible

```text
┌──────────────────────────────────────────────────────────────────┐
│                          docker-compose                            │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ postgres │  │ migrate  │  │      app      │  │ exo-bridge   │ │
│  │  :5432   │  │ (exit 0) │  │  Next.js :3000│→ │ pwsh + Pode  │ │
│  └──────────┘  └──────────┘  └───────────────┘  │  :8080       │ │
│       ▲                              │           └──────┬───────┘ │
│       └──── audit_logs ──────────────┘                  │         │
│                                                          │ app-only│
│  Réseau interne uniquement — exo-bridge NON publié       ▼ cert    │
│  Volume : exo_cert (lecture seule, clé privée)    Exchange Online  │
└──────────────────────────────────────────────────────────────────┘
```

Seul `app` reste publié (`APP_PORT`). `exo-bridge` n'expose aucun port hôte : il n'est
accessible que par `app` via le réseau Docker interne.

### 3.3 Flux d'un appel (ex. ajout d'un membre à une DL)

```text
UI → API Route Next.js (Zod + getServerSession)
        │ 1. Re-vérifie le rôle Exchange Admin du compte connecté (voir §4)
        │ 2. Appelle le sidecar : POST http://exo-bridge:8080/dl/members
        │    header X-Bridge-Secret, body { group, member }
        ▼
   exo-bridge (pwsh)
        │ 3. Connect-ExchangeOnline (app-only cert, depuis cache)
        │ 4. Add-DistributionGroupMember -Identity <group> -Member <member>
        ▼
   Réponse → API Route
        │ 5. logAudit(DL_MEMBER_ADD, before/after)  → PostgreSQL
        ▼
   UI rafraîchie (TanStack Query)
```

## 4. Conséquences sur la sécurité

> ⚠️ Point critique. L'auth EXO est **app-only** : le sidecar agit avec les droits de
> l'application (Exchange Administrator), **pas** ceux de l'utilisateur connecté. La règle
> CLAUDE.md « les droits sont ceux du compte connecté » ne s'applique donc plus
> automatiquement à ce canal.

Mesures obligatoires :

1. **Re-vérification des droits dans chaque API route Exchange** — avant tout appel au sidecar,
   confirmer que le compte connecté possède un rôle Exchange pertinent (Exchange Admin / Global
   Admin) via la session/Graph. Sinon `403`.
2. **Sidecar non exposé** — aucun port publié, joignable seulement sur le réseau Docker interne.
3. **Secret partagé app ↔ bridge** (`EXO_BRIDGE_SECRET`) en header sur chaque requête ; rejet sinon.
4. **Certificat en volume lecture seule**, hors image et hors dépôt git. Rotation documentée.
5. **Audit systématique** — chaque mutation passe par `logAudit()`, comme les mutations Graph.
6. **Validation Zod** côté API route avant transmission au sidecar (pas de cmdlet injection :
   paramètres passés en arguments nommés, jamais concaténés dans une chaîne de commande).

## 5. Prérequis à provisionner (côté tenant — action client)

> Procédure détaillée pas à pas (commandes + portail) : [Exchange-Bridge-Setup.md](Exchange-Bridge-Setup.md).

À faire **avant** toute implémentation :

1. **App registration** dédiée (ou réutiliser l'existante) avec permission applicative
   **Office 365 Exchange Online → `Exchange.ManageAsApp`** + **admin consent**.
2. Attribuer au service principal le rôle d'annuaire **Exchange Administrator**
   (ou *Exchange Recipient Administrator* si on veut restreindre).
3. **Certificat** (auto-signé PKI interne acceptable) : clé publique uploadée sur l'app
   registration, clé privée (`.pfx`) montée dans le sidecar via volume.
4. Récupérer **AppId**, **thumbprint** et **organization** (`tenant.onmicrosoft.com`).

## 6. Périmètre fonctionnel cible (cmdlets exposées)

| Domaine | Cmdlets EXO | Action d'audit à créer |
| --- | --- | --- |
| DL — membres | `Get/Add/Remove-DistributionGroupMember` | `DL_MEMBER_ADD` / `DL_MEMBER_REMOVE` |
| DL — propriétaires | `Set-DistributionGroup -ManagedBy` | `DL_OWNER_SET` |
| DL / groupe mail-enabled — création | `New-DistributionGroup [-Type Security]` | `DL_CREATE` |
| Boîte partagée — création | `New-Mailbox -Shared`, `Set-Mailbox` | `SHARED_MAILBOX_CREATE` |
| Boîte partagée — délégation | `Add-MailboxPermission` (FullAccess), `Add-RecipientPermission` (SendAs), `Set-Mailbox -GrantSendOnBehalfTo` | `MAILBOX_PERMISSION_ADD` / `_REMOVE` |
| Lecture | `Get-Mailbox`, `Get-Recipient`, `Get-DistributionGroup` | — |
| Lecture — redirections mail | `Get-Mailbox` (`ForwardingAddress`, `ForwardingSmtpAddress`), `Get-InboxRule`, `Get-TransportRule` | — |

## 7. Plan de livraison par étapes

| Étape | Contenu | Sortie |
| --- | --- | --- |
| **0. Prérequis** | App reg + cert + rôle (§5) | Tenant prêt |
| **1. Socle sidecar** ✅ | Image pwsh + Pode, `Connect-ExchangeOnline` app-only, endpoint `GET /health` | Sidecar qui se connecte à EXO |
| **2. DL membres** ✅ | Endpoints membres DL + intégration dans `group-members-sheet`, retrait de la bannière, audit | DL gérables depuis l'app |
| **3. DL owners + création** ✅ | `managedBy` (lecture+écriture) + `New-DistributionGroup` | DL complètes |
| **4. Boîtes partagées** ✅ | Création + délégation Full Access / Send As / Send on Behalf | Périmètre CADRAGE complet |

## 8. Risques et points ouverts

- **Latence** : `Connect-ExchangeOnline` + cmdlets coûtent quelques secondes → cache de session
  côté sidecar, timeouts généreux côté API route.
- **Provisioning différé** : une boîte partagée nouvellement créée peut mettre du temps à être
  visible/délégable → prévoir un message UI « en cours de provisionnement ».
- **Throttling Exchange** : prévoir gestion d'erreur lisible (rejoint l'action « Gestion erreurs
  Graph » de [Reprise.md](Reprise.md)).
- **Limites du module EXO sous Linux** : valider en étape 1 que toutes les cmdlets ciblées sont
  bien REST-backed (certaines anciennes cmdlets RPS ne fonctionnent pas cross-platform).
- **Rotation du certificat** : à documenter (échéance, procédure de renouvellement).
- **Rollback** : `DL_MEMBER_*` et `MAILBOX_PERMISSION_*` sont réversibles (cmdlet inverse) → à
  inclure dans le futur chantier Rollback UI ; `SHARED_MAILBOX_CREATE` non réversible.

## 9. Décision attendue pour passer à l'implémentation

Ce document cadre l'approche. Avant de coder, valider : (a) le provisionnement des prérequis §5
côté tenant, (b) le démarrage par l'étape 2 (DL membres).
