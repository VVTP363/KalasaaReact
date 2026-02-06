// src/utils/species.js

// 1) Kaikki mahdolliset nimet (fi/en/sv/no) → FI-kanoninen
export const SPECIES_ALIASES = {
  // FI kirjoitusasut
  "Saimaan nieriä": "Saimaannieriä",
  "Saimaanieriä": "Saimaannieriä",
  "Saimaannieriä": "Saimaannieriä",
  "Särkikalat": "Särkikalat",

  // EN
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

  // SV
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

  // NO
  Laks: "Lohi",
  Ørret: "Taimen",
  Røye: "Rautu",
  Sik: "Siika",
  Pukkellaks: "Kyttyrälohi",
  Gjedde: "Hauki",
  Gjørs: "Kuha",
  Abbor: "Ahven",
  Lake: "Made",
  Sik: "Siika",
};

// 2) FI-kanoninen → pysyvä key (käännösavain)
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

// 3) Keyt tunnistetaan myös (jos dataan on joskus päätynyt jo key)
const KNOWN_KEYS = new Set(Object.values(FI_TO_KEY));

export function toFishKey(input) {
  if (!input) return "";

  const raw = String(input).trim();
  const aliased = SPECIES_ALIASES[raw] || raw;

  // jos käyttäjä/data antaa suoraan keyn, pidä se
  if (KNOWN_KEYS.has(aliased)) return aliased;

  // jos aliased on FI-kanoninen, mapataan keyksi
  if (FI_TO_KEY[aliased]) return FI_TO_KEY[aliased];

  // fallback: älä “arvaa” uutta keytä (tämä aiheutti teillä trout/hauki-caseja)
  return "";
}

export function normalizeSpecies(input) {
  return toFishKey(input);
}

export function translateSpecies(t, input) {
  const key = toFishKey(input);
  return key ? t(`fish.${key}`, { defaultValue: key }) : "";
}

export function toFiCanonical(input) {
  if (!input) return "";
  const raw = String(input).trim();
  return SPECIES_ALIASES[raw] || raw; // palauttaa FI-kanonisen nimen, esim "Lohi"
}
