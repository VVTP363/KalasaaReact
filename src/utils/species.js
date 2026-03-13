// src/utils/species.js

// 1) Alias-taulukot kielittäin
const FI_ALIASES = {
  "Saimaan nieriä": "Saimaannieriä",
  "Saimaanieriä": "Saimaannieriä",
  "Saimaannieriä": "Saimaannieriä",
  "Särkikalat": "Särkikalat",
};

const EN_ALIASES = {
  Salmon: "Lohi",
  Trout: "Taimen",
  Char: "Rautu",
  "Saimaa char": "Saimaannieriä",
  Grayling: "Harjus",
  Whitefish: "Siika",
  "Pink salmon": "Kyttyrälohi",
  Cyprinids: "Särkikalat",
  Pike: "Hauki",
  Zander: "Kuha",
  Perch: "Ahven",
  Burbot: "Made",
  Vendace: "Muikku",
  Bream: "Lahna",
};

const SV_ALIASES = {
  Lax: "Lohi",
  Öring: "Taimen",
  Röding: "Rautu",
  Harr: "Harjus",
  Sik: "Siika",
  Puckellax: "Kyttyrälohi",
  Gädda: "Hauki",
  Gös: "Kuha",
  Abborre: "Ahven",
  Lake: "Made",
  Siklöja: "Muikku",
  Braxen: "Lahna",
};

const NO_ALIASES = {
  Laks: "Lohi",
  Ørret: "Taimen",
  Røye: "Rautu",
  Sik: "Siika",
  Pukkellaks: "Kyttyrälohi",
  Gjedde: "Hauki",
  Gjørs: "Kuha",
  Abbor: "Ahven",
  Lake: "Made",
};

// 2) Yhdistetty alias-sanakirja
// Huom: sama avain saa esiintyä vain kerran lopullisessa objektissa.
// Tässä Sik ja Lake tulevat vain kerran, vaikka ne toimivat sekä sv että no.
export const SPECIES_ALIASES = {
  ...FI_ALIASES,
  ...EN_ALIASES,
  ...SV_ALIASES,
  ...NO_ALIASES,
};

// 3) FI-kanoninen → pysyvä key (käännösavain)
export const FI_TO_KEY = {
  Lohi: "salmon",
  Taimen: "trout",
  Rautu: "char",
  Saimaannieriä: "saimaa_char",
  Harjus: "grayling",
  Siika: "whitefish",
  Kyttyrälohi: "pink_salmon",
  Hauki: "pike",
  Kuha: "zander",
  Ahven: "perch",
  Made: "burbot",
  Muikku: "vendace",
  Lahna: "bream",
  Särkikalat: "cyprinids",
};

// 4) Keyt tunnistetaan myös suoraan
const KNOWN_KEYS = new Set(Object.values(FI_TO_KEY));

// 5) Muunnos: mikä tahansa alias → pysyvä fish key
export function toFishKey(input) {
  if (!input) return "";

  const raw = String(input).trim();
  const aliased = SPECIES_ALIASES[raw] || raw;

  if (KNOWN_KEYS.has(aliased)) return aliased;
  if (FI_TO_KEY[aliased]) return FI_TO_KEY[aliased];

  return "";
}

// 6) Yhteensopivuus vanhaan käyttöön
export function normalizeSpecies(input) {
  return toFishKey(input);
}

// 7) Käännös fish.<key> kautta
export function translateSpecies(t, input) {
  const key = toFishKey(input);
  return key ? t(`fish.${key}`, { defaultValue: key }) : "";
}

// 8) Palauta FI-kanoninen nimi
export function toFiCanonical(input) {
  if (!input) return "";
  const raw = String(input).trim();
  return SPECIES_ALIASES[raw] || raw;
}