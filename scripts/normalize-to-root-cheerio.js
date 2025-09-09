#!/usr/bin/env node
/**
 * scripts/normalize-to-root-cheerio.js
 *
 * Trasforma href/src relativi in path root-based risolti rispetto alla root del progetto.
 *
 * Usage:
 *  node scripts/normalize-to-root-cheerio.js --dir=src --dry-run --verbose
 *  node scripts/normalize-to-root-cheerio.js --dir=src --apply --backup
 *
 * Opzioni:
 *  --dir     : cartella da scansionare (default: .)
 *  --dry-run : stampa le modifiche senza applicarle (default: true)
 *  --apply   : applica le modifiche (se omesso, sta in dry-run)
 *  --backup  : crea file.bak prima di sovrascrivere
 *  --verbose : log dettagliato
 *
 * NOTE: fai sempre un git commit prima di eseguire --apply.
 */

const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const argv = require('minimist')(process.argv.slice(2), {
  string: ['dir'],
  boolean: ['dry-run','apply','backup','verbose','recursive'],
  default: { dir: '.', 'dry-run': true, apply: false, backup: false, verbose: false, recursive: true }
});

const ROOT = path.resolve(argv.dir || '.'); // root per risolvere i percorsi
const DRY = !argv.apply;
const BACKUP = !!argv.backup;
const VERBOSE = !!argv.verbose;
const RECURSIVE = !!argv.recursive;

function isExternal(url) {
  if (!url || typeof url !== 'string') return false;
  return /^(\/|#|https?:|\/\/|mailto:|tel:|data:|javascript:)/i.test(url);
}

// divide url in base + ?query + #hash
function splitUrl(u) {
  const hashIndex = u.indexOf('#');
  const queryIndex = u.indexOf('?');
  let base = u, query = '', hash = '';
  if (queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)) {
    query = u.slice(queryIndex, hashIndex === -1 ? undefined : hashIndex);
    base = u.slice(0, queryIndex);
  }
  if (hashIndex !== -1) {
    hash = u.slice(hashIndex);
    base = base.slice(0, hashIndex);
  }
  return { base, query, hash };
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function walk(dir, cb) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (RECURSIVE) await walk(full, cb);
    } else {
      await cb(full);
    }
  }
}

function makeRootPath(resolvedAbsPath, rootAbsPath) {
  // normalized posix strings
  const resPosix = toPosix(resolvedAbsPath);
  const rootPosix = toPosix(rootAbsPath);
  if (!resPosix.startsWith(rootPosix)) {
    // se il file risolto esce fuori dalla root (caso strano), limitiamo: prendi basename
    const fallback = '/' + path.posix.basename(resPosix);
    return fallback;
  }
  let rel = resPosix.slice(rootPosix.length);
  // rimuovi eventuali slash in eccesso
  rel = rel.replace(/^\/+/, '');
  return '/' + rel;
}

function transformUrlAttr(attrValue, htmlFilePath, projectRoot) {
  if (!attrValue || typeof attrValue !== 'string') return null;
  // skip external or absolute root or hashes
  if (isExternal(attrValue)) {
    // BUT note: we treat leading "/" as already root-based => leave as-is
    return null;
  }

  const { base, query, hash } = splitUrl(attrValue);

  // costruisci il percorso assoluto della risorsa risolvendo base rispetto alla posizione dell'HTML
  // htmlFilePath es: /home/user/proj/src/footer/chi-sono/index.html
  const htmlDir = path.dirname(path.resolve(htmlFilePath));

  // risolvi la path relativa (es. ../../js/components/foo.js) rispetto alla posizione del file HTML
  const resolved = path.resolve(htmlDir, base);

  // converti in path root-based rispetto a projectRoot
  const rootPath = makeRootPath(resolved, projectRoot);

  // ricostruisci con query/hash
  const final = rootPath + (query || '') + (hash || '');
  return final;
}

async function processFile(filePath, projectRoot) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.html', '.htm'].includes(ext)) return null;

  const raw = await fs.readFile(filePath, 'utf8');
  const $ = cheerio.load(raw, { decodeEntities: false });

  const changes = [];

  // attributes to normalize
  const attrs = ['href','src','data-src','data-href'];
  attrs.forEach(attr => {
    // select elements that have the attribute
    $('[ ' + attr + ' ]').each((i, el) => {
      const $el = $(el);
      const val = $el.attr(attr);
      if (!val) return;
      const newVal = transformUrlAttr(val, filePath, projectRoot);
      if (newVal && newVal !== val) {
        changes.push({ tag: el.tagName, attr, from: val, to: newVal });
        $el.attr(attr, newVal);
      }
    });
  });

  // srcset special handling
  $('[srcset]').each((i, el) => {
    const $el = $(el);
    const val = $el.attr('srcset');
    if (!val) return;
    const parts = val.split(',').map(p => p.trim());
    const newParts = parts.map(part => {
      const [url, descriptor] = part.split(/\s+/, 2);
      if (isExternal(url)) return part;
      const { base, query, hash } = splitUrl(url);
      const resolved = path.resolve(path.dirname(filePath), base);
      const rootPath = makeRootPath(resolved, projectRoot);
      return rootPath + (query || '') + (hash || '') + (descriptor ? ' ' + descriptor : '');
    });
    const newVal = newParts.join(', ');
    if (newVal !== val) {
      changes.push({ tag: el.tagName, attr: 'srcset', from: val, to: newVal });
      $el.attr('srcset', newVal);
    }
  });

  if (!changes.length) return null;

  const out = $.html();

  return { filePath, raw, out, changes };
}

(async () => {
  const files = [];
  await walk(ROOT, async file => {
    const r = await processFile(file, ROOT);
    if (r) files.push(r);
  });

  if (!files.length) {
    console.log('Nessuna modifica necessaria.');
    return;
  }

  for (const item of files) {
    console.log(`CHANGES for ${path.relative(ROOT, item.filePath)}`);
    for (const c of item.changes) {
      console.log(`  - ${c.tag} ${c.attr} ${c.from} -> ${c.to}`);
    }
    if (DRY) {
      console.log(' -> (dry-run) run with --apply to persist\n');
    } else {
      if (BACKUP) {
        await fs.writeFile(item.filePath + '.bak', item.raw, 'utf8');
        if (VERBOSE) console.log('Backup creato:', item.filePath + '.bak');
      }
      await fs.writeFile(item.filePath, item.out, 'utf8');
      console.log(' -> applicato\n');
    }
  }

  console.log('Done.');
})();
