// src/utils/catchSummary.js
export function loadCatches(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadCatches parse error for", storageKey, e);
    return [];
  }
}

// Palauttaa ensimmäisen järkevän numeron listasta
export function firstFiniteNumber(...candidates) {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

// Yritetään poimia sekä ennuste-OH että toteutunut OH saalisrivistä
// Palauttaa olion { forecast, realized }
export function extractOhFromRow(row) {
  if (!row || typeof row !== "object") {
    return { forecast: null, realized: null };
  }

  // ennuste-OH (järvi/meri + virtavedet)
  const forecastCandidates = [
    row.fishingInterest,   // meidän uusin kenttä (numeric 1–8)
    row.ohForecast,
    row.ohEnnuste,
    row.lakeSeaOH,
    row.riverOH,
    row.OH,
    row.oh,
    row.ottihalukkuus,
  ];

  let forecast = null;
  for (const c of forecastCandidates) {
    const n = Number(c);
    if (Number.isFinite(n)) {
      forecast = n;
      break;
    }
  }

  // toteutunut OH aktiivipyynnistä
  const realizedCandidates = [
    row.realizedOH,    // LakeSeaCatchForm_fixed + VirtavesiIlmoitus
    row.ohRealized,
    row.oh_realized,
  ];

  let realized = null;
  for (const c of realizedCandidates) {
    const n = Number(c);
    if (Number.isFinite(n)) {
      realized = n;
      break;
    }
  }

  return { forecast, realized };
}

// Rakentaa lajikohtaisen yhteenvedon
// [{ speciesKey, totalCount, totalCr, totalWeight }]
export function buildSpeciesSummary(catches) {
  const map = {};

  for (const row of catches) {
    const speciesKey = (row.laji || row.species || "").trim();
    if (!speciesKey) continue;

    if (!map[speciesKey]) {
      map[speciesKey] = {
        totalCount: 0,
        totalCr: 0,
        totalWeight: 0,
      };
    }

    map[speciesKey].totalCount += firstFiniteNumber(
      row.maara,
      row.kpl,
      row.count
    );
    map[speciesKey].totalCr += firstFiniteNumber(
      row.cr,
      row.crCount,
      row.cr_kpl
    );
    map[speciesKey].totalWeight += firstFiniteNumber(
      row.painoKg,
      row.weightKg,
      row.paino,
      row.weight
    );
  }

  return Object.entries(map).map(([speciesKey, vals]) => ({
    speciesKey,
    ...vals,
  }));
}
