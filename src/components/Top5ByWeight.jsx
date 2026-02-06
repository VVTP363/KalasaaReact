// src/components/Top5ByWeight.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { loadCatches, firstFiniteNumber } from "../utils/catchSummary";
import InfoTooltip from "./InfoTooltip";

const Top5ByWeight = ({ storageKey = "saaliit" }) => {
  const { t } = useTranslation();

  const catches = loadCatches(storageKey);

  const withWeight = catches
    .map((row, index) => {
      const weight = firstFiniteNumber(
        row.painoKg,
        row.weightKg,
        row.paino,
        row.weight
      );
      const speciesKey = (row.laji || row.species || "").trim();

      return {
        ...row,
        _weight: weight,
        _speciesKey: speciesKey,
        _idx: index,
      };
    })
    .filter((r) => r._speciesKey && r._weight > 0);

  if (!withWeight.length) {
    return <p>{t("noCatchData")}</p>;
  }

  // Ryhmitellään lajittain
  const bySpecies = {};
  for (const r of withWeight) {
    if (!bySpecies[r._speciesKey]) bySpecies[r._speciesKey] = [];
    bySpecies[r._speciesKey].push(r);
  }

  const speciesKeys = Object.keys(bySpecies).sort();

  return (
    <div style={{ marginTop: "1em" }}>
      <h4>
        🏆 {t("top5ByWeight", "Top 5 – suurimmat kalat / laji")}
        <InfoTooltip
          text={t(
            "top5Info",
            "Listaa jokaiselle lajille viisi painavinta talletettua saalista (kg, pituus, päivä ja paikka jos saatavilla)."
          )}
        />
      </h4>

      {speciesKeys.map((speciesKey) => {
        const list = [...bySpecies[speciesKey]]
          .sort((a, b) => b._weight - a._weight)
          .slice(0, 5);

        return (
          <div key={speciesKey} style={{ marginBottom: "0.75em" }}>
            <strong>{t(`fish.${speciesKey}`, speciesKey)}</strong>
            <ul style={{ marginTop: "0.25em" }}>
              {list.map((row, i) => (
                <li key={row._idx + "-" + i}>
                  {row._weight.toFixed(2)} kg
                  {row.pituus || row.lengthCm
                    ? ` – ${row.pituus || row.lengthCm} cm`
                    : ""}
                  {row.date || row.pvm ? ` (${row.date || row.pvm})` : ""}
                  {row.paikka || row.locationName
                    ? ` – 📍 ${row.paikka || row.locationName}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

export default Top5ByWeight;
