// src/utils/calculateOHFinal.js
import getTimeFactor from "./getTimeFactor";

/**
 * Rajaa arvon välille min-max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Muuntaa kellonajan desimaalitunniksi.
 * Hyväksyy:
 * - number: 13.5
 * - string: "13:30"
 * - Date-olio
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
 * Normalisoi tekstin vertailua varten
 */
function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("å", "a");
}

/**
 * Tuulensuunnan muunto asteiksi.
 * Hyväksyy numeron tai ilmansuunnan tekstinä.
 */
function parseWindDirection(windDirection) {
  if (typeof windDirection === "number" && !Number.isNaN(windDirection)) {
    return ((windDirection % 360) + 360) % 360;
  }

  const dir = normalizeText(windDirection);

  const map = {
    n: 0,
    north: 0,
    pohjoinen: 0,

    ne: 45,
    koillinen: 45,
    northeast: 45,

    e: 90,
    east: 90,
    ita: 90,

    se: 135,
    kaakko: 135,
    southeast: 135,

    s: 180,
    south: 180,
    etela: 180,

    sw: 225,
    lounas: 225,
    southwest: 225,

    w: 270,
    west: 270,
    lansi: 270,

    nw: 315,
    luode: 315,
    northwest: 315,
  };

  return map[dir] ?? null;
}

/**
 * Kuunvaiheen normalisointi välille 0..1
 *
 * Oletus:
 * 0.0 = uusikuu
 * 0.25 = ensimmäinen neljännes
 * 0.5 = täysikuu
 * 0.75 = viimeinen neljännes
 * 1.0 = uusikuu
 *
 * Jos käyttäjällä on jo valmiiksi eri asteikko, tämän voi vaihtaa.
 */
function normalizeMoonPhase(moonPhase) {
  if (typeof moonPhase === "number" && !Number.isNaN(moonPhase)) {
    if (moonPhase >= 0 && moonPhase <= 1) return moonPhase;
    if (moonPhase >= 0 && moonPhase <= 100) return moonPhase / 100;
  }

  const phase = normalizeText(moonPhase);

  const map = {
    uusikuu: 0.0,
    newmoon: 0.0,
    new: 0.0,

    ensimmainen neljannes: 0.25,
    firstquarter: 0.25,
    first_quarter: 0.25,

    taysikuu: 0.5,
    fullmoon: 0.5,
    full: 0.5,

    viimeinen neljannes: 0.75,
    lastquarter: 0.75,
    last_quarter: 0.75,
    thirdquarter: 0.75,
    third_quarter: 0.75,
  };

  return map[phase] ?? 0.5;
}

/**
 * Ilmanpainekerroin.
 * Tätä voi hienosäätää myöhemmin saalisdatan perusteella.
 */
export function getPressureFactor(pressure) {
  const p = Number(pressure);

  if (Number.isNaN(p)) return 1.0;

  if (p < 992) return 1.1;
  if (p < 1000) return 1.4;
  if (p <= 1010) return 1.2;
  return 1.0;
}

/**
 * Tuulensuuntakerroin.
 *
 * Koska olet aiemmin painottanut, että tuuli vaikuttaa enemmän kalojen sijoittumiseen
 * kuin suoraan syöntiin, pidetään tämän vaikutus maltillisena.
 *
 * Tässä yleinen malli:
 * - pohjoisenpuoleiset ja koillinen hieman heikompi
 * - etelä/lounas/länsi hieman parempi
 * - vaikutus pysyy pienenä
 */
export function getWindFactor(windDirection) {
  const deg = parseWindDirection(windDirection);

  if (deg === null) return 1.0;

  if ((deg >= 315 && deg <= 360) || (deg >= 0 && deg < 45)) return 0.95; // N
  if (deg >= 45 && deg < 90) return 0.97;   // NE
  if (deg >= 90 && deg < 135) return 1.0;   // E
  if (deg >= 135 && deg < 180) return 1.03; // SE
  if (deg >= 180 && deg < 225) return 1.05; // S
  if (deg >= 225 && deg < 270) return 1.08; // SW
  if (deg >= 270 && deg < 315) return 1.03; // W

  return 1.0;
}

/**
 * Kuunvaihekerroin.
 *
 * Esimerkkimalli:
 * - täysikuu hieman vahvempi
 * - puolikuut hyviä
 * - uusikuu hieman hillitympi
 *
 * Tätäkin voi myöhemmin lajikohtaistaa.
 */
export function getMoonFactor(moonPhase) {
  const phase = normalizeMoonPhase(moonPhase);

  // Etäisyys täysikuusta (0.5)
  const distanceFromFull = Math.abs(phase - 0.5);

  // 0 => täysikuu, 0.5 => uusikuu
  // Skaalataan karkeasti välille 0.9 - 1.2
  const factor = 1.2 - distanceFromFull * 0.6;

  return clamp(Number(factor.toFixed(3)), 0.9, 1.2);
}

/**
 * Skaalaa raakakertoimen asteikolle 1-8
 */
export function scaleOHToEight(rawValue) {
  const value = Number(rawValue);

  if (Number.isNaN(value) || value <= 0) return 1;

  // Käytännön vaihteluväli usein noin 0.2 - 2.0
  const minRaw = 0.2;
  const maxRaw = 2.0;

  const normalized = clamp((value - minRaw) / (maxRaw - minRaw), 0, 1);
  return Math.round(1 + normalized * 7);
}

/**
 * Skaalaa raakakertoimen asteikolle 1-4
 */
export function scaleOHToFour(rawValue) {
  const value = Number(rawValue);

  if (Number.isNaN(value) || value <= 0) return 1;

  const minRaw = 0.2;
  const maxRaw = 2.0;

  const normalized = clamp((value - minRaw) / (maxRaw - minRaw), 0, 1);
  return Math.round(1 + normalized * 3);
}

/**
 * Pääfunktio:
 *
 * Palauttaa:
 * {
 *   pressureFactor,
 *   windFactor,
 *   moonFactor,
 *   timeFactor,
 *   rawOH,
 *   finalOH,
 *   oh8,
 *   oh4
 * }
 */
export function calculateOHFinal({
  species,
  waterType,
  hour,
  sunrise,
  sunset,
  pressure,
  windDirection,
  moonPhase,
}) {
  const pressureFactor = getPressureFactor(pressure);
  const windFactor = getWindFactor(windDirection);
  const moonFactor = getMoonFactor(moonPhase);

  const timeFactor = getTimeFactor(
    species,
    waterType,
    hour,
    sunrise,
    sunset
  );

  // Perusmalli
  const rawOH = pressureFactor * windFactor * moonFactor;

  // Lopullinen OH aikapainotuksella
  const finalOH = rawOH * timeFactor;

  return {
    pressureFactor: Number(pressureFactor.toFixed(3)),
    windFactor: Number(windFactor.toFixed(3)),
    moonFactor: Number(moonFactor.toFixed(3)),
    timeFactor: Number(timeFactor.toFixed(3)),
    rawOH: Number(rawOH.toFixed(3)),
    finalOH: Number(finalOH.toFixed(3)),
    oh8: scaleOHToEight(finalOH),
    oh4: scaleOHToFour(finalOH),
  };
}

export default calculateOHFinal;