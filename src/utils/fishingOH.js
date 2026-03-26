// src/utils/fishingOH.js
import getTimeFactor from "./getTimeFactor";

// ————— Pienet yleisapurit —————
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Muuntaa biologisen aikakertoimen OH-asteikolle sopivaksi.
// soft   = kevyt vaimennus
// medium = suositus
// hard   = voimakas vaimennus
function normalizeTimeFactorForOH(timeFactor, mode = "medium") {
  const tf = Number(timeFactor);
  if (!Number.isFinite(tf)) return 1.0;

  if (mode === "soft") {
    // 0.25 -> 0.85, 0.6 -> 0.92, 1.0 -> 1.0
    return clamp(0.8 + tf * 0.2, 0.8, 1.0);
  }

  if (mode === "hard") {
    // suora biologinen vaikutus
    return clamp(tf, 0.25, 1.0);
  }

  // medium
  // 0.25 -> ~0.65, 0.6 -> ~0.81, 1.0 -> 1.0
  return clamp(0.533 + tf * 0.467, 0.65, 1.0);
}

// ————— Painekerroin (NYKYINEN) —————
export function getPressureFactor(pressure) {
  if (pressure <= 988) return 1.2;
  if (pressure <= 993) return 1.75;
  if (pressure <= 998) return 1.85;
  if (pressure <= 1005) return 1.9;
  if (pressure <= 1013) return 1.95;
  if (pressure <= 1018) return 2.0;
  if (pressure <= 1028) return 1.7;
  return 1.0;
}

// ————— Pienet apurifunktiot (NYKYISET) —————
function ema(arr, a = 0.3) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.reduce((s, x, i) => (i === 0 ? x : a * x + (1 - a) * s), arr[0]);
}

// hPa/h lineaariregression kaltevuus; syöte newest->older
function slopeHpaPerHour(pressures) {
  if (!Array.isArray(pressures) || pressures.length < 4) return 0;
  const arr = [...pressures].reverse(); // oldest->newest
  const n = arr.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xbar = (n - 1) / 2;
  const ybar = arr.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xbar;
    num += dx * (arr[i] - ybar);
    den += dx * dx;
  }

  if (den === 0) return 0;
  return num / den; // hPa per hour
}

// Luokitus + override-sääntö (NYKYINEN)
function classifyPressureChange(press /* newest -> older */) {
  if (!Array.isArray(press) || press.length < 4) {
    return { level: "insufficient", slope: 0, dP6h: 0, override: false };
  }

  const now = press[0];
  const past6 = press[6] ?? press[press.length - 1]; // fallback
  const dP6h = Number.isFinite(past6) ? now - past6 : 0;
  const s = slopeHpaPerHour(press);
  const absS = Math.abs(s);
  const absD = Math.abs(dP6h);

  // VOIMAKAS muutos (molempiin suuntiin) ⇒ OH = 8/8
  if (absS >= 1.2 || absD >= 8) {
    return { level: "strong", slope: s, dP6h, override: true };
  }

  if (absS >= 0.5 || absD >= 4) {
    return { level: "medium", slope: s, dP6h, override: false };
  }

  return { level: "weak", slope: s, dP6h, override: false };
}

// Palauttaa trendikertoimen; 999 ⇒ override (NYKYINEN)
export function pressureTrendFactor(press /* newest -> older */) {
  if (!Array.isArray(press) || press.length < 4) {
    return { factor: 1.0, meta: { level: "insufficient", override: false } };
  }

  const now = press[0];
  const emaBase = ema(press.slice(1, 7), 0.3); // ~6h taakse
  const dP_ema = Number.isFinite(emaBase) ? now - emaBase : 0;

  const { level, slope, dP6h, override } = classifyPressureChange(press);

  if (override) {
    return {
      factor: 999,
      meta: { level, slope, dP6h, dP_ema, override: true },
    };
  }

  // Luokkapohjainen perusboosti (molemmat suunnat nostavat)
  let base = 1.1; // weak
  if (level === "medium") base = 1.3;

  // Hienosäätö EMA-erolla (molempiin suuntiin)
  const extra = 1 + 0.03 * Math.min(6, Math.abs(dP_ema)); // max ~ +0.18
  const f = Math.min(1.6, Math.max(1.0, base * extra));

  return {
    factor: f,
    meta: { level, slope, dP6h, dP_ema, override: false },
  };
}

