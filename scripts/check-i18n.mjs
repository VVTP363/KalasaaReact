import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LOCALES_DIR = path.resolve("src", "locales");

const localeFiles = {
  fi: path.join(LOCALES_DIR, "fi", "translation.json"),
  en: path.join(LOCALES_DIR, "en", "translation.json"),
  sv: path.join(LOCALES_DIR, "sv", "translation.json"),
  no: path.join(LOCALES_DIR, "no", "translation.json"),
};

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON-virhe tiedostossa ${filePath}: ${err.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenKeys(obj, prefix = "") {
  const result = new Map();

  if (!isPlainObject(obj)) return result;

  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      result.set(nextKey, { type: "object", value });
      const nested = flattenKeys(value, nextKey);
      for (const [nestedKey, nestedValue] of nested.entries()) {
        result.set(nestedKey, nestedValue);
      }
    } else if (Array.isArray(value)) {
      result.set(nextKey, { type: "array", value });
    } else {
      result.set(nextKey, { type: typeof value, value });
    }
  }

  return result;
}

function findEmptyStrings(obj, prefix = "", acc = []) {
  if (!isPlainObject(obj)) return acc;

  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      findEmptyStrings(value, nextKey, acc);
    } else if (typeof value === "string" && value.trim() === "") {
      acc.push(nextKey);
    }
  }

  return acc;
}

function compareLocaleToBase(baseName, baseMap, otherName, otherMap) {
  const missing = [];
  const extra = [];
  const typeMismatches = [];

  for (const [key, baseInfo] of baseMap.entries()) {
    if (!otherMap.has(key)) {
      missing.push(key);
      continue;
    }

    const otherInfo = otherMap.get(key);
    if (baseInfo.type !== otherInfo.type) {
      typeMismatches.push({
        key,
        baseType: baseInfo.type,
        otherType: otherInfo.type,
      });
    }
  }

  for (const key of otherMap.keys()) {
    if (!baseMap.has(key)) {
      extra.push(key);
    }
  }

  return { missing, extra, typeMismatches };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  console.log("🔍 i18n sanity checker käynnistyy...\n");

  for (const [locale, filePath] of Object.entries(localeFiles)) {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Tiedostoa ei löydy: ${locale} -> ${filePath}`);
      process.exit(1);
    }
  }

  const localeData = {};
  const flattened = {};
  let hasErrors = false;

  // 1. Lue ja parse kaikki JSONit
  for (const [locale, filePath] of Object.entries(localeFiles)) {
    try {
      localeData[locale] = readJson(filePath);
      flattened[locale] = flattenKeys(localeData[locale]);
      console.log(`✅ ${locale}: JSON OK`);
    } catch (err) {
      console.error(`❌ ${locale}: ${err.message}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  // 2. Tyhjät stringit
  printSection("Tyhjät käännösarvot");
  let hasEmptyStrings = false;

  for (const [locale, data] of Object.entries(localeData)) {
    const empty = findEmptyStrings(data);
    if (empty.length > 0) {
      hasEmptyStrings = true;
      console.log(`⚠️ ${locale}: ${empty.length} tyhjää arvoa`);
      empty.forEach((key) => console.log(`   - ${key}`));
    } else {
      console.log(`✅ ${locale}: ei tyhjiä arvoja`);
    }
  }

  // 3. Käytä fi:tä pohjana
  const baseLocale = "fi";
  const baseMap = flattened[baseLocale];

  printSection(`Vertailu pohjakieleen (${baseLocale})`);

  for (const locale of Object.keys(localeFiles)) {
    if (locale === baseLocale) continue;

    const result = compareLocaleToBase(
      baseLocale,
      baseMap,
      locale,
      flattened[locale]
    );

    const localeHasIssues =
      result.missing.length > 0 ||
      result.extra.length > 0 ||
      result.typeMismatches.length > 0;

    if (!localeHasIssues) {
      console.log(`✅ ${locale}: rakenne OK`);
      continue;
    }

    hasErrors = true;
    console.log(`❌ ${locale}: rakenteessa poikkeamia`);

    if (result.missing.length > 0) {
      console.log(`   Puuttuvat avaimet (${result.missing.length}):`);
      result.missing.forEach((key) => console.log(`   - ${key}`));
    }

    if (result.extra.length > 0) {
      console.log(`   Ylimääräiset avaimet (${result.extra.length}):`);
      result.extra.forEach((key) => console.log(`   + ${key}`));
    }

    if (result.typeMismatches.length > 0) {
      console.log(`   Tyyppivirheet (${result.typeMismatches.length}):`);
      result.typeMismatches.forEach((item) => {
        console.log(
          `   * ${item.key}: ${baseLocale}=${item.baseType}, ${locale}=${item.otherType}`
        );
      });
    }
  }

  // 4. Yhteenveto
  printSection("Yhteenveto");

  if (hasErrors || hasEmptyStrings) {
    if (hasErrors) {
      console.log("❌ i18n-tarkistus epäonnistui.");
    }
    if (hasEmptyStrings) {
      console.log("⚠️ i18n-tiedostoissa on tyhjiä käännösarvoja.");
    }
    process.exit(1);
  }

  console.log("✅ Kaikki i18n-tiedostot ovat kunnossa.");
  process.exit(0);
}

main();