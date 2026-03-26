// src/utils/getTimeFactor.js

/**
 * Muuntaa kellonajan desimaalitunniksi.
 * Hyväksyy:
 * - number: 13.5
 * - string: "13:30"
 * - Date-olion
 */
function toHourDecimal(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parts = value.split(":").map(Number);
    if (parts.length >= 2 && !parts.some(Number.isNaN)) {
      return parts[0] + parts[1] / 60;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() + value.getMinutes() / 60;
  }

  return null;
}

/**
 * Tunnistaa, osuuko hour välille start-end myös silloin,
 * kun väli menee vuorokauden yli (esim. 22.0 -> 4.0).
 */
function isInRange(hour, start, end) {
  if (
    [hour, start, end].some(
      (v) => typeof v !== "number" || Number.isNaN(v)
    )
  ) {
    return false;
  }

  if (start <= end) {
    return hour >= start && hour <= end;
  }

  // Vuorokauden yli menevä väli
  return hour >= start || hour <= end;
}

/**
 * Päivän pituuden mukaan määräytyvä "päivävoittoisen"
 * aktiivisuusjakson leveys tunteina.
 */
function getPeakWindowHours(dayLengthHours) {
  if (dayLengthHours <= 6) return 1;
  if (dayLengthHours <= 8) return 2;
  if (dayLengthHours <= 10) return 3;
  if (dayLengthHours <= 12) return 4;
  return 6;
}

/**
 * Normalisoi kalalajin nimen.
 */
function normalizeSpecies(species) {
  return String(species || "")
    .trim()
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("å", "a");
}

/**
 * Normalisoi vesistötyypin nimen.
 */
function normalizeWaterType(waterType) {
  return String(waterType || "")
    .trim()
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("å", "a");
}

/**
 * Päiväaktiiviset järvi-/merikalat:
 * - huippu auringonnousun jälkeen
 * - huippu iltapäivällä / keskipäivän jälkeen
 * - huippu ennen auringonlaskua
 * - muu päivä kohtalainen
 * - yö voimakkaasti vaimennettu
 *
 * Ryhmä 1:
 * hauki, ahven, siika, taimen järvellä, nieriä järvellä,
 * harjus järvellä, lohi järvellä/merellä, moni muu peruskala
 *
 * Kertoimet:
 * - päiväikkuna 1.0
 * - muu päivänvalo 0.6
 * - yö 0.25
 */
function getDayFishFactor(hour, sunrise, sunset) {
  const dayLength = sunset - sunrise;

  // varmistus poikkeustapauksiin
  if (dayLength <= 0) return 0.25;

  const peakWindowHours = getPeakWindowHours(dayLength);
  const midDay = sunrise + dayLength / 2;

  // Aamupiikki: noin 0.5 h ennen - 1 h jälkeen auringonnousun
  const morningStart = sunrise - 0.5;
  const morningEnd = sunrise + 1.0;

  // Iltapiikki: noin 1 h ennen auringonlaskua - 0.25 h sen jälkeen
  const eveningStart = sunset - 1.0;
  const eveningEnd = sunset + 0.25;

  // Päiväpiikki: keskipäivän jälkeen, ikkunan leveys riippuu päivän pituudesta
  const noonCenter = midDay + 0.75;
  const noonHalfWidth = peakWindowHours / 2;

  const noonStart = noonCenter - noonHalfWidth / 2;
  const noonEnd = noonCenter + noonHalfWidth / 2;

  const inMorningPeak = isInRange(hour, morningStart, morningEnd);
  const inEveningPeak = isInRange(hour, eveningStart, eveningEnd);
  const inNoonPeak = isInRange(hour, noonStart, noonEnd);

  if (inMorningPeak || inEveningPeak || inNoonPeak) {
    return 1.0;
  }

  // Päivänvalo mutta ei varsinaisessa huippuikkunassa
  if (hour >= sunrise - 0.5 && hour <= sunset) {
    return 0.6;
  }

  // Yövaimennus
  return 0.25;
}

/**
 * Kuha:
 * - iltahämärä paras
 * - aamuhämärä hyvä
 * - yö kohtalainen
 * - kirkas päivä heikompi
 *
 * Ryhmä 2
 *
 * Kertoimet:
 * - iltahämärä 1.0
 * - aamuhämärä 0.8
 * - yö 0.7
 * - kirkas päivä 0.5
 */
