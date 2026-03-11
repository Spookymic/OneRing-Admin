# DOCUMENT DE CADRAGE

## Projet : Microsoft 365 Administrator

### 1. CONTEXTE ET VISION

**Problème identifié :**
Les différentes consoles de gestions des utilisateurs, des groupes, des listes de distribution, des boites partagées ne sont pas pratiques et intuitives et ont une tendance régulière à ramer et être indisponibles.

**Vision :**
Avoir un outil d'administration de Microsoft 365 permettant de se passer des différentes consoles Entra, Exchange, Admin,...

**Persona cible :**
Administrateur Microsoft 365

### 2. OBJECTIFS MESURABLES

| Objectif                    | Métrique      | Cible         | Échéance   |
| --------------------------- | ------------- | ------------- | ---------- |
| Centralisation des consoles | 1 console     | 1 console     | 31/03/2026 |
| Disponibilté                | Disponibilité | Disponibilité | 31/03/2026 |

### 3. PÉRIMÈTRE FONCTIONNEL

**MVP (Must Have) :**

- Liste/Administration des comptes utilisateurs (Reinit de Mot de passe,...)
- Liste/Ajout/Suppression/Administration des groupes 365, Listes de distributions, Groupes de securité à extension de messagerie, boites aux lettres partagées
- Liste/Ajout/Suppression d'utilisateurs des groupes cités précédemment
- Liste/Ajout/Suppression des licences des utilisateurs
- Connexion SSO Microsoft
- Le compte qui se connecte doit avoir des droits d'admin sur le tenant 365
- Ne te base pas sur une application mais sur les droits du compte
- Inclut des vérifications et validations avant modification
- Possibilité de faire un reverse sur les modifications
- Historisation des modifications (Qui, Quand, Quoi)

**Hors périmètre :**

- Création/Suppression des comptes utilisateurs

### 4. RISQUES IDENTIFIÉS

| Risque                            | Probabilité | Impact | Mitigation                                    |
| --------------------------------- | ----------- | ------ | --------------------------------------------- |
| Accès admin à un compte non admin | Basse       | Fort   | Vérification des droits du compte utilisateur |
