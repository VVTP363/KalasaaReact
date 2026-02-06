// src/components/SpeciesStrikeForecast.jsx
import React, { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppContext } from "./AppContext";
import { normalizeSpecies } from "../utils/species";

// OH skaalalle 1–8, null jos ei kelvollinen
function clampOh(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(8, Math.round(n)));
}

// Luetaan localStoragesta suoraan – ei riippuvuutta catchSummaryyn
function loadLocalCatches(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[SpeciesStrikeForecast] localStorage parse error:", e);
    return [];
  }
}

// Poimitaan riviltä ennuste-OH (1–8 tai null)
function getForecastOH(row) {
  if (!row) return null;

  if (row.ohForecast != null) {
    const n = Number(row.ohForecast);
    if (Number.isFinite(n) && n > 0) return n;
  }

  if (row.fishingInterest != null) {
    const n = Number(row.fishingInterest);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const label = row.summaryData?.oh ?? row.ohDisplay ?? null;
  if (typeof label === "string") {
    const m = label.match(/(\d+(\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return null;
}

// Poimitaan riviltä toteutunut OH (0–8 tai null)
function getRealizedOH(row) {
  if (!row) return null;

  // uudet rivit: realizedOH numerona (saa olla 0)
  if (row.realizedOH != null) {
    const n = Number(row.realizedOH);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  if (row.summaryData?.realizedOH != null) {
    const n = Number(row.summaryData.realizedOH);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  // vain fallback vanhoille riveille
  if (typeof row.lineDisplay === "string") {
    const m = row.lineDisplay.match(/toteutunut oh\s+(\d+)(?:\/8)?/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }

  return null;
}

export default function SpeciesStrikeForecast({
  storageKey = "jarvisaaliit",
  showDebug = false,
  selectedSpecies = null,   // ← uusi: laji ulkoa (esim. "Made")
  showSelector = true,      // ← uusi: näytetäänkö sisäinen valitsin
}) {

  const { t, i18n } = useTranslation();

  const { lakeSeaOH, riverOH } = useContext(AppContext);

  const allRows = useMemo(
    () => loadLocalCatches(storageKey),
    [storageKey]
  );

  // 🔴 Lajilista, jossa UI-label tulee käännöksistä (fish.X)
  const speciesList = useMemo(() => {
    const map = new Map();
    for (const row of allRows) {
      const raw = row?.laji || row?.species || row?.speciesDisplay;
      if (!raw) continue;
      const norm = normalizeSpecies(raw); // esim. "Ahven", "Taimen", "Hauki"
      if (!map.has(norm)) {
        const uiLabel = t(`fish.${norm}`, raw); // käännös, fallback raw
        map.set(norm, { norm, raw, uiLabel });
      }
    }
    return Array.from(map.values());
    // kun kieli vaihtuu, t muuttuu → lista päivittyy
  }, [allRows, t, i18n.language]);

  const [selectedNorm, setSelectedNorm] = useState(
    speciesList[0]?.norm || ""
  );

  const selectedNormEffective = useMemo(() => {
  // jos ulkoa annettu laji → normalisoidaan ja käytetään sitä
  if (selectedSpecies) return normalizeSpecies(selectedSpecies);
  return selectedNorm;
  }, [selectedSpecies, selectedNorm]);

  const selectedSpeciesRows = useMemo(() => {
  if (!selectedNormEffective) return [];
  return allRows.filter((row) => {
    const raw = row?.laji || row?.species || row?.speciesDisplay;
    return normalizeSpecies(raw) === selectedNormEffective;
  });
}, [allRows, selectedNormEffective]);


  const stats = useMemo(() => {
    const forecastList = [];
    const realizedList = [];
    const pairList = [];

    for (const row of selectedSpeciesRows) {
      const f = getForecastOH(row);
      const r = getRealizedOH(row);

      if (f != null) forecastList.push(f);
      if (r != null) realizedList.push(r);
      if (f != null && r != null) {
        pairList.push({ f, r });
      }
    }

    const avg = (arr) =>
      arr.length
        ? arr.reduce((sum, v) => sum + v, 0) / arr.length
        : null;

    const avgForecastPairs = avg(pairList.map((p) => p.f));
    const avgRealizedPairs = avg(pairList.map((p) => p.r));

    let factor = null;
    if (avgForecastPairs != null && avgForecastPairs > 0) {
      factor =
        avgRealizedPairs != null ? avgRealizedPairs / avgForecastPairs : null;
    }

    return {
      forecastList,
      realizedList,
      pairCount: pairList.length,
      avgForecastPairs,
      avgRealizedPairs,
      factor,
    };
  }, [selectedSpeciesRows]);

  const baseOH = useMemo(() => {
    const raw =
      storageKey === "jarvisaaliit"
        ? lakeSeaOH
        : riverOH;

    return clampOh(raw);
  }, [storageKey, lakeSeaOH, riverOH]);

  const adjustedOH = useMemo(() => {
    if (baseOH == null) return null;
    if (!Number.isFinite(stats.factor) || stats.factor <= 0) {
      return baseOH;
    }
    return clampOh(baseOH * stats.factor);
  }, [baseOH, stats.factor]);

  const selectedObj =
      speciesList.find((s) => s.norm === selectedNormEffective) || null;
  const selectedLabel = selectedObj?.uiLabel || "";
 

    return (
    <div style={{ padding: "0.75rem 0" }}>
      {/* Lajivalinta */}
      {showSelector && (
  <label>
    {t("selectSpecies", "Valitse laji:")}{" "}
    <select
      value={selectedNorm}
      onChange={(e) => setSelectedNorm(e.target.value)}
    >
      {speciesList.map((s) => (
        <option key={s.norm} value={s.norm}>
          {s.uiLabel}
        </option>
      ))}
    </select>
  </label>
)}

      <h4 style={{ marginTop: "0.75rem" }}>
        🐟{" "}
        {selectedLabel
          ? `${selectedLabel} ${t("speciesStrikeSuffix", "ottiennuste nyt")}`
          : t("speciesForecastTitle", "Lajikohtainen ottiennuste")}
      </h4>

      <p>
        {t("baseOhNow", "Perus-OH nyt")}:{" "}
        {baseOH != null ? `${baseOH}/8` : "-/8"}
      </p>
      <p>
        {t("speciesAdjustedForecast", "Laji-korjattu ennuste")}:{" "}
        {adjustedOH != null ? `${adjustedOH}/8` : "-/8"}
      </p>

      {/* Siisti koonti (aina näkyvissä) */}
      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid #ccc",
          background: "#f9fcff",
          fontSize: "0.9rem",
        }}
      >
        <strong>{t("summaryBlock", "Koonti")}</strong>
        <div style={{ marginTop: "0.35rem" }}>
          • {t("debugTotalRows", "Saalisrivejä yhteensä")}:{" "}
          {selectedSpeciesRows.length}
          <br />
          •{" "}
          {t(
            "debugPairedRows",
            "Rivejä, joissa OH tallennettu (ennuste+toteuma)"
          )}
          : {stats.pairCount}
          <br />
          • {t("debugForecastAvgPairs", "Ennuste-OH keskiarvo (pareilla)")}:{" "}
          {stats.avgForecastPairs != null
            ? stats.avgForecastPairs.toFixed(2)
            : "-"}
          <br />
          • {t("debugRealizedAvgPairs", "Toteutunut OH keskiarvo (pareilla)")}:{" "}
          {stats.avgRealizedPairs != null
            ? stats.avgRealizedPairs.toFixed(2)
            : "-"}
          <br />
          •{" "}
          {t("debugFactor", "Kerroin (historiallinen toteuma / ennuste)")}:{" "}
          {stats.factor != null ? stats.factor.toFixed(2) : "-"}
        </div>
      </div>

      {/* DEBUG (vain jos showDebug=true) */}
      {showDebug ? (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            border: "1px dashed #aaa",
            background: "#fff",
            fontSize: "0.85rem",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>{t("debugBlock", "DEBUG")}</strong>
          <br />
          • {t("debugSpecies", "Laji")}: {selectedLabel || "(n/a)"}
          <br />
          • {t("debugForecastOhs", "Ennuste-OHt")}:{" "}
          {stats.forecastList.length
            ? stats.forecastList.map((v) => v.toFixed(1)).join(", ")
            : "-"}
          <br />
          • {t("debugRealizedOhs", "Toteutuneet OH:t")}:{" "}
          {stats.realizedList.length
            ? stats.realizedList.map((v) => v.toFixed(1)).join(", ")
            : "-"}
          <br />
          • {t("debugBaseOh", "Perus-OH")}:{" "}
          {baseOH != null ? `${baseOH}/8` : "-/8"}
          <br />
          • {t("debugAdjustedNow", "Laji-korjattu ennuste nyt")}:{" "}
          {adjustedOH != null ? `${adjustedOH}/8` : "-/8"}
        </div>
      ) : null}
    </div>
  );
}