// ————— Perus-OH (NYKYINEN) —————
export function calculateFishingPrediction(windDir, pressure, moonPhaseKey) {
  let windFactor = 1;

  if (windDir >= 0 && windDir <= 90) windFactor = 1.0;
  else if (windDir > 90 && windDir <= 135) windFactor = 1.1;
  else if (windDir > 135 && windDir <= 270) windFactor = 2;
  else if (windDir > 270 && windDir <= 310) windFactor = 1.5;
  else if (windDir > 310 && windDir <= 360) windFactor = 1.3;

  const pressureFactor = getPressureFactor(pressure);

  let moonFactor = 1;
  if (moonPhaseKey === "waxingCrescent") moonFactor = 1.5;
  else if (moonPhaseKey === "firstQuarter") moonFactor = 1.85;
  else if (moonPhaseKey === "fullMoon") moonFactor = 2;
  else if (moonPhaseKey === "waningGibbous") moonFactor = 1.7;
  else if (moonPhaseKey === "lastQuarter") moonFactor = 1.1;
  else if (moonPhaseKey === "newMoon") moonFactor = 1.3;

  const rawOH = pressureFactor * windFactor * moonFactor;
  return Math.min(8, Math.max(1, Math.round(rawOH)));
}

// ————— UUSI: aurinkoajat per päivä —————

function parseTimeToDecimalHours(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  // "05:42"
  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hh = Number(hhmmMatch[1]);
    const mm = Number(hhmmMatch[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return hh + mm / 60;
    }
  }

  // "2026-03-24T05:42:00Z" tai muu Date-parsittava
  const dt = new Date(trimmed);
  if (!Number.isNaN(dt.getTime())) {
    return dt.getHours() + dt.getMinutes() / 60;
  }

  return null;
}

