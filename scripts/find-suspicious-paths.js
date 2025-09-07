#!/usr/bin/env node
// scripts/find-suspicious-paths.js
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
if (!fs.existsSync(SRC)) { console.error('src/ non trovata.'); process.exit(1); }
function walk(dir, cb){
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for(const it of items){
    const full = path.join(dir, it.name);
    if(it.isDirectory()) walk(full, cb);
    else cb(full);
  }
}
const ATTR_RE = /<(script|link|img|source|a)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;
const LEADING_ALLOWED = /^(?:\.\/|\/|[a-z0-9]+:|\/\/)/i;
walk(SRC, (file) => {
  if (!/\.(html|htm)$/i.test(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let m;
    while((m = ATTR_RE.exec(line)) !== null){
      const tag = m[1];
      const val = m[2];
      if (!LEADING_ALLOWED.test(val)) {
        console.log(`${path.relative(ROOT,file)}:${i+1}: <${tag}> -> ${val}`);
      }
    }
  }
});
