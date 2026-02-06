// src/utils/sessionInsights.js
import { loadAllCatches, getFishingHours } from "./sessionAnalytics";

function dir8FromDeg(deg) {
  if (!Number.isFinite(deg)) return null;
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[(idx + 8) % 8];
}

function durBucket(h) {
  if (!Number.isFinite(h) || h <= 0) return null;
  if (h < 1) return "0–1 h";
  if (h < 2) return "1–2 h";
  if (h < 4) return "2–4 h";
  if (h < 6) return "4–6 h";
  return "6+ h";
}

export function buildSessionInsights({ minN = 5 } = {}) {
  const rows = loadAllCatches();
  const groups = new Map();

  for (const r of rows) {
    const h = getFishingHours(r);
    const b = durBucket(h);
    const d = dir8FromDeg(Number(r.windDeg));
    const factor = Number(r.ohMatchFactor);

    if (!b || !d) continue;
    if (!Number.isFinite(factor) || factor <= 0) continue;

    const key = `${b}|${d}`;
    if (!groups.has(key)) groups.set(key, { bucket: b, dir: d, n: 0, sum: 0 });
    const g = groups.get(key);
    g.n += 1;
    g.sum += factor;
  }

  const ranked = [...groups.values()]
    .map((g) => ({ ...g, avg: g.sum / g.n }))
    .filter((g) => g.n >= minN)
    .sort((a, b) => b.avg - a.avg);

  const best = ranked[0] || null;

  if (!best) {
  return {
    best: null,
    insightKey: "stats.insight.noData",
    insightParams: {},
  };
}

return {
  best,
  insightKey: "stats.insight.bestCombo",
  insightParams: {
    bucket: best.bucket,
    wind: best.dir,
    avg: best.avg.toFixed(2),
    n: best.n,
  },
  top: ranked.slice(0, 3),
};
}