function decimalHoursToHHMM(value) {
  if (!Number.isFinite(value)) return null;

  let hours = Math.floor(value);
  let minutes = Math.round((value - hours) * 60);

  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }

  hours = ((hours % 24) + 24) % 24;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function firstFinite(...values) {
  for (const v of values) {
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Hakee aurinkoajat yhdelle päivälle forecast-datasta.
 *
 * Tukee useita mahdollisia rakenteita, esim:
 *
 * forecast[dateKey].sunrise
 * forecast[dateKey].sunset
 *
 * forecast[dateKey].Sunrise
 * forecast[dateKey].Sunset
 *
 * forecast[dateKey].astro.sunrise
 * forecast[dateKey].astro.sunset
 *
 * forecast[dateKey]["00"].sunrise
 * forecast[dateKey]["00"].sunset
 *
 * forecast[dateKey]["12"].sunrise
 * forecast[dateKey]["12"].sunset
 *
 * fallback:
 * {
 *   sunrise: "05:42",
 *   sunset: "20:11"
 * }
 */
export function getSunTimesForDate(forecast, dateKey, fallback = {}) {
  const day = forecast?.[dateKey];
  if (!day) {
    const fbSunriseHour = parseTimeToDecimalHours(fallback?.sunrise);
    const fbSunsetHour = parseTimeToDecimalHours(fallback?.sunset);

    return {
      sunrise: firstNonEmpty(fallback?.sunrise, decimalHoursToHHMM(fbSunriseHour)),
      sunset: firstNonEmpty(fallback?.sunset, decimalHoursToHHMM(fbSunsetHour)),
      sunriseHour: fbSunriseHour,
      sunsetHour: fbSunsetHour,
      source: "fallback-no-day",
    };
  }

  // 1) Päivätason kentät
  const directSunrise =
    day?.sunrise ??
    day?.Sunrise ??
    day?.sunRise ??
    day?.sun_rise ??
    day?.astro?.sunrise ??
    day?.astro?.Sunrise;

  const directSunset =
    day?.sunset ??
    day?.Sunset ??
    day?.sunSet ??
    day?.sun_set ??
    day?.astro?.sunset ??
    day?.astro?.Sunset;

  // 2) Tuntitason kentät, jos päiväkohtaisia ei ole
  const probeHours = ["00", "06", "12", "18", "23"];

  let hourlySunrise = null;
  let hourlySunset = null;

  for (const hk of probeHours) {
    const entry = day?.[hk];
    if (!entry) continue;

    if (!hourlySunrise) {
      hourlySunrise =
        entry?.sunrise ??
        entry?.Sunrise ??
        entry?.sunRise ??
        entry?.sun_rise ??
        entry?.astro?.sunrise ??
        entry?.astro?.Sunrise ??
        null;
    }

    if (!hourlySunset) {
      hourlySunset =
        entry?.sunset ??
        entry?.Sunset ??
        entry?.sunSet ??
        entry?.sun_set ??
        entry?.astro?.sunset ??
        entry?.astro?.Sunset ??
        null;
    }

    if (hourlySunrise && hourlySunset) break;
  }

  const sunriseRaw = directSunrise ?? hourlySunrise ?? fallback?.sunrise ?? null;
  const sunsetRaw = directSunset ?? hourlySunset ?? fallback?.sunset ?? null;

  const sunriseHour = parseTimeToDecimalHours(sunriseRaw);
  const sunsetHour = parseTimeToDecimalHours(sunsetRaw);

  return {
    sunrise: firstNonEmpty(
      typeof sunriseRaw === "string" ? sunriseRaw : null,
      decimalHoursToHHMM(sunriseHour)
    ),
    sunset: firstNonEmpty(
      typeof sunsetRaw === "string" ? sunsetRaw : null,
      decimalHoursToHHMM(sunsetHour)
    ),
    sunriseHour,
    sunsetHour,
    source:
      directSunrise || directSunset
        ? "day-level"
        : hourlySunrise || hourlySunset
        ? "hour-level"
        : "fallback",
  };
}
// ————— UUSI: Perus-OH + aikakerroin —————
export function calculateFishingPredictionWithTime({
  windDirection,
  pressure,
  moonPhaseKey,
  species,
  waterType,
  hour,
  sunrise,
  sunset,
  timeMode = "medium",
}) {
  const p = Number(pressure);
  const w = Math.round(Number(windDirection));

  if (!Number.isFinite(p) || !Number.isFinite(w)) return null;

  const baseOH = calculateFishingPrediction(w, p, moonPhaseKey);

  const biologicalTimeFactor = getTimeFactor(
    species,
    waterType,
    hour,
    sunrise,
    sunset
  );

  const adjustedTimeFactor = normalizeTimeFactorForOH(
    biologicalTimeFactor,
    timeMode
  );

  return Math.round(clamp(baseOH * adjustedTimeFactor, 1, 8));
}

// ————— OH + mennyt trendi (NYKYINEN) —————
export function computeOH({ pressure, windDirection, moonPhaseKey, pastPressures }) {
  const p = Number(pressure);
  const w = Math.round(Number(windDirection));

  if (!Number.isFinite(p) || !Number.isFinite(w)) return null;

  const base = calculateFishingPrediction(w, p, moonPhaseKey);

  // Jos ei trendifeediä, palauta vanha
  if (!Array.isArray(pastPressures) || pastPressures.length < 4) return base;

  const { factor } = pressureTrendFactor(pastPressures);
  if (factor === 999) return 8; // override

  const OH = Math.round(Math.max(1, Math.min(8, base * factor)));
  return OH;
}

// ————— UUSI: OH + mennyt trendi + aikakerroin —————
export function computeOHWithTime({
  pressure,
  windDirection,
  moonPhaseKey,
  pastPressures,
  species,
  waterType,
  hour,
  sunrise,
  sunset,
  timeMode = "medium",
}) {
  const baseOH = computeOH({
    pressure,
    windDirection,
    moonPhaseKey,
    pastPressures,
  });

  if (!Number.isFinite(baseOH)) return null;

  const biologicalTimeFactor = getTimeFactor(
    species,
    waterType,
    hour,
    sunrise,
    sunset
  );

  const adjustedTimeFactor = normalizeTimeFactorForOH(
    biologicalTimeFactor,
    timeMode
  );

  return Math.round(clamp(baseOH * adjustedTimeFactor, 1, 8));
}

// ————— UUSI: tulevan 6h vaikutus (abs muutos) —————
// Palauttaa { factor, override, dP6hFwd }. Syöte: now = nykyinen hPa,
// futureArr = [t+1h, t+2h, ...], pituus 1..6 (tai enemmän).
function forwardChangeFactor(now, futureArr) {
  if (!Number.isFinite(now) || !Array.isArray(futureArr) || futureArr.length === 0) {
    return { factor: 1.0, override: false, dP6hFwd: 0 };
  }

  // käytä 6. tuntia tai viimeistä saatavilla
  const p6 = futureArr[Math.min(5, futureArr.length - 1)];
  const dP6h = Number(p6) - Number(now); // tuleva muutos
  const absD = Math.abs(dP6h);

  // VOIMAKAS muutos → override, sama raja-arvo kuin menneessä
  if (absD >= 8) return { factor: 999, override: true, dP6hFwd: dP6h };

  // perusboosti: 0–4 → ~1.10, 4–8 → ~1.30 (+ pieni hienosäätö)
  const base = absD >= 4 ? 1.3 : 1.1;
  const extra = 1 + 0.03 * Math.min(6, absD); // max ~ +0.18
  const f = Math.min(1.6, Math.max(1.0, base * extra));

  return { factor: f, override: false, dP6hFwd: dP6h };
}

// ————— UUSI: päivärajat ylittävä paineiden keruu —————

// Olettaa dateKeyt muodossa "YYYY-MM-DD", jolloin sort toimii oikein.
function getSortedDateKeys(forecast) {
  return Object.keys(forecast || {}).sort();
}

function getDateIndex(dateKeys, dateKey) {
  return dateKeys.indexOf(dateKey);
}

function getHourEntry(forecast, dateKey, hourNum) {
  if (!forecast?.[dateKey]) return null;
  const key = String(hourNum).padStart(2, "0");
  return forecast[dateKey][key] ?? null;
}

/**
 * Hakee menneet paineet muodossa newest -> older
 * myös edellisen päivän puolelta.
 *
 * Esim. klo 02:
 * 02, 01, 00, sitten edellisen päivän 23, 22, 21...
 */
export function collectPastPressures(forecast, dateKey, hourNum, count = 7) {
  const out = [];
  const dateKeys = getSortedDateKeys(forecast);
  const startDateIndex = getDateIndex(dateKeys, dateKey);

  if (startDateIndex === -1) return out;

  let d = startDateIndex;
  let h = Number(hourNum);

  while (d >= 0 && out.length < count) {
    const currentDateKey = dateKeys[d];

    for (; h >= 0 && out.length < count; h--) {
      const entry = getHourEntry(forecast, currentDateKey, h);
      if (entry && Number.isFinite(entry.Pressure)) {
        out.push(Number(entry.Pressure)); // newest -> older
      }
    }

    d -= 1;
    h = 23;
  }

  return out;
}

/**
 * Hakee tulevat paineet muodossa [t+1h, t+2h, ...]
 * myös seuraavan päivän puolelta.
 *
 * Esim. klo 22:
 * 23, sitten seuraavan päivän 00, 01, 02...
 */
export function collectFuturePressures(forecast, dateKey, hourNum, count = 6) {
  const out = [];
  const dateKeys = getSortedDateKeys(forecast);
  const startDateIndex = getDateIndex(dateKeys, dateKey);

  if (startDateIndex === -1) return out;

  let d = startDateIndex;
  let h = Number(hourNum) + 1;

  while (d < dateKeys.length && out.length < count) {
    const currentDateKey = dateKeys[d];

    for (; h < 24 && out.length < count; h++) {
      const entry = getHourEntry(forecast, currentDateKey, h);
      if (entry && Number.isFinite(entry.Pressure)) {
        out.push(Number(entry.Pressure)); // [t+1h, t+2h, ...]
      }
    }

    d += 1;
    h = 0;
  }

  return out;
}

// ————— UUSI EKSPORTTI: bidirectionaalinen OH —————
// Käyttö: syötä sekä menneet (newest->older) että tulevat ([t+1h,...]) paineet.
// Jos jompikumpi trendi antaa override'n, tulos = 8/8.
export function computeOHBidirectional({
  pressure,
  windDirection,
  moonPhaseKey,
  pastPressures, // newest->older
  futurePressures, // [t+1h, t+2h, ...]
}) {
  const p = Number(pressure);
  const w = Math.round(Number(windDirection));

  if (!Number.isFinite(p) || !Number.isFinite(w)) return null;

  // 1) perus (tuuli + painearvo + kuu)
  const base = calculateFishingPrediction(w, p, moonPhaseKey);

  // 2) jos ei trendejä, palauta base
  const hasPast = Array.isArray(pastPressures) && pastPressures.length >= 4;
  const hasFwd = Array.isArray(futurePressures) && futurePressures.length >= 1;
  if (!hasPast && !hasFwd) return base;

  // 3) mennyt trendi
  let pastFactor = 1.0;
  let pastOverride = false;
  if (hasPast) {
    const { factor, meta } = pressureTrendFactor(pastPressures);
    pastFactor = factor;
    pastOverride = factor === 999 || meta?.override === true;
  }

  // 4) tuleva trendi
  let fwdFactor = 1.0;
  let fwdOverride = false;
  if (hasFwd) {
    const nowRef =
      Array.isArray(pastPressures) && Number.isFinite(pastPressures[0])
        ? Number(pastPressures[0])
        : p;

    const res = forwardChangeFactor(nowRef, futurePressures);
    fwdFactor = res.factor;
    fwdOverride = res.override;
  }

  // 5) override jos jompikumpi vahva
  if (pastOverride || fwdOverride) return 8;

  // 6) valitse vahvempi boosti
  const factor = Math.max(pastFactor || 1.0, fwdFactor || 1.0);

  // 7) skaalaa ja rajaa 1–8
  return Math.round(Math.max(1, Math.min(8, base * factor)));
}

// ————— UUSI: bidirectionaalinen OH + aikakerroin —————
export function computeOHBidirectionalWithTime({
  pressure,
  windDirection,
  moonPhaseKey,
  pastPressures,
  futurePressures,
  species,
  waterType,
  hour,
  sunrise,
  sunset,
  timeMode = "medium",
}) {
  const baseOH = computeOHBidirectional({
    pressure,
    windDirection,
    moonPhaseKey,
    pastPressures,
    futurePressures,
  });

  if (!Number.isFinite(baseOH)) return null;

  const biologicalTimeFactor = getTimeFactor(
    species,
    waterType,
    hour,
    sunrise,
    sunset
  );

  const adjustedTimeFactor = normalizeTimeFactorForOH(
    biologicalTimeFactor,
    timeMode
  );

  return Math.round(clamp(baseOH * adjustedTimeFactor, 1, 8));
}

// ————— UUSI: debug/metatieto mukaan —————
export function computeOHBidirectionalWithTimeDetailed({
  pressure,
  windDirection,
  moonPhaseKey,
  pastPressures,
  futurePressures,
  species,
  waterType,
  hour,
  sunrise,
  sunset,
  timeMode = "medium",
}) {
  const p = Number(pressure);
  const w = Math.round(Number(windDirection));

  if (!Number.isFinite(p) || !Number.isFinite(w)) return null;

  const baseOH = computeOHBidirectional({
    pressure: p,
    windDirection: w,
    moonPhaseKey,
    pastPressures,
    futurePressures,
  });

  if (!Number.isFinite(baseOH)) return null;

  const biologicalTimeFactor = getTimeFactor(
    species,
    waterType,
    hour,
    sunrise,
    sunset
  );

  const adjustedTimeFactor = normalizeTimeFactorForOH(
    biologicalTimeFactor,
    timeMode
  );

  const finalOH = Math.round(clamp(baseOH * adjustedTimeFactor, 1, 8));

  return {
    baseOH,
    finalOH,
    biologicalTimeFactor: Number(biologicalTimeFactor?.toFixed?.(3) || biologicalTimeFactor),
    adjustedTimeFactor: Number(adjustedTimeFactor.toFixed(3)),
    species,
    waterType,
    hour,
    sunrise,
    sunset,
    timeMode,
  };
}