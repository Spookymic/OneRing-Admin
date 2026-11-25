#!/bin/sh
# OneRing Admin — restauration d'une sauvegarde produite par deploy/backup-db.sh.
# ATTENTION : ECRASE le contenu actuel de la base (journal d'audit compris).
#
# Usage : deploy/restore-db.sh /var/backups/onering/onering-AAAA-MM-JJ_HHMM.sql.gz
# Voir docs/Deploiement-Proxmox.md (section Restauration).
set -eu

APP_DIR="${APP_DIR:-/opt/onering-admin}"
FILE="${1:?Indiquer le fichier de sauvegarde .sql.gz a restaurer}"

[ -f "$FILE" ] || { echo "Fichier introuvable : $FILE" >&2; exit 1; }
gzip -t "$FILE"

cd "$APP_DIR"
echo "La base m365admin va etre ECRASEE par : $FILE"
printf "Taper RESTAURER pour confirmer : "
read -r CONFIRM
[ "$CONFIRM" = "RESTAURER" ] || { echo "Abandon."; exit 1; }

# Sauvegarde de securite de l'etat actuel (permet de revenir en arriere).
"$APP_DIR/deploy/backup-db.sh" "/var/backups/onering/avant-restauration"

# L'application est arretee pendant la restauration (pas d'ecriture concurrente).
docker compose stop app
zcat "$FILE" | docker compose exec -T postgres psql -U m365admin -d m365admin -v ON_ERROR_STOP=1 -q
docker compose start app

echo "Restauration terminee. Etat precedent conserve dans /var/backups/onering/avant-restauration/"
