#!/usr/bin/env node
"use strict";

/**
 * scripts/format-prettier.js
 * Robust Prettier runner for the CODEDGE repo.
 *
 * Features:
 *  - prefer local node_modules/.bin/prettier
 *  - fallback to `npm exec -- prettier` then `npx prettier`
 *  - respects a simple .prettierignore (substring rules)
 *  - normalizes paths, filters by extension, removes non-files
 *  - special handling for SVG (parser: html)
 *  - robust handling of prettier-plugin-xml: tries require.resolve and
 *    falls back to src/plugin.js; passes explicit --plugin <path> to Prettier
 *  - flags: --check, --commit, --verbose/-v, --dry-list
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd, opts = {}) {
  return execSync(cmd, Object.assign({ encoding: "utf8" }, opts)).trim();
}
function safeExec(cmd) {
  try {
    return run(cmd);
  } catch (e) {
    return null;
  }
}
function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const DO_COMMIT = args.includes("--commit");
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const DRY_LIST = args.includes("--dry-list");

if (args.includes("--help")) {
  console.log(
    "Usage: node scripts/format-prettier.js [--check] [--commit] [--verbose|-v] [--dry-list]",
  );
  process.exit(0);
}

function vlog(...p) {
  if (VERBOSE) console.log(...p);
}
function plural(n, s = "file") {
  return `${n} ${s}${n === 1 ? "" : "s"}`;
}

// Ensure git repo & move to root
const inside = safeExec("git rev-parse --is-inside-work-tree");
if (!inside) die("Errore: non sono dentro un repository Git.");
const REPO_ROOT = safeExec("git rev-parse --show-toplevel");
if (!REPO_ROOT) die("Impossibile determinare la root del repository.");
process.chdir(REPO_ROOT);
const branch = safeExec("git rev-parse --abbrev-ref HEAD");
if (!branch) die("Impossibile determinare branch corrente.");
if (branch !== "dev")
  die(`Attenzione: esegui solo su 'dev'. Sei su '${branch}'.`);

// Collect tracked + untracked files
let tracked = [],
  untracked = [];
try {
  tracked = run("git ls-files").split("\n").filter(Boolean);
} catch (e) {
  tracked = [];
}
try {
  untracked = run("git ls-files --others --exclude-standard")
    .split("\n")
    .filter(Boolean);
} catch (e) {
  untracked = [];
}

vlog(
  `Found ${plural(tracked.length, "tracked")} and ${plural(untracked.length, "untracked")} (raw).`,
);

let allFiles = Array.from(new Set([...tracked, ...untracked]));
const extRE = /\.(?:html?|css|js(?:on)?|md|svg|xml|ya?ml|ts|jsx|tsx)$/i;

// normalize paths
allFiles = allFiles
  .map((p) => path.normalize(p).replace(/^(\.\/)+/, ""))
  .filter(Boolean);

vlog(`After normalization: ${plural(allFiles.length)} (sample first 40):`);
if (VERBOSE)
  console.log(
    allFiles.slice(0, 40).join("\n") +
      (allFiles.length > 40 ? "\n... (troncato)\n" : ""),
  );

// filter by extension
const beforeExt = allFiles.length;
allFiles = allFiles.filter((p) => extRE.test(p));
vlog(`Filtered by extension: ${beforeExt} -> ${allFiles.length}`);

// Exclude common folders
allFiles = allFiles.filter(
  (p) =>
    !p.split(path.sep).includes("dist") &&
    !p.split(path.sep).includes("node_modules"),
);

// Read .prettierignore (basic substring matching)
const prettierIgnorePath = path.join(REPO_ROOT, ".prettierignore");
let ignorePatterns = [];
if (fs.existsSync(prettierIgnorePath)) {
  ignorePatterns = fs
    .readFileSync(prettierIgnorePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  vlog(`.prettierignore patterns (${ignorePatterns.length}):`);
  if (VERBOSE) console.log(ignorePatterns.join("\n"));
}
if (ignorePatterns.length) {
  allFiles = allFiles.filter((file) => {
    for (const patRaw of ignorePatterns) {
      const pat = patRaw.replace(/\*/g, "");
      if (patRaw.endsWith("/")) {
        const prefix = pat.replace(/^(\.\/)+/, "");
        if (file.startsWith(prefix)) return false;
      } else {
        if (file.includes(pat)) return false;
      }
    }
    return true;
  });
  vlog(`After .prettierignore: ${plural(allFiles.length)}`);
}

// Keep only existing regular files
const existsFiles = [];
const removed = [];
for (const p of allFiles) {
  try {
    const full = path.join(REPO_ROOT, p);
    const st = fs.lstatSync(full);
    if (st.isFile()) existsFiles.push(p);
    else removed.push(p);
  } catch (e) {
    removed.push(p);
  }
}
if (removed.length) {
  console.log(
    `Rimosse ${removed.length} voci non-file / non-esistenti (evito problemi).`,
  );
  if (removed.length <= 200) console.log(removed.join("\n"));
  else console.log(removed.slice(0, 200).join("\n") + "\n... (troncato)");
}
allFiles = Array.from(new Set(existsFiles));
if (!allFiles.length) {
  console.log("Nessun file rilevante trovato.");
  process.exit(0);
}

// group files by type
const svgFiles = allFiles.filter((p) => p.toLowerCase().endsWith(".svg"));
const xmlFiles = allFiles.filter((p) => p.toLowerCase().endsWith(".xml"));
const normalFiles = allFiles.filter(
  (p) => !p.toLowerCase().endsWith(".svg") && !p.toLowerCase().endsWith(".xml"),
);

