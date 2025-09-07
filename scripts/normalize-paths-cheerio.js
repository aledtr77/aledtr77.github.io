#!/usr/bin/env node
// scripts/normalize-paths-cheerio.js
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

function isExternal(u){ return !u || /^(?:[a-z0-9]+:|\/\/)/i.test(u) || u.startsWith('data:'); }

function resolveIfExists(htmlFile, attrValue){
  if (!attrValue || typeof attrValue !== 'string') return null;
  if (attrValue.startsWith('./') || attrValue.startsWith('/') || isExternal(attrValue)) return null;
  const abs = path.resolve(path.dirname(htmlFile), attrValue);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    let rel = path.relative(path.dirname(htmlFile), abs).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  }
  return null;
}

function processSrcset(htmlFile, val){
  const parts = val.split(',').map(p => p.trim());
  let changed = false;
  const out = parts.map(p => {
    const m = p.match(/^([^\s]+)(\s+\d+[w|x])?$/);
    if(!m) return p;
    const url = m[1];
    const suffix = m[2] || '';
    const newp = resolveIfExists(htmlFile, url);
    if(newp){ changed = true; return newp + suffix; }
    return p;
  });
  return changed ? out.join(', ') : null;
}

function processFile(filePath){
  let txt = fs.readFileSync(filePath,'utf8');
  const $ = cheerio.load(txt, { decodeEntities: false });
  const candidates = [
    {sel:'script', attr:'src'},
    {sel:'link', attr:'href'},
    {sel:'img', attr:'src'},
    {sel:'img', attr:'srcset'},
    {sel:'source', attr:'src'},
    {sel:'source', attr:'srcset'},
    {sel:'a', attr:'href'},
    {sel:'*[data-href]', attr:'data-href'}
  ];
  const changes = [];
  candidates.forEach(c => {
    $(c.sel).each((i, el) => {
      const attrib = c.attr;
      const cur = $(el).attr(attrib);
      if(!cur) return;
      if(attrib === 'srcset'){
        const newv = processSrcset(filePath, cur);
        if(newv){
          changes.push({tag:c.sel, attr:attrib, from:cur, to:newv});
          $(el).attr(attrib, newv);
        }
      } else {
        const newv = resolveIfExists(filePath, cur);
        if(newv){
          changes.push({tag:c.sel, attr:attrib, from:cur, to:newv});
          $(el).attr(attrib, newv);
        }
      }
    });
  });
  if(changes.length){
    console.log('CHANGES for', path.relative(ROOT, filePath));
    changes.forEach(c => console.log('  -', c.tag, c.attr, c.from, '->', c.to));
    if(APPLY){
      fs.writeFileSync(filePath, $.html(), 'utf8');
      console.log(' -> applied\n');
    } else {
      console.log(' -> (dry-run) run with --apply to persist\n');
    }
  }
}

function walk(dir){
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for(const it of items){
    const full = path.join(dir, it.name);
    if(it.isDirectory()) walk(full);
    else if(/\.(html|htm)$/i.test(it.name)) processFile(full);
  }
}

if(!fs.existsSync(SRC)){
  console.error('src/ non trovata. Assicurati di avere src/ o modifica il percorso nello script.');
  process.exit(1);
}
walk(SRC);
console.log('normalize-paths-cheerio done. Use --apply to persist changes.');
