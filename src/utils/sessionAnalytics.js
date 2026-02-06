// src/utils/sessionAnalytics.js

export function loadAllCatches() {
  const safe = (k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return [
    ...safe("jarvisaaliit").map((x) => ({ ...x, origin: "lake" })),
    ...safe("virtavesisaaliit").map((x) => ({ ...x, origin: "river" })),
  ];
}

export function getFishingHours(row) {
  // ensisijainen: sessiomin -> tunnit
  const min = row?.fishingDurationMin ?? row?.durationMinutes ?? null;
  const n = min != null ? Number(min) : NaN;
  if (Number.isFinite(n) && n > 0) return n / 60;

  // fallback jos joskus tallennettu valmiiksi
  const h = Number(row?.fishingHours);
  if (Number.isFinite(h) && h > 0) return h;

  return null;
}

export function getForecastOH(row) {
  const cand = [row?.forecastOH, row?.fishingInterest, row?.hourlyOH];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function getRealizedFactor(row) {
  const f = Number(row?.ohMatchFactor);
  return Number.isFinite(f) && f > 0 ? f : null;
}

export function buildOhTimePoints() {
  const rows = loadAllCatches();
  const pts = [];

  for (const r of rows) {
    const h = getFishingHours(r);
    const oh = getForecastOH(r);
    if (!Number.isFinite(h) || !Number.isFinite(oh)) continue;

    pts.push({
      xHours: h,
      oh,
      origin: r.origin,
      factor: getRealizedFactor(r),
      windDeg: Number.isFinite(Number(r.windDeg)) ? Number(r.windDeg) : null,
      pressure: Number.isFinite(Number(r.pressure)) ? Number(r.pressure) : null,
      date: r.date || (r.aika ? String(r.aika).slice(0, 10) : ""),
      species: r.laji || r.species || "",
    });
  }

  return pts;
}

export function binAvg(points, binSizeHours = 0.5) {
  const bins = new Map();

  for (const p of points) {
    const b = Math.floor(p.xHours / binSizeHours) * binSizeHours;
    const key = b.toFixed(2);
    if (!bins.has(key)) bins.set(key, { bin: b, n: 0, sum: 0 });
    const o = bins.get(key);
    o.n += 1;
    o.sum += p.oh;
  }

  return [...bins.values()]
    .map((b) => ({
      xHours: b.bin + binSizeHours / 2,
      ohAvg: b.sum / b.n,
      n: b.n,
    }))
    .sort((a, b) => a.xHours - b.xHours);
}

export function classifySessionFactor(factor, { good = 2.0, bad = 0.6 } = {}) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return null;
  if (f >= good) return "good";
  if (f <= bad) return "bad";
  return null;
}
