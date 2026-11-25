#!/bin/sh
# OneRing Admin — sauvegarde logique quotidienne de la base PostgreSQL.
# Contient : journal d'audit (audit_logs), comptes admin locaux, imports Copilot Cowork.
#
# Usage   : deploy/backup-db.sh [dossier_destination]
# Defaut  : /var/backups/onering
# Cron    : voir deploy/onering-backup.cron
# Voir docs/Deploiement-Proxmox.md (section Sauvegardes).
set -eu

APP_DIR="${APP_DIR:-/opt/onering-admin}"
DEST="${1:-/var/backups/onering}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DEST/onering-$STAMP.sql.gz"

mkdir -p "$DEST"
chmod 700 "$DEST"
cd "$APP_DIR"

# Dump au format SQL compresse. -T : pas de TTY (execution cron).
# Ecriture dans un fichier temporaire puis renommage : jamais de dump tronque
# sous le nom final si pg_dump echoue en cours de route.
docker compose exec -T postgres pg_dump -U m365admin --clean --if-exists m365admin \
  | gzip > "$FILE.part"
mv "$FILE.part" "$FILE"
chmod 600 "$FILE"

# Controle minimal : l'archive est lisible et contient la table d'audit.
if ! gzip -t "$FILE" || ! zcat "$FILE" | grep -q 'audit_logs'; then
  echo "ERREUR : sauvegarde $FILE invalide" >&2
  exit 1
fi

# Rotation : suppression des dumps plus anciens que RETENTION_DAYS jours.
find "$DEST" -name 'onering-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "Sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
