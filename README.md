# Codedge — DEV

**Questo file è per il branch `dev`.**  
Qui risiedono gli script di sviluppo (sitemap, breadcrumbs, formatter, minify, snapshot).

> Se sei su `main` quei file potrebbero non esserci: vedi la sezione “Se non vuoi cambiare branch”.

---

## Che cos’è

Codedge è un piccolo laboratorio front-end: pagine HTML/CSS/JS + script utili per generare sitemap, frammenti di breadcrumb (`includes/`), formattare il codice e creare snapshot git locali. Pensato per imparare facendo.

---

## Requisiti minimi

- Node.js (consigliata una versione LTS)
- git

---

## Dove stare / attenzione

Gli script citati sono presenti **su `dev`**. Se lavori su `main` e provi a eseguire `node scripts/...` probabilmente riceverai `file non trovato`.  
Se non vuoi cambiare branch puoi usare `git worktree` (vedi sotto).

---

## Comandi essenziali (esempi — esegui su `dev`)

> Prima: assicurati che la working tree sia pulita (`git status --porcelain` vuoto) o fai `git stash` / commit delle modifiche.

```bash
# spostati su dev
git switch dev

# (se c'è package.json) installa dipendenze
npm ci

# simulazione generazione sitemap (non scrive)
node scripts/generate-sitemap.js --dry-run --base https://codedge.it

# simulazione generazione breadcrumbs (non scrive)
node scripts/generate-breadcrumbs.js --sitemap ./dist/sitemap.xml --out ./includes --dry-run

# controllo formattazione con Prettier
node scripts/format-prettier.js --check

# applica Prettier (scrive)
node scripts/format-prettier.js

# snapshot rotante (script locale)
./scripts/snapshot-backup.sh
```
