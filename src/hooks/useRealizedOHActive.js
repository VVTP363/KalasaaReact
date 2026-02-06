// src/hooks/useRealizedOHActive.js
import { useMemo } from "react";
import {
  computeRealizedOHActive,
  OHmatchFactor,
} from "../utils/OHrealization";

/**
 * Laskee toteutuneen OH:n AKTIIVIkalastukselle.
 *
 * @param {object} params
 * @param {string} params.species        Kalalaji (esim. "Ahven", "kuha", "harjus")
 * @param {number} params.catchKg        Saaliin paino kilogrammoina
 * @param {number} params.fishingHours   Kalastusaika tunteina (esim. 5)
 * @param {number} params.gearUnits      Yhtäaikaisten vapojen/siimojen määrä
 * @param {number} [params.forecastOH]   Ennustettu OH (1–8), jos halutaan vastaavuus
 * @param {boolean} [params.enabled]     Jos false → ei laskentaa (esim. passiivipyydykset)
 */
export function useRealizedOHActive({
  species,
  catchKg,
  fishingHours,
  gearUnits,
  forecastOH,
  enabled = true,
}) {
  const realizedOH = useMemo(() => {
    if (!enabled) return null;
    return computeRealizedOHActive({
      species,
      catchKg,
      fishingHours,
      gearUnits,
    });
  }, [enabled, species, catchKg, fishingHours, gearUnits]);

  const matchFactor = useMemo(() => {
    if (!enabled || !Number.isFinite(forecastOH)) return null;
    if (!Number.isFinite(realizedOH)) return null;
    return OHmatchFactor(realizedOH, forecastOH);
  }, [enabled, realizedOH, forecastOH]);

  return {
    realizedOH,   // 1–8 tai null
    matchFactor,  // esim. 0.8..1.2 tai null
  };
}
