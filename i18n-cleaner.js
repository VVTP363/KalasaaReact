import fs from "fs";
import path from "path";

const LOCALES_DIR = "./src/locales";
const langs = ["fi", "en", "sv", "no"];

function flatten(obj, prefix = "", res = {}) {
  for (const k in obj) {
    const val = obj[k];
    const newKey = prefix ? `${prefix}.${k}` : k;

    if (typeof val === "object" && val !== null) {
      flatten(val, newKey, res);
    } else {
      res[newKey] = val;
    }
  }
  return res;
}

// Lataa kaikki kielet
const translations = {};
for (const lang of langs) {
  const file = path.join(LOCALES_DIR, lang, "translation.json");
  translations[lang] = JSON.parse(fs.readFileSync(file, "utf-8"));
}

// FI = master
const masterFlat = flatten(translations.fi);

// Kerää kaikki käytössä olevat avaimet
const usedKeys = new Set(Object.keys(masterFlat));

// Poista muista kielistä avaimet joita ei ole FI:ssä
for (const lang of langs) {
  if (lang === "fi") continue;

  const flat = flatten(translations[lang]);
  const cleaned = {};

  for (const key of Object.keys(flat)) {
    if (usedKeys.has(key)) {
      cleaned[key] = flat[key];
    }
  }

  // Rakenna takaisin nested-muoto
  const rebuilt = {};
  for (const key in cleaned) {
    const parts = key.split(".");
    let ref = rebuilt;

    parts.forEach((p, i) => {
      if (i === parts.length - 1) {
        ref[p] = cleaned[key];
      } else {
        ref[p] ??= {};
        ref = ref[p];
      }
    });
  }

  const outPath = path.join(LOCALES_DIR, lang, "translation.json");
  fs.writeFileSync(outPath, JSON.stringify(rebuilt, null, 2));

  console.log(`✅ Cleaned ${lang}`);
}

console.log("🎉 i18n clean done");
