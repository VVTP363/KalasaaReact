function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function avg(arr) {
  if (!arr.length) return null;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
}

// Poimitaan ennuste-OH samoin kuin SaalisHistoria tekee
function extractForecastOH(row) {
  // 1) "6/8" merkkijono
  if (row?.summaryData && typeof row.summaryData.oh === "string") {
    const part = row.summaryData.oh.split("/")[0];
    const n = asNum(part);
    if (n != null) return n;
  }
  // 2) summaryData.fishingInterest
  if (row?.summaryData && typeof row.summaryData.fishingInterest === "number") {
    return row.summaryData.fishingInterest;
  }
  // 3) root.fishingInterest
  if (typeof row?.fishingInterest === "number") return row.fishingInterest;

  // 4) vanhat kentät
  const n = asNum(row?.oh ?? row?.OH);
  return n;
}

function extractRealizedOH(row) {
  if (typeof row?.realizedOH === "number") return row.realizedOH;
  if (row?.summaryData && typeof row.summaryData.realizedOH === "number") {
    return row.summaryData.realizedOH;
  }
  return null;
}

export function computeCatchStats(rows) {
  const forecast = [];
  const realized = [];
  const absErr = [];
  const ratio = []; // toteuma/ennuste, jos ennuste > 0

  for (const r of rows || []) {
    const f = extractForecastOH(r);
    const a = extractRealizedOH(r);

    if (f != null) forecast.push(f);
    if (a != null) realized.push(a);

    if (f != null && a != null) {
      absErr.push(Math.abs(a - f));
      if (f > 0) ratio.push(a / f);
    }
  }

  return {
    nRows: (rows || []).length,
    nForecast: forecast.length,
    nRealized: realized.length,
    nPairs: absErr.length,

    avgForecastOH: avg(forecast),     // esim. 5.3
    avgRealizedOH: avg(realized),     // esim. 6.1
    avgAbsError: avg(absErr),         // esim. 1.4 (mitä pienempi, sen parempi)
    avgRatio: avg(ratio),             // esim. 1.12× (toteuma keskim. 12% yli ennusteen)

    updatedAt: new Date().toISOString(),
  };
}

export function recomputeAndStoreCatchStats(storageKey, statsKey) {
  let rows = [];
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
    rows = Array.isArray(raw) ? raw : [];
  } catch {
    rows = [];
  }

  const stats = computeCatchStats(rows);
  localStorage.setItem(statsKey, JSON.stringify(stats));
  return stats;
}
