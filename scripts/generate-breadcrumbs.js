#!/usr/bin/env node
'use strict';

/**
 * generate-breadcrumbs.js (safe)
 * - respects --dry-run (-n)
 * - excludes partials (footer, includes, ...)
 * - expands last segment with '_' into category + page
 * - creates intermediate category link ONLY if a real landing exists
 */

const fs = require('fs');
const path = require('path');

// ---------- args ----------
const argv = (function () {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--sitemap' || a === '--s') && args[i + 1]) { out.sitemap = args[++i]; continue; }
    if ((a === '--out' || a === '--o') && args[i + 1]) { out.out = args[++i]; continue; }
    if ((a === '--base' || a === '--b') && args[i + 1]) { out.base = args[++i]; continue; }
    if ((a === '--prefix' || a === '--p') && args[i + 1]) { out.prefix = args[++i]; continue; }
    if ((a === '--ignore' || a === '--i') && args[i + 1]) { out.ignore = args[++i]; continue; }
    if (a === '--show-ignored' && args[i + 1]) { out.showIgnored = args[++i]; continue; }
    if (a === '--dry-run' || a === '-n') { out.dry = true; continue; }
    if (a === '--verbose' || a === '-v') { out.verbose = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
  }
  return out;
})();

if (argv.help) {
  console.log('Usage: node scripts/generate-breadcrumbs.js [--sitemap <path>] [--out <dir>] [--base <https://example.com>]');
  console.log('Options: --prefix, --ignore, --show-ignored skip|plain, --dry-run (-n), --verbose (-v)');
  process.exit(0);
}

// ---------- config ----------
const ROOT = path.resolve(__dirname, '..');
const SITEMAP_PATH = path.resolve(__dirname, argv.sitemap || '../sitemap.xml');
const OUT_DIR = path.resolve(__dirname, argv.out || '../includes');
const SOURCE_PREFIX = (argv.prefix !== undefined) ? argv.prefix : '/html';
const DRY_RUN = !!argv.dry;
const VERBOSE = !!argv.verbose;

const DEFAULT_IGNORE = ['footer', 'navbar', 'includes', 'components', 'partials'];
const IGNORE_SEGMENTS = new Set(
  (argv.ignore ? argv.ignore.split(',').map(s => s.trim().toLowerCase()) : DEFAULT_IGNORE)
);
const SHOW_IGNORED = (argv.showIgnored || 'skip').toLowerCase();

const CUSTOM_TITLES = {
  'strumenti': 'Strumenti',
  'progetti-pratici': 'Progetti pratici',
  'risorse': 'Risorse',
  'index': 'Home',
  'chi-sono': 'Chi sono',
  'contatti': 'Contatti'
};

