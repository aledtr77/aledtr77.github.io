#!/usr/bin/env node
// simple-build.js
const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const terser = require('terser');
const cheerio = require('cheerio');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const APPLY = process.argv.includes('--apply');

function log(...a){ console.log(...a); }
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function rmDir(p){ if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

const htmlOptions = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  minifyCSS: false,
  minifyJS: false
};

async function minifyInlineScript(code, fileHint){
  try{
    const res = await terser.minify(code, { module: false });
    if(res.error){ console.error('[terser inline error]', fileHint, res.error); return code; }
    return res.code || code;
  }catch(e){
    console.error('[terser exception]', fileHint, e && e.message ? e.message : e);
    return code;
  }
}

function minifyInlineStyle(code, fileHint){
  try{
    const out = new CleanCSS({}).minify(code);
    if(out.errors && out.errors.length) {
      console.error('[clean-css inline error]', fileHint, out.errors);
      return code;
    }
    return out.styles || code;
  }catch(e){
    console.error('[clean-css exception]', fileHint, e && e.message ? e.message : e);
    return code;
  }
}

async function processHtmlFile(srcFull, dstFull){
  const rel = path.relative(SRC, srcFull);
  const txt = fs.readFileSync(srcFull,'utf8');
  const $ = cheerio.load(txt, { decodeEntities: false });

  $('style').each((i, el) => {
    const cur = $(el).html();
    if(cur && cur.trim()){
      const newCss = minifyInlineStyle(cur, rel);
      $(el).text(newCss);
    }
  });

  const scriptPromises = [];
  $('script').each((i, el) => {
    const srcAttr = $(el).attr('src');
    const typeAttr = ($(el).attr('type') || '').toLowerCase();
    if(srcAttr) return;
    if(typeAttr && typeAttr !== 'text/javascript' && typeAttr !== 'application/javascript' && typeAttr !== '') return;
    const cur = $(el).html();
    if(cur && cur.trim()){
      const p = minifyInlineScript(cur, rel).then((newJs) => {
        $(el).text(newJs);
      });
      scriptPromises.push(p);
    }
  });

  await Promise.all(scriptPromises);
  const modified = $.html();
  let finalHtml;
  try{
    finalHtml = await minifyHtml(modified, htmlOptions);
  }catch(e){
    console.error('[html-minifier error]', rel, e && e.message ? e.message : e);
    finalHtml = modified;
  }

  if(APPLY){
    ensureDir(path.dirname(dstFull));
    fs.writeFileSync(dstFull, finalHtml, 'utf8');
    log('[HTML]', rel);
  } else {
    log('[DRY HTML]', rel);
  }
}

async function processFile(srcFull, dstFull){
  const ext = path.extname(srcFull).toLowerCase();
  const rel = path.relative(SRC, srcFull);
  if(ext === '.html' || ext === '.htm'){
    await processHtmlFile(srcFull, dstFull);
  } else if(ext === '.js'){
    const txt = fs.readFileSync(srcFull,'utf8');
    try{
      const res = await terser.minify(txt, { toplevel:false });
      const min = res.code || txt;
      if(APPLY){
        ensureDir(path.dirname(dstFull));
        fs.writeFileSync(dstFull, min, 'utf8');
        log('[JS]', rel);
      } else log('[DRY JS]', rel);
    }catch(e){
      console.error('[terser error file]', rel, e && e.message ? e.message : e);
      if(APPLY){
        ensureDir(path.dirname(dstFull));
        fs.copyFileSync(srcFull, dstFull);
        log('[JS-copied-on-error]', rel);
      } else log('[DRY JS-error-copied]', rel);
    }
  } else if(ext === '.css'){
    const txt = fs.readFileSync(srcFull,'utf8');
    try{
      const out = new CleanCSS({}).minify(txt);
      const min = out.styles || txt;
      if(APPLY){
        ensureDir(path.dirname(dstFull));
        fs.writeFileSync(dstFull, min, 'utf8');
        log('[CSS]', rel);
      } else log('[DRY CSS]', rel);
    }catch(e){
      console.error('[clean-css error file]', rel, e && e.message ? e.message : e);
      if(APPLY){
        ensureDir(path.dirname(dstFull));
        fs.copyFileSync(srcFull, dstFull);
        log('[CSS-copied-on-error]', rel);
      } else log('[DRY CSS-error-copied]', rel);
    }
  } else {
    if(APPLY){
      ensureDir(path.dirname(dstFull));
      fs.copyFileSync(srcFull, dstFull);
      log('[COPY]', rel);
    } else log('[DRY COPY]', rel);
  }
}

async function walkAndProcess(dsrc, ddst){
  const items = fs.readdirSync(dsrc, { withFileTypes: true });
  for(const it of items){
    const s = path.join(dsrc, it.name);
    const d = path.join(ddst, it.name);
    if(it.isDirectory()) await walkAndProcess(s,d);
    else await processFile(s,d);
  }
}

(async ()=>{
  if(!fs.existsSync(SRC)){
    console.error('src/ non trovata. Esco.');
    process.exit(1);
  }
  log('Build:', APPLY ? 'APPLY' : 'DRY-RUN');
  if(APPLY){
    rmDir(DIST);
    ensureDir(DIST);
  }
  await walkAndProcess(SRC, DIST);
  log('Done. dist ready at', APPLY ? 'dist/' : '(dry-run complete)');
})();
