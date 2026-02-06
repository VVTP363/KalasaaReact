// src/utils/ohUnified.js

// ---  menneet 6 h (nykyhetkestä taaksepäin), newest -> older
export function collectPastPressures(forecast, dateKey, hourNum, lookback = 6) {
  const out = [];
  if (!forecast || !dateKey || !Number.isFinite(Number(hourNum))) return out;
  const dayKeys = Object.keys(forecast);
  const startIdx = dayKeys.indexOf(dateKey);
  if (startIdx === -1) return out;

  let dIdx = startIdx;
  let h = Number(hourNum);
  while (out.length < lookback && dIdx >= 0) {
    const dayObj = forecast[dayKeys[dIdx]] || {};
    for (let cur = h; cur >= 0 && out.length < lookback; cur--) {
      const p = dayObj[String(cur)]?.Pressure ?? dayObj[String(cur)]?.Pres;
      if (Number.isFinite(p)) out.push(Number(p));
    }
    dIdx -= 1;
    h = 23;
  }
  return out; // newest -> older
}

// ---  tulevat 6 h (nykyhetkestä eteenpäin), [t+1h, t+2h, ...]
export function collectFuturePressures(forecast, dateKey, hourNum, nextHoursWanted = 6) {
  // Palauttaa [t+1h, t+2h, ...]
  const out = [];
  if (!forecast || !dateKey || !Number.isFinite(Number(hourNum))) return out;
  const dayKeys = Object.keys(forecast);
  if (!dayKeys.length) return out;

  let dIdx = dayKeys.indexOf(dateKey);
  if (dIdx === -1) return out;

  let h = Number(hourNum) + 1;
  while (out.length < nextHoursWanted && dIdx < dayKeys.length) {
    const dayObj = forecast[dayKeys[dIdx]] || {};
    for (let cur = h; cur <= 23 && out.length < nextHoursWanted; cur++) {
      const p = dayObj[String(cur)]?.Pressure ?? dayObj[String(cur)]?.Pres;
      if (Number.isFinite(p)) out.push(Number(p));
    }
    dIdx += 1;
    h = 0;
  }
  return out;
}

// ---  pieni apuri (tarvittaessa)
export function maxAbs(...vals) {
  return Math.max(...vals.map(v => Math.abs(Number(v) || 0)));
}

// ---  kuun avain (camel) päivälle
export function getMoonKeyCamelForDate(normalizeMoonKey, getMoonPhaseKeyFromDate, selectedDate, fallbackCamel) {
  if (!selectedDate) return fallbackCamel ?? "newMoon";
  const d = new Date(selectedDate);
  return normalizeMoonKey ? normalizeMoonKey(getMoonPhaseKeyFromDate(d)).camel : (fallbackCamel ?? "newMoon");
}

// ---  tuulen suunta tekstiksi
export function getWindDirectionText(deg, t) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const idx = Math.round(Number(deg) / 45) % 8;
  const key = dirs[idx];
  return `${t(`windDirections.${key}`)} (${Number(deg).toFixed(0)}°)`;
}

// ---  rajaaminen 1–8
export function clampOH(x) {
  return Math.max(1, Math.min(8, Math.round(x)));
}