console.log(
  `Tot files: ${allFiles.length} (normal=${normalFiles.length} svg=${svgFiles.length} xml=${xmlFiles.length})`,
);
if (VERBOSE) {
  console.log("--- Breakdown (sample) ---");
  console.log("Normal (first 60):");
  console.log(
    normalFiles.slice(0, 60).join("\n") +
      (normalFiles.length > 60 ? "\n... (troncato)\n" : ""),
  );
  console.log("SVG:");
  console.log(svgFiles.join("\n") || "(nessuno)");
  console.log("XML:");
  console.log(xmlFiles.join("\n") || "(nessuno)");
  console.log("--- end breakdown ---\n");
}

// dry-list: print final file list and exit
if (DRY_LIST) {
  console.log("\n-- DRY LIST --");
  console.log(allFiles.join("\n"));
  process.exit(0);
}

// determine prettier invocation: prefer local bin, then npm exec, then npx
let exeCmd = null,
  exeArgsBase = [];
const localPrettier = path.join(
  REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier",
);
if (fs.existsSync(localPrettier)) {
  exeCmd = localPrettier;
  exeArgsBase = [];
  vlog("Using local prettier bin:", localPrettier);
} else {
  const npmAvailable = safeExec("npm --version");
  if (npmAvailable) {
    exeCmd = "npm";
    exeArgsBase = ["exec", "--", "prettier"];
    vlog("Will use: npm exec -- prettier");
  } else {
    const npxAvailable = safeExec("npx --version");
    if (npxAvailable) {
      exeCmd = "npx";
      exeArgsBase = ["prettier"];
      vlog("Fallback to: npx prettier");
    } else {
      die(
        "Prettier non trovato: installa localmente (npm i -D prettier) o assicurati che npm/npx sia disponibile.",
      );
    }
  }
}

// runner: chunked to avoid CLI length limits
function runInChunks(files, extraArgs = []) {
  const CHUNK = 200;
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const mode = CHECK ? "--check" : "--write";
    const argsForSpawn = [...exeArgsBase, mode, ...extraArgs, ...chunk];
    console.log(
      `\nRunning: ${mode} on ${chunk.length} files (chunk ${Math.floor(i / CHUNK) + 1})...`,
    );
    if (VERBOSE) {
      console.log(
        "Command:",
        exeCmd,
        argsForSpawn.slice(0, 8).join(" "),
        argsForSpawn.length > 8 ? " ...(and more)" : "",
      );
    }
    const res = spawnSync(exeCmd, argsForSpawn, { stdio: "inherit" });
    if (res.error) die(`Errore eseguendo Prettier: ${res.error.message}`);
    if (res.status !== 0 && CHECK) {
      console.warn("Prettier check ha restituito exit != 0 per questo chunk.");
    } else if (res.status !== 0 && !CHECK) {
      die(`Prettier ha restituito status ${res.status}.`);
    }
  }
}

// 1) normal files
if (normalFiles.length) runInChunks(normalFiles);

// 2) svg files -> force parser html
if (svgFiles.length) {
  console.log("\nFormattazione SVG -> parser html");
  runInChunks(svgFiles, ["--parser", "html"]);
}

// 3) xml files -> robust plugin resolution and explicit plugin entry
if (xmlFiles.length) {
  let xmlPluginResolved = null;
  try {
    // try resolving package entry
    xmlPluginResolved = require.resolve("prettier-plugin-xml");
  } catch (e1) {
    try {
      // try resolving src plugin entry
      xmlPluginResolved = require.resolve("prettier-plugin-xml/src/plugin.js");
    } catch (e2) {
      // fallback: look for node_modules/prettier-plugin-xml/src/plugin.js
      const fallbackDir = path.join(
        REPO_ROOT,
        "node_modules",
        "prettier-plugin-xml",
      );
      const fallbackEntry = path.join(fallbackDir, "src", "plugin.js");
      if (fs.existsSync(fallbackEntry)) xmlPluginResolved = fallbackEntry;
    }
  }

  if (xmlPluginResolved) {
    console.log(
      "\nFormattazione XML (prettier-plugin-xml trovato). Uso plugin:",
      xmlPluginResolved,
    );
    runInChunks(xmlFiles, ["--plugin", xmlPluginResolved, "--parser", "xml"]);
  } else {
    console.log(
      "\nSaltando XML (impossibile risolvere prettier-plugin-xml).\n    Installa o aggiorna prettier-plugin-xml se vuoi formattare sitemap.xml",
    );
    if (VERBOSE) console.log("XML files skipped:", xmlFiles.join(", "));
  }
}

// git status + optional commit
const status = safeExec("git status --porcelain") || "";
if (!status.trim()) {
  console.log("\nNessuna modifica dopo formattazione.");
  process.exit(0);
}
console.log("\nModifiche rilevate dopo la formattazione:");
console.log(status.split("\n").slice(0, 200).join("\n"));

if (DO_COMMIT) {
  try {
    run("git add -A");
    run('git commit -m "chore(format): apply Prettier formatting"');
    console.log("Modifiche committate.");
  } catch (e) {
    console.error("Errore durante il commit:", e.message);
    process.exit(1);
  }
} else {
  console.log(
    "\nNon ho committato le modifiche (usa --commit per committare automaticamente).",
  );
}

console.log("Done.");
process.exit(0);
