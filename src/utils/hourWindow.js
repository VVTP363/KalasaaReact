// src/utils/hourWindow.js

// forecast = { "YYYY-MM-DD": { "0": {...}, "1": {...}, ... } }
// palauttaa lajitelun listan { ts, dateKey, hour, data }
export function buildHourlyWindow(forecast, startDate, endDate) {
  if (!forecast) return [];

  const startTs = startDate.getTime();
  const endTs = endDate.getTime();
  const out = [];

  for (const [dateKey, dayObj] of Object.entries(forecast || {})) {
    if (!dayObj || typeof dayObj !== "object") continue;

    const [yyyy, mm, dd] = dateKey.split("-");
    if (!yyyy || !mm || !dd) continue;

    for (const [hourStr, data] of Object.entries(dayObj)) {
      const hour = Number(hourStr);
      if (!Number.isFinite(hour)) continue;

      const ts = new Date(+yyyy, +mm - 1, +dd, hour).getTime();
      if (ts >= startTs && ts <= endTs) {
        out.push({ ts, dateKey, hour, data });
      }
    }
  }

  // aikajärjestykseen
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
