#!/usr/bin/env node
// scripts/build.js
// One-shot build: minifica HTML (inline + finale), JS, CSS e copia assets (contenuto).
// Esclude: node_modules, scripts, package.json, package-lock.json, .git, .github, .vscode
// Usage: node scripts/build.js [srcBase] [outBase]
// Example: node scripts/build.js . dist

const fs = require('fs').promises;
const { existsSync, lstatSync } = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const cheerio = require('cheerio');
const terser = require('terser');
const csso = require('csso');

const srcBase = path.resolve(process.argv[2] || '.');
const outBase = path.resolve(process.argv[3] || './dist');

const EXCLUDE_DIRS = new Set(['node_modules', 'scripts', '.git', '.github', '.vscode', 'dist']);
const EXCLUDE_NAMES = new Set(['package.json', 'package-lock.json']);
const STATIC_DIRS = ['assets', 'images', 'img', 'public', 'fonts', 'icons']; // copia SOLO il contenuto
const SKIP_MINIFIED = /\.min\.(js|css)$/i;
const SKIP_COPY_EXTS = new Set(['.js', '.css']); // non copiare js/css raw (li minifichiamo)

// utility
async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
function isExcludedRel(relParts) {
  return relParts.some(p => EXCLUDE_DIRS.has(p) || EXCLUDE_NAMES.has(p));
}
function isMinifiedName(name) {
  return SKIP_MINIFIED.test(name);
}
function ext(name) { return path.extname(name).toLowerCase(); }

// --- minifica inline HTML (script/style) e ritorna transformed HTML string
async function minifyInlineHtmlFile(content, filePath) {
  const $ = cheerio.load(content, { decodeEntities: false });

  // inline <script>
  $('script').each((i, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const type = ($el.attr('type') || '').toLowerCase();
    const preserve = $el.attr('data-preserve') !== undefined;
    if (src || preserve || type === 'application/ld+json') return;
    const code = $el.html();
    if (!code || !code.trim()) return;
    try {
      const res = terser.minify(code, {
        ecma: 2020,
        module: type === 'module',
        compress: { passes: 2 },
        mangle: true,
        format: { comments: false }
      });
      if (res && res.code) $el.html(res.code);
    } catch (e) {
      console.warn('terser inline failed for', filePath, e.message || e);
    }
  });

  // inline <style>
  $('style').each((i, el) => {
    const $el = $(el);
    const preserve = $el.attr('data-preserve') !== undefined;
    if (preserve) return;
    const css = $el.html();
    if (!css || !css.trim()) return;
    try {
      const res = csso.minify(css).css;
      $el.html(res);
    } catch (e) {
      console.warn('csso inline failed for', filePath, e.message || e);
    }
  });

  // return whole document
  const transformed = $.html();

  // final HTML minify (don't minify JS here because we've handled inline)
  const final = await minifyHtml(transformed, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: false,
    ignoreCustomFragments: [
      /<pre[\s\S]*?<\/pre>/gi,
      /<code[\s\S]*?<\/code>/gi,
      /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script>/gi
    ]
  });

  return final;
}

// --- minify JS file content
async function minifyJsContent(code, filePath) {
  try {
    const res = await terser.minify(code, {
      ecma: 2020,
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false }
    });
    return (res && res.code) ? res.code : code;
  } catch (e) {
    console.warn('terser failed for', filePath, e.message || e);
    return code;
  }
}

// --- minify CSS content
function minifyCssContent(code, filePath) {
  try {
    return csso.minify(code).css;
  } catch (e) {
    console.warn('csso failed for', filePath, e.message || e);
    return code;
  }
}

// --- recursive walker that returns file paths
async function walk(dir, base = dir, list = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const name = e.name;
    if (EXCLUDE_DIRS.has(name) || EXCLUDE_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    if (e.isDirectory()) {
      await walk(full, base, list);
    } else {
      list.push(full);
    }
  }
  return list;
}

// --- write file ensuring dir exists
async function writeOut(rel, content, binary = false) {
  const outPath = path.join(outBase, rel);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  if (binary) {
    await fs.copyFile(rel === '' ? rel : rel, outPath); // not used here
  } else {
    await fs.writeFile(outPath, content, 'utf8');
  }
  return outPath;
}

