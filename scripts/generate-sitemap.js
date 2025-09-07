// scripts/generate-sitemap.js
// Strong-safe sitemap generator: non INventa /footer/...
// Default mapping: footer -> home
// Usage examples:
//  node scripts/generate-sitemap.js --dir dist --base https://codedge.it
//  node scripts/generate-sitemap.js --base https://codedge.it             (usa dist/ per default)
//  node scripts/generate-sitemap.js --mirror-root --base https://codedge.it
//  node scripts/generate-sitemap.js --sitemap-out ./public/sitemap.xml --dir dist --base https://codedge.it
"use strict";

const fs = require("fs");
const path = require("path");

const argv = (function parseArgs() {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir" && args[i + 1]) {
      out.dir = args[++i];
      continue;
    }
    if (a === "--base" && args[i + 1]) {
      out.base = args[++i];
      continue;
    }
    if (a === "--no-ext") {
      out.noExt = true;
      continue;
    }
    if (a === "--help") {
      out.help = true;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--exclude" && args[i + 1]) {
      out.exclude = args[++i];
      continue;
    }
    if (a === "--map" && args[i + 1]) {
      out.map = args[++i];
      continue;
    }
    if (a === "--mirror-root") {
      out.mirrorRoot = true;
      continue;
    }
    if (a === "--sitemap-out" && args[i + 1]) {
      out.sitemapOut = args[++i];
      continue;
    }
  }
  return out;
})();

if (argv.help) {
  console.log(
    'Usage: node scripts/generate-sitemap.js --dir <folder> --base <https://example.com> [--no-ext] [--dry-run] [--exclude partials,includes] [--map "footer:home"] [--mirror-root] [--sitemap-out ./some/path/sitemap.xml]',
  );
  console.log(
    "Default: --dir dist (se dist non esiste e non passi --dir, il tool userà la root ./ come fallback).",
  );
  process.exit(0);
}

// prefer dist/ by default
let WORKDIR = path.resolve(process.cwd(), argv.dir || "dist");

// fallback to project root if dist doesn't exist and user didn't pass --dir
if (!fs.existsSync(WORKDIR)) {
  if (!argv.dir) {
    const fallback = path.resolve(process.cwd(), ".");
    if (fs.existsSync(fallback)) {
      console.warn(
        `Warning: directory "${WORKDIR}" non trovata. Uso la root come fallback: ${fallback}`,
      );
      WORKDIR = fallback;
    } else {
      console.error("Directory non trovata:", WORKDIR);
      process.exit(2);
    }
  } else {
    console.error(
      "Directory non trovata (hai passato --dir esplicitamente):",
      WORKDIR,
    );
    process.exit(2);
  }
}

let RAW_BASE = (argv.base || process.env.SITE_URL || "").toString().trim();
let BASE = RAW_BASE.replace(/\/+$/, "");
if (BASE && !/^https?:\/\//i.test(BASE)) {
  console.warn(
    'Attenzione: --base / SITE_URL non contiene protocollo; prependo "https://".',
  );
  BASE = "https://" + BASE;
}
if (BASE) BASE = BASE.replace(/\/+$/, "");

const NO_EXT = !!argv.noExt;
const DRY_RUN = !!argv.dryRun;
const MIRROR_ROOT = !!argv.mirrorRoot;
const SITEMAP_OUT_FLAG = argv.sitemapOut || null;

// default excludes (non-public folders)
const DEFAULT_EXCLUDES = [
  "partials",
  "includes",
  "scripts",
  ".git",
  "node_modules",
  ".github",
  "src",
  "assets/src",
  "dist",
]; // note: include dist to avoid double-scanning if you run from project root
let EXCLUDES = DEFAULT_EXCLUDES.slice();
if (argv.exclude)
  EXCLUDES = argv.exclude
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// default map: strip/mapping of partial prefixes to real public folders
const DEFAULT_MAP = { footer: "home" };
function parseMap(str) {
  if (!str) return {};
  return str
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const [k, v] = pair.split(":").map((s) => s && s.trim());
      if (k && v) acc[k] = v;
      return acc;
    }, {});
}

let MAP = Object.assign({}, DEFAULT_MAP);
if (argv.map) {
  MAP = Object.assign(MAP, parseMap(argv.map));
} else {
  const mapFile = path.join(__dirname, "map.json");
  if (fs.existsSync(mapFile)) {
    try {
      const raw = fs.readFileSync(mapFile, "utf8");
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") MAP = Object.assign(MAP, obj);
    } catch (e) {
      console.warn(
        "Attenzione: non ho potuto leggere scripts/map.json — ignorato.",
      );
    }
  }
}

function isHiddenSeg(seg) {
  return seg.startsWith(".");
}

function walkHtml(dir, list = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  items.forEach((it) => {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (isHiddenSeg(it.name)) return;
      if (EXCLUDES.includes(it.name)) {
        list.push({
          full,
          rel: path.relative(WORKDIR, full).replace(/\\/g, "/"),
          excludedDir: true,
        });
        return;
      }
      walkHtml(full, list);
    } else if (it.isFile() && /\.html?$/i.test(it.name)) {
      const rel = path.relative(WORKDIR, full).replace(/\\/g, "/");
      const segments = rel
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      const excluded = segments.some(
        (seg) => EXCLUDES.includes(seg) || isHiddenSeg(seg),
      );
      list.push({ full, rel, excluded });
    }
  });
  return list;
}

