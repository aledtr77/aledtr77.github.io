#!/usr/bin/env bash
set -euo pipefail

# create-rotating-snapshot.sh
# - crea uno snapshot locale 1:1 di dev (no WIP)
# - mantiene al massimo 3 snapshot locali: quando necessario elimina i più vecchi
# - naming: snapshot/dev-YYYY/DD/MM__HH-MM-SS (anno/giorno/mese  __  ora-minuti-secondi)
#
# Uso:
#   ./scripts/create-rotating-snapshot.sh
# (esegui dalla root del repo)

# 1) assicurati in repo e su dev
git fetch --prune origin >/dev/null 2>&1 || true
git switch dev >/dev/null

# 2) raccogli i branch snapshot locali con il loro timestamp di commit (unix time)
mapfile -t lines < <(git for-each-ref --format='%(committerdate:unix) %(refname:short)' refs/heads | grep 'snapshot/dev-' || true)

pairs=()  # conterrà "unix_ts branchname" (dopo eventuale rinomina)

# pattern desiderato: snapshot/dev-YYYY/DD/MM__HH-MM-SS
re_full='^snapshot/dev-[0-9]{4}/[0-9]{2}/[0-9]{2}__[0-9]{2}-[0-9]{2}-[0-9]{2}$'

if [ ${#lines[@]} -gt 0 ]; then
  for L in "${lines[@]}"; do
    unix_ts=$(printf '%s' "$L" | awk '{print $1}')
    name=$(printf '%s' "$L" | awk '{$1=""; sub(/^ /,""); print }')

    # se il nome NON rispetta il formato completo, rinominalo usando il timestamp del commit
    if ! [[ $name =~ $re_full ]]; then
      # uso UTC; per locale sostituisci `-u` con niente o imposta TZ='Europe/Rome'
      newTS=$(date -u -d "@$unix_ts" +"%Y/%d/%m__%H-%M-%S")
      newname="snapshot/dev-${newTS}"

      # gestisci collisioni sul nome (aggiungi -1, -2, ...)
      idx=0
      base="$newname"
      while git show-ref --verify --quiet "refs/heads/$newname"; do
        # se esiste già e coincide con il nome corrente, non toccare
        if [ "$newname" = "$name" ]; then
          break
        fi
        idx=$((idx+1))
        newname="${base}-${idx}"
      done

      if [ "$newname" != "$name" ]; then
        echo "Rinomino snapshot: '$name' -> '$newname' (uso commit time: $unix_ts)"
        git branch -m "$name" "$newname"
        name="$newname"
      fi
    fi

    pairs+=("$unix_ts $name")
  done
fi

# parse e ordina per tempo (vecchi -> nuovi)
sorted_names=()
if [ ${#pairs[@]} -gt 0 ]; then
  # sort numericamente per unix timestamp
  while IFS= read -r P; do
    name=$(printf '%s' "$P" | awk '{$1=""; sub(/^ /,""); print }')
    sorted_names+=("$name")
  done < <(printf '%s\n' "${pairs[@]}" | sort -n)
fi

count=${#sorted_names[@]}
MAX=3

# 3) calcola quante cancellare per arrivare a MAX-1 (teniamo MAX-1 prima di creare la nuova snapshot)
to_delete=0
if [ "$count" -ge "$MAX" ]; then
  to_delete=$((count - (MAX - 1)))
fi

if [ "$to_delete" -gt 0 ]; then
  echo "Trovati $count snapshot; elimino i $to_delete più vecchi per mantenere la rotazione di $MAX snapshot."
  for ((i=0; i<to_delete; i++)); do
    br="${sorted_names[$i]}"
    echo "  -> cancellando local: $br"
    git branch -D "$br"
  done
else
  echo "Snapshot correnti: $count (nessuna cancellazione necessaria)."
fi

# 4) crea nuova snapshot 1:1 di dev, NO WIP, NO push
TS=$(date -u +"%Y/%d/%m__%H-%M-%S")  # formato richiesto: YYYY/DD/MM__HH-MM-SS (UTC)
SNAP="snapshot/dev-${TS}"

# safety: se per qualche motivo esiste già (molto improbabile), aggiungo suffisso numerico
idx=0
base="$SNAP"
while git show-ref --verify --quiet "refs/heads/$SNAP"; do
  idx=$((idx+1))
  SNAP="${base}-${idx}"
done

git branch "$SNAP" dev
echo "✅ Nuovo snapshot locale creato: $SNAP  (punta a HEAD di dev)."
echo "Lista snapshot locali attuali:"
git branch --list 'snapshot/dev-*' || true
