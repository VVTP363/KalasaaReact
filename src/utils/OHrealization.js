// src/utils/OHrealization.js
// ======================================
// Toteutuneen ottihalukkuuden laskenta (1–8/8)
// VAIN aktiivivälineille (perho / heitto / mato / pilkki / vetouistelu jne.)

// ------------------------------------------------------
// 1. Lajikohtaiset kg/h -kynnykset per pyydysyksikkö
//    Taulukko: [ raja 1/8, 2/8, ..., 8/8 ]
export const speciesThresholds = {
  ahven: [0.5, 0.9, 1.4, 2.0, 2.7, 3.5, 4.4, 5.4],
  kuha: [0.5, 0.9, 1.4, 2.0, 2.7, 3.5, 4.4, 5.4],
  hauki: [0.5, 0.9, 1.4, 2.0, 2.7, 3.5, 4.4, 5.4],
  rautu: [0.1, 0.2, 0.4, 0.65, 0.9, 1.25, 1.75, 2.5],
  saimaannieriä: [0.1, 0.2, 0.4, 0.65, 0.9, 1.25, 1.75, 2.5],
  kyttyrälohi: [0.1, 0.2, 0.4, 0.65, 0.9, 1.25, 1.75, 2.5],
  taimen: [0.035, 0.5, 0.7, 0.9, 1.3, 1.6, 1.9, 2.1],
  harjus: [0.1, 0.2, 0.4, 0.65, 0.9, 1.25, 1.75, 2.5],
  lohi: [0.15, 0.2, 0.4, 0.55, 0.7, 0.9, 1.5, 2.5],
  made: [0.03, 0.5, 0.7, 0.9, 1.3, 1.6, 1.9, 2.1],
  siika: [0.025, 0.5, 0.7, 0.9, 1.3, 1.6, 1.9, 2.1],
};

// Pieni apuri: normalisoi lajin nimi
export function normalizeSpeciesName(name) {
  if (!name) return "";
  const s = String(name).toLowerCase().trim();

  // tänne voit halutessasi lisätä alias-mäppäyksiä:
  // if (s === "perch") return "ahven";
  // if (s === "pike") return "hauki";
  return s;
}

// ------------------------------------------------------
// 2. Skaalaus: palauttaa OH (1–8) annetulla kg/h -arvolla
export function ohFromRate(rateKgPerHour, thresholds) {
  if (!Number.isFinite(rateKgPerHour) || rateKgPerHour <= 0) {
    // ei saalista → 1/8
    return 1;
  }
  let oh = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (rateKgPerHour >= thresholds[i]) {
      oh = i + 1; // indeksit 0..7 → OH 1..8
    } else {
      break;
    }
  }
  return oh;
}

// ------------------------------------------------------
// 3. Toteutuneen OH:n laskenta aktiivikalastukselle
//    gearUnits = yhtäaikaisten vapojen/siimojen määrä
export function computeRealizedOHActive({
  species,
  catchKg,
  fishingHours,
  gearUnits,
}) {
  const key = normalizeSpeciesName(species);
  const thresholds = speciesThresholds[key];
  if (!thresholds) {
    console.warn("Ei OH-kynnyksiä lajille:", species);
    return null;
  }

  const hours = Number(fishingHours);
  const units = Math.max(1, Number(gearUnits) || 1); // vähintään 1 aktiiviyksikkö

  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  const totalHours = hours * units; // esim. 8 vapaa * 5 h = 40 tuntia
  const weight = Number(catchKg) || 0;
  const rate = weight / totalHours; // kg / (h * yksikkö)

  return ohFromRate(rate, thresholds);
}

// ------------------------------------------------------
// 4. Vastaavuuskerroin: toteutunut vs ennuste-OH
export function OHmatchFactor(realizedOH, forecastOH) {
  if (!Number.isFinite(realizedOH) || !Number.isFinite(forecastOH)) return null;
  if (forecastOH <= 0) return null;
  return realizedOH / forecastOH; // esim. 0.8 … 1.2
}
