// src/utils/fishingOH.js

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
  let num = 0,
    den = 0;
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
    return { factor: 999, meta: { level, slope, dP6h, dP_ema, override: true } };
  }

  // Luokkapohjainen perusboosti (molemmat suunnat nostavat)
  let base = 1.1; // weak
  if (level === "medium") base = 1.3;

  // Hienosäätö EMA-erolla (molempiin suuntiin)
  const extra = 1 + 0.03 * Math.min(6, Math.abs(dP_ema)); // max ~ +0.18
  const f = Math.min(1.6, Math.max(1.0, base * extra));

  return { factor: f, meta: { level, slope, dP6h, dP_ema, override: false } };
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

// HUOM: forecast[dateKey][hourKey].Pressure
export function collectPastPressures(forecast, dateKey, hourNum, count = 7) {
  const day = forecast?.[dateKey];
  if (!day) return [];

  const out = [];

  for (let h = hourNum; h >= 0 && out.length < count; h--) {
    const key = String(h).padStart(2, "0");
    const d = day[key];
    if (d && Number.isFinite(d.Pressure)) {
      out.push(Number(d.Pressure)); // newest -> older
    }
  }

  return out;
}

export function collectFuturePressures(forecast, dateKey, hourNum, count = 6) {
  const day = forecast?.[dateKey];
  if (!day) return [];

  const out = [];

  for (let h = hourNum + 1; h < 24 && out.length < count; h++) {
    const key = String(h).padStart(2, "0");
    const d = day[key];
    if (d && Number.isFinite(d.Pressure)) {
      out.push(Number(d.Pressure)); // [t+1h, t+2h, ...]
    }
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
  pastPressures, // esim. collectPastPressures(...), newest->older
  futurePressures, // esim. collectFuturePressures(...), [t+1h, t+2h, ...]
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
    // nyt-hetkenä käytetään pastPressures[0] jos saatavilla, muuten p
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

  // 6) valitse vahvempi boosti (konservatiivinen yhdistäminen)
  const factor = Math.max(pastFactor || 1.0, fwdFactor || 1.0);

  // 7) skaalaa ja rajaa 1–8
  return Math.round(Math.max(1, Math.min(8, base * factor)));
}
