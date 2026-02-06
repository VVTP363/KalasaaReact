// i18n-autofill.js  (ESM, toimii kun package.json:ssa "type":"module")
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, "src", "locales");
const LANGS = ["fi", "en", "sv", "no"];
const MASTER = "fi";

// ✅ valinta: miten täytetään puuttuvat
// "copy-fi" = kopioi suomenkielinen teksti
// "todo"    = asettaa "TODO: <fi-teksti>"
const MODE = "TODO";

// ✅ jos haluat jättää tietyt avainpolut koskematta (esim. iso fish.* tms)
const SKIP_PREFIXES = [
  // "fish.", // <-- ota käyttöön jos haluat jättää fish.* kokonaan rauhaan
];

// ---------------- utils ----------------

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, obj) {
  const out = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(filePath, out, "utf8");
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function shouldSkipKeyPath(keyPath) {
  return SKIP_PREFIXES.some((p) => keyPath === p || keyPath.startsWith(p));
}

/**
 * Merge master -> target:
 * - adds missing keys from master
 * - keeps existing target keys untouched
 * - recurses into objects
 * Returns: { changed: boolean, added: string[] }
 */
function mergeFromMaster(masterObj, targetObj, basePath = "") {
  let changed = false;
  const added = [];

  // ensure target is object if master is object
  if (!isPlainObject(targetObj)) targetObj = {};

  for (const key of Object.keys(masterObj)) {
    const keyPath = basePath ? `${basePath}.${key}` : key;
    if (shouldSkipKeyPath(keyPath)) continue;

    const mVal = masterObj[key];
    const tHas = Object.prototype.hasOwnProperty.call(targetObj, key);
    const tVal = targetObj[key];

    if (!tHas) {
      // add missing
      if (isPlainObject(mVal)) {
        targetObj[key] = {};
        const res = mergeFromMaster(mVal, targetObj[key], keyPath);
        if (res.changed) changed = true;
        added.push(...res.added);
      } else {
        if (MODE === "todo" && typeof mVal === "string" && mVal.trim()) {
          targetObj[key] = `TODO: ${mVal}`;
        } else {
          targetObj[key] = mVal;
        }
        changed = true;
        added.push(keyPath);
      }
      continue;
    }

    // if both objects -> recurse
    if (isPlainObject(mVal) && isPlainObject(tVal)) {
      const res = mergeFromMaster(mVal, tVal, keyPath);
      if (res.changed) changed = true;
      added.push(...res.added);
    }

    // else: keep target as-is
  }

  return { changed, added };
}

function localePath(lang) {
  return path.join(LOCALES_DIR, lang, "translation.json");
}

// ---------------- main ----------------

function main() {
  // sanity
  for (const l of LANGS) {
    const p = localePath(l);
    if (!fs.existsSync(p)) {
      console.error(`❌ Missing file: ${p}`);
      process.exit(1);
    }
  }

  const masterPath = localePath(MASTER);
  const master = readJson(masterPath);

  console.log(`🧠 Master: ${MASTER} (${masterPath})`);
  console.log(`⚙️  MODE: ${MODE}`);
  if (SKIP_PREFIXES.length) console.log(`⛔ SKIP_PREFIXES: ${SKIP_PREFIXES.join(", ")}`);
  console.log("");

  let totalAdded = 0;

  for (const lang of LANGS) {
    if (lang === MASTER) continue;

    const p = localePath(lang);
    const target = readJson(p);

    const before = JSON.stringify(target);
    const { changed, added } = mergeFromMaster(master, target);

    if (changed) {
      writeJson(p, target);
      totalAdded += added.length;
      console.log(`✅ ${lang}: added ${added.length} keys`);
      // list a few
      if (added.length) {
        const sample = added.slice(0, 25);
        console.log("   + " + sample.join("\n   + "));
        if (added.length > sample.length) console.log(`   ... +${added.length - sample.length} more`);
      }
    } else {
      console.log(`👌 ${lang}: nothing to add`);
    }

    const after = JSON.stringify(readJson(p));
    if (before !== after && !changed) {
      console.log(`⚠️  ${lang}: file changed but 'changed' flag false (unexpected)`);
    }

    console.log("");
  }

  console.log(`🎉 Done. Total added keys: ${totalAdded}`);
}

main();
