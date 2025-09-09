# Codedge — DEV

> Nota: questo file è per il branch `dev`. Qui risiedono gli script di sviluppo (sitemap, breadcrumbs, formatter, minify, snapshot) e la *pipeline minimal* per minificare siti statici vanilla senza bundler.  
> Se sei su `main` quei file potrebbero non esserci: vedi la sezione **Se non vuoi cambiare branch**.

---

## Presentazione rapida

Codedge è un piccolo laboratorio front-end: pagine **HTML/CSS/JS** + script utili per generare sitemap, frammenti di breadcrumb (`includes/`), formattare il codice e — ora — una pipeline *semplice* per normalizzare i percorsi (`src/`) e generare `dist/` minificata senza Vite/Parcel/Webpack.  
È una soluzione old-style ma affidabile: poca complessità, risultato ripetibile e facile da riparare se qualcosa si rompe.

---

## Struttura degli script (che fanno cosa — spiegazione minima)

- `scripts/find-suspicious-paths.js`  
  Scansiona `src/**/*.html` e segnala i riferimenti (`src`/`href`) che **non** iniziano con `./`, `/` o uno schema (`http:` ecc). Utile per trovare link che romperanno la build.

- `scripts/normalize-paths-cheerio.js`  
  Usa Cheerio per analizzare gli HTML e provare a risolvere e normalizzare i percorsi relativi: aggiunge `./` dove possibile, risolve `srcset`, mostra prima un dry-run e applica con `--apply`.

- `scripts/simple-build.js`  
  La build minimal: minifica HTML (con gestione di inline CSS/JS), minifica file `.css` e `.js` esterni (clean-css e terser), e copia tutto in `dist/`. Ha modalità dry-run e `--apply` per eseguire realmente.

- `scripts/generate-sitemap.js`  
  Genera una sitemap.xml a partire dalla directory indicata (`--dir`). Usalo su root/dev o su `dist/` dopo la build per poi generare breadcrumbs.

- `scripts/generate-breadcrumbs.js`  
  Genera frammenti `includes/` (breadcrumb snippets) a partire da una sitemap. Puoi generare in root o direttamente dentro `dist/` per deploy-ready includes.

- `scripts/format-prettier.js` (+ `scripts/format-prettier.md`)  
  Wrapper per Prettier: serve a mantenere il codice leggibile su `dev`. **Non lo usare su `dist/`** (minificato).

- `scripts/snapshot-backup.sh`  
  Script shell che crea tre copie locali rotanti del progetto (backup/esperimenti). Rendilo eseguibile e usalo quando vuoi uno snapshot locale rapido.

---

## Checklist rapida — 10 punti (PROMEMORIA)

Copia e incolla **una volta** il blocco qui sotto nella shell (o esegui riga per riga). I comandi sono progettati come **dry-run prima**, poi `--apply` quando sei sicuro.

```bash
# 1) Installa dipendenze (una volta)
npm ci

# 2) (Opzionale) Popola src/ dalla root (non sovrascrive file esistenti)
mkdir -p src
rsync -av --exclude node_modules/ --exclude scripts/ --exclude .git/ --exclude dist/ --exclude prebuilt/ --exclude src/ --exclude package.json --exclude package-lock.json \
  --include '*/' --include='*.html' --include='*.htm' --include='*.css' --include='*.js' --include='*.png' --include='*.svg' \
  --exclude='*' ./ src/

# (Se preferisci rigenerare pulito: rm -rf src && ripeti rsync sopra)

# 3) Controlla path "sospetti" (non iniziano con ./ o / o schema)
node scripts/find-suspicious-paths.js

# 4) Normalizza percorsi — DRY RUN (mostra le modifiche, non le scrive)
node scripts/normalize-paths-cheerio.js

# 5) Normalizza percorsi — APPLY (applica i cambiamenti)
node scripts/normalize-paths-cheerio.js --apply

# 6) Build / Minify — DRY RUN (mostra cosa verrebbe fatto)
node scripts/simple-build.js

# 7) Build / Minify — APPLY (genera dist/ minificata)
node scripts/simple-build.js --apply

# 8) Genera sitemap su dist/ (dopo la build)
node scripts/generate-sitemap.js --dir dist --base https://codedge.it

# 9) Genera breadcrumbs/includes direttamente in dist/ dalla sitemap
node scripts/generate-breadcrumbs.js --sitemap dist/sitemap.xml --out dist/includes --base https://codedge.it

# 10) Snapshot locale (rotazione) — rendi eseguibile la prima volta e esegui
chmod +x scripts/snapshot-backup.sh
./scripts/snapshot-backup.sh


# Flusso consigliato (sintesi)

# 1
git switch dev

# 2
npm ci

# 3
(opzionale) popola src/ da root con rsync

# 4
node scripts/find-suspicious-paths.js (correggi eventuali link manuali)

# 5
node scripts/normalize-paths-cheerio.js --apply

# 6
node scripts/simple-build.js --apply

# 7
node scripts/generate-sitemap.js --dir dist --base https://codedge.it

# 8
node scripts/generate-breadcrumbs.js --sitemap dist/sitemap.xml --out dist/includes --base https://codedge.it

# 9
controlla dist/ e fai deploy