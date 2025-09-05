// pipeline-snapshot.js
// Scrive pipeline-snapshot.json nella cartella corrente
// Uso: node pipeline-snapshot.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function runSafe(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    return null;
  }
}

function scanFiles(
  rootDir,
  exts = [".html", ".css", ".js", ".json", ".md"],
  maxFiles = 5000,
) {
  const files = [];
  const stack = [rootDir];
  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        // skip node_modules and .git for speed
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(p);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        try {
          const st = fs.statSync(p);
          files.push({ path: p, ext, size: st.size, mtime: st.mtimeMs });
        } catch (e) {
          // ignore stat errors
        }
      }
      if (files.length >= maxFiles) break;
    }
  }
  return files;
}

function topNBy(files, key, n = 20) {
  return files
    .slice()
    .sort((a, b) => b[key] - a[key])
    .slice(0, n);
}

function recentN(files, n = 50) {
  return files
    .slice()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n);
}

(async function main() {
  const out = {};
  out.timestamp = new Date().toISOString();
  out.cwd = process.cwd();
  out.node = process.version || null;
  out.npm = runSafe("npm -v");
  // package.json
  try {
    const pkgPath = path.join(out.cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      out.package = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      out.package_has_scripts = !!(out.package && out.package.scripts);
    } else {
      out.package = null;
    }
  } catch (e) {
    out.package = {
      error: "unable to read/parse package.json",
      message: e.message,
    };
  }

  // git info (if in a git repo)
  out.git = {};
  const insideGit = runSafe("git rev-parse --is-inside-work-tree") === "true";
  if (insideGit) {
    out.git.branch = runSafe("git rev-parse --abbrev-ref HEAD");
    out.git.head_short = runSafe("git rev-parse --short HEAD");
    out.git.status_porcelain = runSafe("git status --porcelain");
    out.git.remote = runSafe("git remote -v");
    out.git.recent_commits = runSafe(
      'git log -n 20 --pretty=format:"%h %ad %an %s" --date=iso',
    );
  } else {
    out.git.note = "not inside a git repo or git not available";
  }

  // scan files
  const files = scanFiles(
    out.cwd,
    [".html", ".css", ".js", ".json", ".md"],
    10000,
  );
  out.stats = {};
  out.stats.total_files_scanned = files.length;
  // count by ext
  const byExt = files.reduce((acc, f) => {
    acc[f.ext] = (acc[f.ext] || 0) + 1;
    return acc;
  }, {});
  out.stats.count_by_ext = byExt;

  // top largest
  out.top_largest = topNBy(files, "size", 20).map((f) => ({
    path: path.relative(out.cwd, f.path),
    size: f.size,
  }));

  // recent files
  out.recent = recentN(files, 50).map((f) => ({
    path: path.relative(out.cwd, f.path),
    mtime: new Date(f.mtime).toISOString(),
  }));

  // sitemap.xml locs if present
  try {
    const sitemapPath = path.join(out.cwd, "sitemap.xml");
    if (fs.existsSync(sitemapPath)) {
      const s = fs.readFileSync(sitemapPath, "utf8");
      const locs = Array.from(s.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
        (m) => m[1],
      );
      out.sitemap = { path: "sitemap.xml", locs, count: locs.length };
    }
  } catch (e) {
    out.sitemap = { error: e.message };
  }

  // includes folders common names
  const includesCandidates = ["_includes", "includes", "html/includes"];
  out.includes_found = {};
  for (const name of includesCandidates) {
    const full = path.join(out.cwd, name);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      out.includes_found[name] = fs.readdirSync(full).slice(0, 200);
    }
  }

  // scripts folder list
  const scriptsDir = path.join(out.cwd, "scripts");
  if (fs.existsSync(scriptsDir) && fs.statSync(scriptsDir).isDirectory()) {
    out.scripts = fs.readdirSync(scriptsDir).slice(0, 500);
  }

  // top-level npm ls --depth=0 (if npm present)
  if (out.npm) {
    out.npm_top = runSafe("npm ls --depth=0 2>/dev/null");
  }

  // write file
  const outPath = path.join(out.cwd, "pipeline-snapshot.json");
  try {
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
    console.log(`Snapshot scritto in: ${outPath}`);
  } catch (e) {
    console.error("Errore scrivendo snapshot:", e.message);
    process.exitCode = 2;
  }
})();