function getZanderFactor(hour, sunrise, sunset) {
  const eveningStart = sunset - 1.5;
  const eveningEnd = sunset + 2.0;

  const morningStart = sunrise - 1.0;
  const morningEnd = sunrise + 0.5;

  const inEvening = isInRange(hour, eveningStart, eveningEnd);
  const inMorning = isInRange(hour, morningStart, morningEnd);

  if (inEvening) return 1.0;
  if (inMorning) return 0.8;

  const isBrightDay = hour >= sunrise + 1.0 && hour <= sunset - 2.0;
  if (isBrightDay) return 0.5;

  // Yö / hämärä muualla
  return 0.7;
}

/**
 * Made:
 * - yö paras
 * - hämärä hyvä
 * - päivä heikko
 *
 * Ryhmä 3
 *
 * Kertoimet:
 * - yö 1.0
 * - hämärä 0.8
 * - päivä 0.3
 */
function getBurbotFactor(hour, sunrise, sunset) {
  const night1 = isInRange(hour, sunset + 0.5, 24);
  const night2 = isInRange(hour, 0, sunrise - 0.5);

  if (night1 || night2) {
    return 1.0;
  }

  const dawnTwilight = isInRange(hour, sunrise - 1.0, sunrise + 0.5);
  const duskTwilight = isInRange(hour, sunset - 0.5, sunset + 1.0);

  if (dawnTwilight || duskTwilight) {
    return 0.8;
  }

  return 0.3;
}

/**
 * Virtavesi:
 * - ei yövaimennusta
 * - lohikaloille käytännössä tasainen kerroin
 * - muillekin voidaan pitää lähes tasainen
 *
 * Ryhmä 4:
 * lohi, taimen, harjus, nieriä, siika virtavedessä
 *
 * Kertoimet:
 * - koko vuorokausi 1.0
 * - muille virtavesikaloille lähes tasainen 0.95
 */
function getRiverFactor(hour, sunrise, sunset, species) {
  const s = normalizeSpecies(species);

  const salmonids = [
    "lohi",
    "taimen",
    "harjus",
    "nieria",
    "siika",
    "salmon",
    "trout",
    "grayling",
    "char",
    "whitefish",
  ];

  const isNight =
    isInRange(hour, sunset + 0.5, 24) ||
    isInRange(hour, 0, sunrise - 0.5);

  const isTwilight =
    isInRange(hour, sunrise - 1.0, sunrise + 1.0) ||
    isInRange(hour, sunset - 1.0, sunset + 1.0);

  // 🟢 Lohikalat
  if (salmonids.includes(s)) {
    if (isNight) return 1.05;       // hieman parempi yöllä
    if (isTwilight) return 1.1;     // pieni nousupiikki
    return 1.0;                    // muuten tasainen
  }

  // 🟡 muut virtavesikalat
  if (isNight) return 0.9;
  if (isTwilight) return 1.0;
  return 0.95;
}

/**
 * Pääfunktio:
 * species: esim. "hauki", "kuha", "made", "lohi", "taimen"
 * waterType: esim. "lake", "sea", "river", "jarvi", "meri", "virtavesi"
 * hour: esim. 13.5 tai "13:30" tai Date
 * sunrise: esim. 5.5 tai "05:30"
 * sunset: esim. 21.25 tai "21:15"
 */
export function getTimeFactor(species, waterType, hour, sunrise, sunset) {
  const s = normalizeSpecies(species);
  const w = normalizeWaterType(waterType);

  const hourDec = toHourDecimal(hour);
  const sunriseDec = toHourDecimal(sunrise);
  const sunsetDec = toHourDecimal(sunset);

  if (
    [hourDec, sunriseDec, sunsetDec].some(
      (v) => typeof v !== "number" || Number.isNaN(v)
    )
  ) {
    return 1.0;
  }

  // Virtavedet: ei yövaimennusta, lohikaloille tasainen 1.0
  if (["river", "virtavesi", "joki", "stream", "flowing"].includes(w)) {
    return getRiverFactor(hourDec, sunriseDec, sunsetDec, s);
  }

  // Kuha = hämäräpainotteinen
  if (["kuha", "zander", "pikeperch", "sander"].includes(s)) {
    return getZanderFactor(hourDec, sunriseDec, sunsetDec);
  }

  // Made = yöaktiivinen
  if (["made", "burbot"].includes(s)) {
    return getBurbotFactor(hourDec, sunriseDec, sunsetDec);
  }

  // Kaikki muut järvi-/merikalat:
  // hauki, ahven, siika, taimen järvellä, nieriä järvellä,
  // harjus järvellä, lohi jne. -> päiväaktiivinen oletus
  return getDayFishFactor(hourDec, sunriseDec, sunsetDec);
}

export default getTimeFactor;