// ---------- helpers ----------
function logv(...args){ if (VERBOSE) console.log(...args); }
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function humanTitle(segment){
  if(!segment) return '';
  const key = segment.replace(/\.html$/i,'');
  if (CUSTOM_TITLES[key]) return CUSTOM_TITLES[key];
  const cleaned = decodeURIComponent(String(segment)).replace(/\.html$/i,'').replace(/[-_]+/g,' ').trim().replace(/\s+/g,' ');
  return cleaned.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ');
}
function pathToFilename(p){
  if(!p || p === '/' || p === '') return 'index.html';
  const cleaned = p.replace(/^\/|\/$/g,'');
  return cleaned.replace(/\//g,'_').replace(/\.html$/i,'') + '.html';
}
function ensureOut(d){ if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// check real landing: folder/index.html OR root base.html OR includes/base.html
function findRealLanding(baseName){
  if(!baseName) return null;
  const base = String(baseName).replace(/^\/+|\/+$/g,'').replace(/\.html$/i,'');
  if(!base) return null;
  const folderIndex = path.join(ROOT, base, 'index.html');
  if (fs.existsSync(folderIndex) && fs.statSync(folderIndex).isFile()) return '/' + base + '/';
  const rootHtml = path.join(ROOT, base + '.html');
  if (fs.existsSync(rootHtml) && fs.statSync(rootHtml).isFile()) return '/' + base + '.html';
  const incHtml = path.join(ROOT, 'includes', base + '.html');
  if (fs.existsSync(incHtml) && fs.statSync(incHtml).isFile()) return '/' + base + '.html';
  return null;
}

// ---------- main ----------
if (!fs.existsSync(SITEMAP_PATH)) {
  console.error('✖ sitemap non trovata:', SITEMAP_PATH);
  process.exit(1);
}

if (!DRY_RUN) ensureOut(OUT_DIR);

const sitemapRaw = fs.readFileSync(SITEMAP_PATH, 'utf8');
const locRe = /<loc>([^<]+)<\/loc>/g;
let m; const urls = [];
while ((m = locRe.exec(sitemapRaw)) !== null) urls.push(m[1]);

if (urls.length === 0) {
  console.error('✖ nessuna <loc> trovata in sitemap.xml');
  process.exit(1);
}

// infer base origin
let baseOrigin = null;
if (argv.base) {
  try { baseOrigin = new URL(argv.base).origin; } catch (e) { baseOrigin = argv.base.replace(/\/+$/,''); }
} else {
  for (let i=0;i<urls.length;i++){ const c = urls[i]; if(/^https?:\/\//i.test(c)){ try{ baseOrigin = new URL(c).origin; break; }catch(e){} } }
  if(!baseOrigin) baseOrigin = 'http://localhost';
}

console.log(`Found ${urls.length} URL(s) — fragments -> ${OUT_DIR}`);
console.log(`Using base origin: ${baseOrigin}`);
console.log(`Ignoring segments: ${Array.from(IGNORE_SEGMENTS).join(', ')}`);
console.log(`showIgnored: ${SHOW_IGNORED}`);
if (DRY_RUN) console.log('DRY RUN: ON (no files will be written)');
if (VERBOSE) console.log('Verbose mode: ON');

urls.forEach(fullUrl => {
  try {
    let u;
    try { u = new URL(fullUrl); } catch (err) { u = new URL(fullUrl, baseOrigin); }

    const rawPathname = u.pathname;
    const prefixRegex = SOURCE_PREFIX ? new RegExp('^' + SOURCE_PREFIX + '(?:/|$)') : null;
    const pathname = prefixRegex ? rawPathname.replace(prefixRegex, '/') : rawPathname;

    const originalParts = pathname.replace(/^\/|\/$/g,'').split('/').filter(Boolean);
    const filteredParts = originalParts.filter(p => !IGNORE_SEGMENTS.has(p.toLowerCase()));
    const partsForCrumbs = filteredParts.length ? filteredParts : [];
    const cleanedPathname = partsForCrumbs.length ? ('/' + partsForCrumbs.join('/')) : '/';
    const pageUrl = u.origin + cleanedPathname;

    // virtual parts (expand last '_' into composite parts)
    const virtualParts = [];
    partsForCrumbs.forEach((seg, idx) => {
      const isLast = idx === partsForCrumbs.length - 1;
      const segNoExt = seg.replace(/\.html$/i,'');
      if (isLast && segNoExt.includes('_')) {
        const subs = segNoExt.split('_').filter(Boolean);
        subs.forEach((s, i) => {
          virtualParts.push({
            seg: s,
            originalIndex: idx,
            isComposite: true,
            compositeIndex: i,
            compositeCount: subs.length,
            rawOriginalSeg: seg,
            isIgnored: IGNORE_SEGMENTS.has(seg.toLowerCase().split('_')[0])
          });
        });
      } else {
        virtualParts.push({
          seg,
          originalIndex: idx,
          isComposite: false,
          rawOriginalSeg: seg,
          isIgnored: IGNORE_SEGMENTS.has(seg.toLowerCase().split('_')[0])
        });
      }
    });

    // decide displayParts (skip/ plain)
    let displayParts;
    if (SHOW_IGNORED === 'plain') {
      // rebuild virtualParts from originalParts and mark ignored
      const vp = [];
      originalParts.forEach((orig, idx) => {
        const isLast = idx === originalParts.length - 1;
        const origNoExt = orig.replace(/\.html$/i,'');
        if (isLast && origNoExt.includes('_')) {
          const subs = origNoExt.split('_').filter(Boolean);
          subs.forEach((s, i) => {
            vp.push({
              seg: s,
              originalIndex: idx,
              isComposite: true,
              compositeIndex: i,
              compositeCount: subs.length,
              rawOriginalSeg: orig,
              isIgnored: IGNORE_SEGMENTS.has(orig.toLowerCase().split('_')[0])
            });
          });
        } else {
          vp.push({
            seg: orig,
            originalIndex: idx,
            isComposite: false,
            rawOriginalSeg: orig,
            isIgnored: IGNORE_SEGMENTS.has(orig.toLowerCase().split('_')[0])
          });
        }
      });
      displayParts = vp;
    } else {
      displayParts = virtualParts;
    }

    // build items
    const items = [];
    items.push({ name: 'Home', url: `${u.origin}/` });

    for (let i = 0; i < displayParts.length; i++) {
      const vp = displayParts[i];
      const lastDisplay = i === (displayParts.length - 1);
      const seg = vp.seg;
      const isIgnored = vp.isIgnored;
      let itemUrl = null;

      if (!isIgnored && !lastDisplay) {
        if (vp.isComposite && vp.compositeIndex === 0) {
          const landing = findRealLanding(seg);
          if (landing) itemUrl = u.origin + landing;
          else itemUrl = null;
        } else {
          const baseParts = (partsForCrumbs.length ? partsForCrumbs : originalParts);
          const cumulativeParts = baseParts.slice(0, vp.originalIndex + 1);
          const candidateBase = (cumulativeParts[cumulativeParts.length - 1] || '').replace(/\.html$/i,'').replace(/^\/+|\/+$/g,'');
          const landing = findRealLanding(candidateBase);
          if (landing) itemUrl = u.origin + landing;
          else itemUrl = null;
        }
      }

      const name = humanTitle(seg);
      items.push({ name, url: itemUrl });
    }

    // last visible element -> canonical pageUrl
    if (items.length > 1) items[items.length - 1].url = pageUrl;

    // build HTML + JSON-LD
    const olHtml = items.map((it, idx) => {
      const last = idx === items.length - 1;
      if (last || !it.url) return `<li aria-current="${last ? 'page' : 'false'}">${escapeHtml(it.name)}</li>`;
      else return `<li><a href="${escapeHtml(it.url)}">${escapeHtml(it.name)}</a></li>`;
    }).join('\n    ');

    const navHtml = `<nav aria-label="breadcrumb" class="breadcrumbs">\n  <ol>\n    ${olHtml}\n  </ol>\n</nav>`;
    const listItems = items.filter(it => it.url).map((it, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "name": it.name,
      "item": it.url
    }));
    const jsonld = { "@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement": listItems };
    const jsonldScript = `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>`;
    const outHtml = `${navHtml}\n\n${jsonldScript}\n`;
    const filename = pathToFilename(cleanedPathname);
    const outPath = path.join(OUT_DIR, filename);

    if (DRY_RUN) {
      console.log('DRY RUN: would write', filename);
      logv(' -> cleanedPathname:', cleanedPathname);
      logv(' -> breadcrumb items:', items);
      logv(' -> fragment preview:\n', outHtml);
    } else {
      fs.writeFileSync(outPath, outHtml, 'utf8');
      console.log('Wrote', filename);
      logv(outHtml);
    }

  } catch (err) {
    console.error('Error processing URL:', fullUrl, err && err.message);
  }
});

console.log('Done ✅');
