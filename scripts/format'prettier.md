1. Solo check — controllo se ci sono file non formattati (non modifica nulla)

---

# qualsiasi delle due va bene

node scripts/format-prettier.js --check
./scripts/format-prettier.js --check

# con dettagli/diagnostica

node scripts/format-prettier.js --check --verbose
./scripts/format-prettier.js --check --verbose

2. Applica la formattazione (scrive i file con Prettier)

---

node scripts/format-prettier.js

# oppure

./scripts/format-prettier.js

3. Applica la formattazione e committa automaticamente (git add + commit)

---

node scripts/format-prettier.js --commit

# o con verbose

node scripts/format-prettier.js --commit --verbose
