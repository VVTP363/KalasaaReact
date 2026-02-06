import fs from "fs";
import path from "path";

const SRC_DIR = "./src";
const LOCALES_DIR = "./src/locales";
const LANGS = ["fi", "en", "sv", "no"];

function walk(dir, filelist = []) {
  fs.readdirSync(dir).forEach((file) => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) walk(full, filelist);
    else if (/\.(js|jsx|ts|tsx)$/.test(file)) filelist.push(full);
  });
  return filelist;
}

function flatten(obj, prefix = "") {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(acc, flatten(v, key));
    else acc[key] = v;
    return acc;
  }, {});
}

// Poimitaan:
// t("static.key")
// t('static.key')
// t(`static.key`)   (HUOM: ilman ${})
// t(`fish.${x}`) -> dynamic
function extract(content) {
  const out = { staticKeys: [], dynamicKeys: [] };

  // 1) t("...") ja t('...')
  const rxQuote = /\bt\s*\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = rxQuote.exec(content))) out.staticKeys.push(m[1]);

  // 2) t(`...`) backtick
  const rxTick = /\bt\s*\(\s*`([^`]+)`/g;
  while ((m = rxTick.exec(content))) {
    const s = m[1];
    if (s.includes("${")) out.dynamicKeys.push("`" + s + "`");
    else out.staticKeys.push(s);
  }

  return out;
}

function isSuspiciousKey(k) {
  const s = String(k ?? "").trim();
  if (!s) return true;
  if (s.length <= 2) return true;                 // "," "-" ":" "a" "T"
  if (/^https?:\/\//i.test(s)) return true;       // URL
  if (/\s/.test(s)) return true;                  // sisältää välilyöntejä => todennäk lause
  if (/^[\.,:\/-]+$/.test(s)) return true;        // pelkkiä merkkejä
  return false;
}

const files = walk(SRC_DIR);

const usedStatic = new Set();
const usedDynamic = new Set();
const suspicious = new Set();

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const { staticKeys, dynamicKeys } = extract(content);

  for (const k of staticKeys) {
    if (isSuspiciousKey(k)) suspicious.add(k);
    else usedStatic.add(k);
  }
  for (const d of dynamicKeys) usedDynamic.add(d);
}

console.log(`\n📌 Static keys in code: ${usedStatic.size}`);
console.log(`🧩 Dynamic key patterns: ${usedDynamic.size}`);
console.log(`⚠️ Suspicious keys: ${suspicious.size}\n`);

const localeFlat = {};
for (const lng of LANGS) {
  const file = path.join(LOCALES_DIR, lng, "translation.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  localeFlat[lng] = flatten(json);
}

// Missing (vain staattiset)
const missing = [];
for (const key of usedStatic) {
  for (const lng of LANGS) {
    if (!(key in localeFlat[lng])) missing.push({ lng, key });
  }
}

// Unused (vain staattisiin verrattuna)
const unused = [];
for (const lng of LANGS) {
  for (const key of Object.keys(localeFlat[lng])) {
    if (!usedStatic.has(key)) unused.push({ lng, key });
  }
}

console.log("❌ MISSING (static only):");
missing.forEach((x) => console.log(`Missing in ${x.lng}: ${x.key}`));

console.log("\n🧩 DYNAMIC (informational, not checked):");
[...usedDynamic].slice(0, 60).forEach((k) => console.log(k));
if (usedDynamic.size > 60) console.log(`...and ${usedDynamic.size - 60} more`);

console.log("\n⚠️ SUSPICIOUS (fix code, don’t add to JSON):");
[...suspicious].slice(0, 120).forEach((k) => console.log(k));
if (suspicious.size > 120) console.log(`...and ${suspicious.size - 120} more`);

console.log("\n🧹 UNUSED (may be ok, review):");
unused.slice(0, 200).forEach((x) => console.log(`Unused in ${x.lng}: ${x.key}`));
if (unused.length > 200) console.log(`...and ${unused.length - 200} more`);

console.log("\n✅ Done\n");
