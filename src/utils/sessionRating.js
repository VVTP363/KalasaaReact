// src/utils/sessionRating.js

export function computeSessionFactor({ weightKg, durationMinutes, targetKgPerHour }) {
  const w = Number(weightKg);
  const m = Number(durationMinutes);
  const t = Number(targetKgPerHour);

  if (!Number.isFinite(w) || !Number.isFinite(m) || !Number.isFinite(t)) return null;
  if (w <= 0 || m <= 0 || t <= 0) return null;

  const hours = m / 60;
  const realized = w / hours;
  return realized / t;
}

export function classifySessionFactor(factor) {
  const f = Number(factor);
  if (!Number.isFinite(f)) return null;

  // Säädettävät rajat:
  if (f < 0.7) return "weak";        // Heikko
  if (f <= 1.3) return "within";     // Ennusteen rajoissa
  return "excellent";               // Erinomainen
}
