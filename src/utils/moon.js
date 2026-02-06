// utils/moon.js
export const EMOJI_BY_KEY = {
  newMoon: "🌑",
  waxingCrescent: "🌒",
  firstQuarter: "🌓",
  waxingGibbous: "🌔",
  fullMoon: "🌕",
  waningGibbous: "🌖",
  lastQuarter: "🌗",
  waningCrescent: "🌘",
};

// kebab <-> camel normalisointi
const KEBAB_TO_CAMEL = {
  "new-moon": "newMoon",
  "waxing-crescent": "waxingCrescent",
  "first-quarter": "firstQuarter",
  "waxing-gibbous": "waxingGibbous",
  "full-moon": "fullMoon",
  "waning-gibbous": "waningGibbous",
  "last-quarter": "lastQuarter",
  "waning-crescent": "waningCrescent",
};
const CAMEL_TO_KEBAB = Object.fromEntries(
  Object.entries(KEBAB_TO_CAMEL).map(([k,v]) => [v,k])
);

/** Palauttaa { camel, kebab } – camel emojille, kebab i18n:lle */
export function normalizeMoonKey(k) {
  if (!k) return { camel: null, kebab: null };
  const s = String(k).trim();
  const camel = KEBAB_TO_CAMEL[s] || s;       // jos tuli kebab, muutetaan cameliksi
  const kebab = CAMEL_TO_KEBAB[camel] || s;   // tehdään myös kebab-versio i18n:ää varten
  return { camel, kebab };
}
