// src/utils/catchModel.js

// Storage keys (pidetään vanhat!)
export const STORAGE_KEYS = {
  ALL: "saaliit",
  LAKE: "jarvisaaliit",
  RIVER: "virtavesisaaliit",

  // uudet (ei riko vanhaa)
  ACTIVE_SESSION: "activeFishingSession",
  DRAFT_CATCH: "draftCatch",
};

export function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadArray(key) {
  const arr = safeJsonParse(localStorage.getItem(key) || "[]", []);
  return Array.isArray(arr) ? arr : [];
}

export function saveArray(key, arr) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
}

// --- Datamallit (JS-objektit) ---
//
// activeSession:
// {
//   id, startedAt, stoppedAt, source, locationName, coords, pressureAtStart, windDegAtStart, forecastOHAtStart, moon...
// }
//
// draftCatch:
// {
//   sessionId, source, startedAt, stoppedAt, durationMinutes,
//   locationName, coords,
//   pressure, windDeg, windDirectionText, windSpeed,
//   forecastOH, // ennuste OH sessionin lopetushetkellä
//   // HUOM: tässä vaiheessa ei vielä species/weight/amount/rating välttämättä ole
// }
//
// savedCatch (yhteensopiva vanhan kanssa):
// - laitetaan kentät samoin kuin nykyisissä tallennuksissa: date, time, species, amount, weight, rating...
// - lisätään sessionId + startedAt/stoppedAt/durationMinutes “lisäkenttinä”
//

export function nowIso() {
  return new Date().toISOString();
}

export function minutesBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function formatDateYYYYMMDD(iso = nowIso()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function formatTimeHHMM(iso = nowIso()) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}.${mm}`; // teillä on ollut 17.30-tyyli
}

export function makeActiveSession({
  source = "lake", // "lake" | "river"
  locationName = "",
  coords = null, // { lat, lon }
  weatherSnapshot = null, // { pressure, windDeg, windSpeed, forecastOH, moon... }
} = {}) {
  const startedAt = nowIso();
  return {
    id: `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    source,
    startedAt,
    stoppedAt: null,
    locationName: (locationName || "").trim() || "-",
    coords: coords ?? null,
    weatherAtStart: weatherSnapshot ?? null,
  };
}

export function stopSessionToDraft(session, weatherSnapshot = null) {
  const stoppedAt = nowIso();
  const startedAt = session?.startedAt || stoppedAt;

  const durationMinutes = minutesBetween(startedAt, stoppedAt);

  const loc = (session?.locationName || "").trim() || "-";
  const src = session?.source || "lake";

  const ws = weatherSnapshot ?? session?.weatherAtStart ?? null;

  return {
    sessionId: session?.id || null,
    source: src,
    startedAt,
    stoppedAt,
    durationMinutes,

    locationName: loc,
    coords: session?.coords ?? null,

    // sää (jos saatavilla)
    pressure: ws?.pressure ?? null,
    windDeg: ws?.windDeg ?? null,
    windSpeed: ws?.windSpeed ?? null,
    windDirectionText: ws?.windDirectionText ?? null,

    forecastOH: ws?.forecastOH ?? null,

    moonPhaseKey: ws?.moonPhaseKey ?? null,
    moonEmoji: ws?.moonEmoji ?? null,
    moonPhaseLabel: ws?.moonPhaseLabel ?? null,
    moonPhase: ws?.moonPhase ?? null,
  };
}

/**
 * Muuntaa draftCatch + formData => savedCatch (yhteensopiva vanhoihin listoihin)
 * formData = { species, length, amount, weight, cr, rating, ... }
 */
export function mergeDraftIntoSavedCatch(draftCatch, formData = {}, extra = {}) {
  const date = formData.date || formatDateYYYYMMDD(draftCatch?.stoppedAt);
  const time = formData.time || formatTimeHHMM(draftCatch?.stoppedAt);

  const saved = {
    // --- vanhat peruskentät ---
    date,
    time,
    species: formData.species || "",
    length: formData.length || "",
    amount: Number(formData.amount ?? 0) || 0,
    weight: typeof formData.weight === "number" ? formData.weight : formData.weight,
    cr: Number(formData.cr ?? 0) || 0,
    rating: formData.rating ?? formData.feedback ?? null,

    // --- lähde & paikka ---
    source: draftCatch?.source === "river" ? "river" : "lake",
    locationName: draftCatch?.locationName || formData.locationName || "-",
    location: draftCatch?.locationName || formData.locationName || "-",

    // --- sää & OH ---
    pressure: draftCatch?.pressure ?? null,
    windDeg: draftCatch?.windDeg ?? null,
    windSpeed: draftCatch?.windSpeed ?? null,
    windDirectionText: draftCatch?.windDirectionText ?? null,
    windDirection: draftCatch?.windDirectionText ?? null,

    forecastOH: draftCatch?.forecastOH ?? null,
    hourlyOH: draftCatch?.forecastOH ?? null,
    fishingInterest: draftCatch?.forecastOH ?? null,

    moonEmoji: draftCatch?.moonEmoji ?? null,
    moonPhaseKey: draftCatch?.moonPhaseKey ?? null,
    moonPhaseLabel: draftCatch?.moonPhaseLabel ?? null,
    moonPhase: draftCatch?.moonPhase ?? null,

    // --- sessio-meta (uudet lisäkentät, eivät riko vanhaa) ---
    sessionId: draftCatch?.sessionId ?? null,
    startedAt: draftCatch?.startedAt ?? null,
    stoppedAt: draftCatch?.stoppedAt ?? null,
    durationMinutes: Number(draftCatch?.durationMinutes ?? 0) || 0,

    ...extra,
  };

  return saved;
}

export function saveCatchCompatible(savedCatch) {
  const src = (savedCatch?.source || "").toLowerCase();
  const isRiver = src === "river" || src === "virtavesi";
  const waterKey = isRiver ? STORAGE_KEYS.RIVER : STORAGE_KEYS.LAKE;

  const listWater = loadArray(waterKey);
  const listAll = loadArray(STORAGE_KEYS.ALL);

  saveArray(waterKey, [...listWater, savedCatch]);
  saveArray(STORAGE_KEYS.ALL, [...listAll, savedCatch]);
}