function findPublicEquivalentWithMap(relPath) {
  const baseName = path.basename(relPath);
  const m = baseName.match(/^(.+?)_(.+)\.html$/i);
  if (!m) return null;
  const prefix = m[1];
  const rest = m[2];
  const restKebab = rest.replace(/_/g, "-");
  const mappedFolder = MAP[prefix] || prefix;

  const candidates = [
    path.join(mappedFolder, restKebab, "index.html"),
    path.join(mappedFolder, restKebab + ".html"),
  ];

  for (const c of candidates) {
    const abs = path.join(WORKDIR, c);
    if (!fs.existsSync(abs)) continue;
    if (!fs.statSync(abs).isFile()) continue;

    const segs = c
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.some((seg) => EXCLUDES.includes(seg) || isHiddenSeg(seg)))
      continue;

    return c.replace(/\\/g, "/");
  }
  return null;
}

function toUrl(relPath) {
  if (!relPath) return null;
  if (relPath.split("/").some((p) => p.startsWith("."))) return null;
  let rel = relPath;
  if (/\/?index\.html$/i.test(rel)) {
    rel = rel.replace(/index\.html$/i, "");
  } else {
    if (NO_EXT) rel = rel.replace(/\.html$/i, "");
  }
  rel = "/" + rel.replace(/^\/+/, "");
  rel = rel.replace(/\/+/g, "/");
  if (rel === "") rel = "/";
  if (BASE) return BASE + (rel === "/" ? "/" : rel);
  return rel;
}

function formatIso(date) {
  return new Date(date).toISOString();
}
function escapeXml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * computePriority(loc)
 * - Home ('/' or '/index/') => 1.0
 * - Tutto il resto => 0.8
 */
function computePriority(loc) {
  if (!loc) return 0.8;
  let pathPart = loc;
  if (BASE && loc.startsWith(BASE)) {
    pathPart = loc.slice(BASE.length);
  }
  if (!pathPart.startsWith("/")) pathPart = "/" + pathPart;
  // normalize trailing slash
  if (!pathPart.endsWith("/")) pathPart = pathPart + "/";

  if (pathPart === "/" || pathPart === "/index/") return 1.0;
  return 0.8;
}

function writeSitemap(xml, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, xml, "utf8");
  console.log("Sitemap scritta in:", targetPath);
}

function generate() {
  const rawList = walkHtml(WORKDIR);
  const excludedRecords = rawList.filter((i) => i.excluded);
  const includedRecords = rawList.filter((i) => !i.excluded && !i.excludedDir);

  const pages = includedRecords
    .map((i) => {
      const url = toUrl(i.rel);
      if (!url) return null;
      const stat = fs.statSync(i.full);
      return {
        url,
        lastmod: formatIso(stat.mtime),
        rel: i.rel,
        priority: computePriority(url),
      };
    })
    .filter(Boolean);

  const mapped = [];
  const unmapped = [];
  excludedRecords.forEach((rec) => {
    if (rec.excludedDir) return;
    const candidate = findPublicEquivalentWithMap(rec.rel);
    if (candidate) {
      const fullCandidate = path.join(WORKDIR, candidate);
      const stat = fs.statSync(fullCandidate);
      const url = toUrl(candidate);
      mapped.push({
        url,
        lastmod: formatIso(stat.mtime),
        rel: candidate,
        sourceExcluded: rec.rel,
        priority: computePriority(url),
      });
    } else {
      unmapped.push(rec.rel);
    }
  });

  const all = pages.concat(mapped);
  const uniq = [];
  const seen = new Set();
  all.forEach((p) => {
    if (!seen.has(p.url)) {
      seen.add(p.url);
      uniq.push(p);
    }
  });

  console.log("Sorgente:", WORKDIR);
  console.log("BASE:", BASE || "(nessuna; URL relative)");
  console.log("EXCLUDES (applied):", EXCLUDES.join(", "));
  console.log("MAP (active):", MAP);
  console.log("Tot file HTML scansionati:", rawList.length);
  console.log(" - file inclusi diretti per sitemap:", pages.length);
  console.log(" - file esclusi (partials/includes):", excludedRecords.length);
  console.log(
    " - di questi mappati verso file pubblici esistenti:",
    mapped.length,
  );
  console.log(
    " - esclusi senza equivalente pubblico (IGNORATI):",
    unmapped.length,
  );

  if (mapped.length) {
    console.log("\nMapped entries (excluded -> public):");
    mapped.forEach((m) =>
      console.log(`  ${m.sourceExcluded}  ->  ${m.rel}  ->  ${m.url}`),
    );
  }
  if (unmapped.length) {
    console.log("\nExcluded without public equivalent (ignored):");
    unmapped.forEach((u) => console.log(" ", u));
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: URLs that WOULD be in sitemap ---");
    uniq.forEach((p) => console.log(p.url));
    console.log("\n(Remove --dry-run to write sitemap.xml)");
    return;
  }

  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const urlsetOpen =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  const urlsetClose = "</urlset>\n";
  const urls = uniq
    .map(
      (p) =>
        `  <url>\n    <loc>${escapeXml(p.url)}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join("\n");
  const xml = xmlHeader + urlsetOpen + urls + "\n" + urlsetClose;

  // determine output path
  const outPath = SITEMAP_OUT_FLAG
    ? path.resolve(process.cwd(), SITEMAP_OUT_FLAG)
    : path.join(WORKDIR, "sitemap.xml");

  writeSitemap(xml, outPath);

  // optionally mirror to repo root
  if (MIRROR_ROOT) {
    const rootPath = path.join(process.cwd(), "sitemap.xml");
    // avoid rewriting same file twice if outPath already is rootPath
    if (path.resolve(outPath) !== path.resolve(rootPath)) {
      writeSitemap(xml, rootPath);
      console.log("Mirror: sitemap copiato anche in root:", rootPath);
    }
  }

  console.log("Sitemap generata:", outPath, "->", uniq.length, "URL");
  // exit normally
}

generate();