// --- main
(async () => {
  console.log('Build start:', new Date().toISOString());
  console.log('srcBase:', srcBase);
  console.log('outBase:', outBase);

  // remove outBase (safe delete)
  if (existsSync(outBase)) {
    console.log('Cleaning', outBase);
    const rimraf = require('child_process').spawnSync('rm', ['-rf', outBase], { stdio: 'inherit' });
    if (rimraf.status !== 0) {
      // fallback JS delete (rare)
      const rmrfFallback = async p => {
        if (!existsSync(p)) return;
        const stats = lstatSync(p);
        if (stats.isDirectory()) {
          const items = await fs.readdir(p);
          for (const it of items) await rmrfFallback(path.join(p, it));
          await fs.rmdir(p);
        } else {
          await fs.unlink(p);
        }
      };
      await rmrfFallback(outBase);
    }
  }

  // create outBase
  await fs.mkdir(outBase, { recursive: true });

  // walk all files in source
  console.log('Scanning source files...');
  const allFiles = await walk(srcBase, srcBase, []);
  // filter out files inside outBase just in case
  const files = allFiles.filter(f => !path.resolve(f).startsWith(outBase));
  console.log(`Found ${files.length} files to consider.`);

  // process assets: JS/CSS first
  let jsCount = 0, cssCount = 0, htmlCount = 0, otherCount = 0;
  for (const f of files) {
    const rel = path.relative(srcBase, f);
    const parts = rel.split(path.sep);
    if (isExcludedRel(parts)) continue;

    const fileExt = ext(f);
    const base = path.basename(f);

    // skip package files explicitly
    if (EXCLUDE_NAMES.has(base)) continue;

    // JS
    if (fileExt === '.js') {
      // skip already minified
      if (isMinifiedName(base)) {
        // copy as-is
        const dest = path.join(outBase, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(f, dest);
        continue;
      }
      // minify and write
      try {
        const code = await fs.readFile(f, 'utf8');
        const min = await minifyJsContent(code, f);
        const dest = path.join(outBase, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, min, 'utf8');
        jsCount++;
      } catch (e) {
        console.warn('JS process failed for', f, e.message || e);
      }
      continue;
    }

    // CSS
    if (fileExt === '.css') {
      if (isMinifiedName(base)) {
        const dest = path.join(outBase, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(f, dest);
        continue;
      }
      try {
        const css = await fs.readFile(f, 'utf8');
        const min = minifyCssContent(css, f);
        const dest = path.join(outBase, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, min, 'utf8');
        cssCount++;
      } catch (e) {
        console.warn('CSS process failed for', f, e.message || e);
      }
      continue;
    }

    // HTML: handle later to ensure external assets present
    if (fileExt === '.html') {
      htmlCount++;
      continue;
    }

    // others left for copy step
    otherCount++;
  }

  console.log(`JS minified: ${jsCount}, CSS minified: ${cssCount}, HTML to process: ${htmlCount}, other: ${otherCount}`);

  // process HTML (minify inline + final)
  for (const f of files) {
    if (ext(f) !== '.html') continue;
    const rel = path.relative(srcBase, f);
    const parts = rel.split(path.sep);
    if (isExcludedRel(parts)) continue;
    try {
      const h = await fs.readFile(f, 'utf8');
      const minified = await minifyInlineHtmlFile(h, f);
      const dest = path.join(outBase, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, minified, 'utf8');
    } catch (e) {
      console.warn('HTML process failed for', f, e.message || e);
    }
  }

  // copy static directories CONTENTS only (avoid assets/assets)
  for (const d of STATIC_DIRS) {
    const srcDir = path.join(srcBase, d);
    if (!existsSync(srcDir)) continue;
    const destDir = path.join(outBase, d);
    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name) || EXCLUDE_NAMES.has(e.name)) continue;
      const srcPath = path.join(srcDir, e.name);
      const destPath = path.join(destDir, e.name);
      if (e.isDirectory()) {
        // recursive copy but skip js/css files (we already minified them)
        const copyDir = async (s, t) => {
          await fs.mkdir(t, { recursive: true });
          const items = await fs.readdir(s, { withFileTypes: true });
          for (const it of items) {
            if (EXCLUDE_DIRS.has(it.name) || EXCLUDE_NAMES.has(it.name)) continue;
            const sPath = path.join(s, it.name);
            const tPath = path.join(t, it.name);
            if (it.isDirectory()) await copyDir(sPath, tPath);
            else {
              const eExt = ext(it.name);
              if (SKIP_COPY_EXTS.has(eExt)) continue;
              if (!existsSync(tPath)) await fs.copyFile(sPath, tPath);
            }
          }
        };
        await copyDir(srcPath, destPath);
      } else {
        // single file (skip js/css)
        const eExt = ext(e.name);
        if (SKIP_COPY_EXTS.has(eExt)) continue;
        if (!existsSync(destPath)) await fs.copyFile(srcPath, destPath);
      }
    }
  }

  console.log('Build finished. Out:', outBase);
  process.exit(0);
})().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
