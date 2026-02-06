// src/utils/sessionTarget.js

export const TARGET_KG_PER_EFFORT_HOUR = {
  Taimen: 0.15,
  Lohi: 0.2,
  Ahven: 2.35,
  Hauki: 2.25,
  Kuha: 1.12,
  Siika: 1.1,
  Harjus: 0.75,
  Made: 0.3,
  Särkikalat: 2.0,
  Saimaannieriä: 0.12,
  Rautu: 0.7,
  Kyttyrälohi: 0.75,
};

export const TARGET_KG_BY_SPECIES = {
  Taimen: 0.15,
  Lohi: 0.2,
  Ahven: 2.35,
  Hauki: 2.25,
  Made: 0.3,
  Harjus: 0.75,
  Siika: 1.1,
  Kuha: 1.12,
  Särkikalat: 2.0,
  Rautu: 0.7,
  Saimaannieriä: 0.12,
  Kyttyrälohi: 0.75,
};

// Paikka oppivalle mallille myöhemmin:
const STORAGE_KEY = "kalasaa:targetsKgPerEffortHour";

export function getTargetRate(targetSpecies) {
  if (!targetSpecies) return null;

  // 1) user-learned override (jos/kun otetaan käyttöön)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const v = Number(map && map[targetSpecies]);
    if (Number.isFinite(v) && v > 0) return v;
  } catch (e) {
    // ignore
  }

  // 2) default fallback
        const key = String(targetSpecies || "").replace(/^fish\./, "").trim();
	const def = TARGET_KG_PER_EFFORT_HOUR[key];
	return Number.isFinite(def) ? def : null;
}

/**
 * effortHours = pyydysyksiköt * sessiotunnit
 * - ensisijainen: fishingHours (jos joku laskee sen valmiiksi)
 * - fallback: fishingDurationMin / 60
 */
export function computeEffortHours(params) {
  const fishingHours = Number(params && params.fishingHours);
  const fishingDurationMin = Number(params && params.fishingDurationMin);
  const gearUnits = Math.max(0, Number(params && params.gearUnits) || 0);

  if (Number.isFinite(fishingHours) && fishingHours > 0) {
    return fishingHours * gearUnits;
  }

  if (Number.isFinite(fishingDurationMin) && fishingDurationMin > 0) {
    return (fishingDurationMin / 60) * gearUnits;
  }

  return 0;
}

export function computeTargetKg(params) {
  const targetSpecies = params && params.targetSpecies;
  const effortHours = Number(params && params.effortHours);

  const rate = getTargetRate(targetSpecies);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(effortHours) || effortHours <= 0) return null;

  return rate * effortHours;
}

const MAX_SESSION_FACTOR = 5;

// pehmeä saturaatio
function saturateTanh(factor, k = 1.2, gain = 3) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return 0;
  return 1 + Math.tanh((f - 1) / k) * gain; // ~1..4
}

// lyhytsessio vaimennus (ei blokkaa ⭐)
function shortSessionDampen(rawFactor, effortMinutes, pivot = 10, power = 2) {
  const mins = Number(effortMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return rawFactor;
  const w = Math.min(1, Math.max(0, mins / pivot));
  const ww = Math.pow(w, power);
  return 1 + (rawFactor - 1) * ww;
}

/**
 * Yhteensopiva:
 * - vanha: { actualKg, targetKg } -> factor = actualKg/targetKg
 * - uusi:  { actualKg, effortMinutes, targetKgPerHour } -> factor = (kg/h)/(target)
 * - myös:  { actualKg, effortHours, targetKgPerEffortHour }
 */
export function computeSessionFactor(params = {}) {
  const actualKg = Number(params.actualKg ?? params.weightKg ?? params.weight);

  if (!Number.isFinite(actualKg) || actualKg < 0) return null;

  // 1) UUSI tapa: effortMinutes + targetKgPerHour
  const mins = Number(params.effortMinutes ?? params.fishingDurationMin ?? params.durationMinutes);
  const targetKgPerHour = Number(params.targetKgPerHour);

  if (Number.isFinite(mins) && mins > 0 && Number.isFinite(targetKgPerHour) && targetKgPerHour > 0) {
    const effortHours = mins / 60;
    const kgPerHour = actualKg / effortHours;
    const raw = kgPerHour / targetKgPerHour;

    const damped = shortSessionDampen(raw, mins, 10, 2);
    const soft = saturateTanh(damped, 1.2, 3);
    return Math.min(MAX_SESSION_FACTOR, Math.max(0, soft));
  }

  // 2) Vaihtoehto: effortHours + targetKgPerEffortHour
  const effortHours = Number(params.effortHours);
  const targetKgPerEffortHour = Number(params.targetKgPerEffortHour);

  if (
    Number.isFinite(effortHours) && effortHours > 0 &&
    Number.isFinite(targetKgPerEffortHour) && targetKgPerEffortHour > 0
  ) {
    const kgPerEh = actualKg / effortHours;
    const raw = kgPerEh / targetKgPerEffortHour;

    // jos mins tiedossa, vaimennetaan lyhyttä – muuten mennään ilman
    const damped = Number.isFinite(mins) && mins > 0 ? shortSessionDampen(raw, mins, 10, 2) : raw;
    const soft = saturateTanh(damped, 1.2, 3);
    return Math.min(MAX_SESSION_FACTOR, Math.max(0, soft));
  }

  // 3) VANHA tapa: actualKg / targetKg
  const targetKg = Number(params.targetKg ?? params.target);

  if (Number.isFinite(targetKg) && targetKg > 0) {
    const raw = actualKg / targetKg;
    const soft = saturateTanh(raw, 1.2, 3);
    return Math.min(MAX_SESSION_FACTOR, Math.max(0, soft));
  }

  return null;
}

// Luokitus: säädä rajoja fiiliksen mukaan
export function classifySessionFactor(factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return null;

  if (f < 0.75) return "weak"; // Heikko
  if (f <= 1.25) return "within"; // Ennusteen rajoissa
  return "excellent"; // Erinomainen
}

export function labelForSessionClass(cls, t) {
  const tt = typeof t === "function" ? t : null;

  if (cls === "weak")
    return tt
      ? tt("session.class.weak", { defaultValue: "Heikko" })
      : "Heikko";

  if (cls === "within")
    return tt
      ? tt("session.class.within", { defaultValue: "Ennusteen rajoissa" })
      : "Ennusteen rajoissa";

  if (cls === "excellent")
    return tt
      ? tt("session.class.excellent", { defaultValue: "Erinomainen" })
      : "Erinomainen";

  return "";
}

