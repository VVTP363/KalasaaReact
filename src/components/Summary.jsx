// src/components/Summary.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { loadCatches, buildSpeciesSummary } from "../utils/catchSummary";
import InfoTooltip from "./InfoTooltip";
import ClearHistoryButton from "./ClearHistoryButton";


const Summary = () => {
  const { t } = useTranslation();

  const catches = loadCatches("saaliit");
  const summaryArr = buildSpeciesSummary(catches).sort(
    (a, b) => b.totalCount - a.totalCount
  );

  const handleExportCSV = () => {
    if (!summaryArr.length) return;

    const header = ["Laji", "Kpl", "C&R", "Paino_kg"];
    const rows = summaryArr.map((row) => [
      row.speciesKey,
      row.totalCount,
      row.totalCr,
      Number.isFinite(row.totalWeight) ? row.totalWeight.toFixed(2) : "0.00",
    ]);

    const csvLines = [header, ...rows].map((r) => r.join(","));
    const csv = csvLines.join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "jarvi_merivesi_yhteenveto.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Otsikko + Tyhjennä samalla rivillä */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0 }}>
          📊 {t("summaryTab", "Yhteenveto")}
          <InfoTooltip
            text={t(
              "summaryInfo",
              "Yhteenveto laskee saalislomakkeelta talletetut tiedot lajeittain yhteen (kpl, C&R ja paino)."
            )}
          />
        </h3>

        <ClearHistoryButton />
      </div>

      {!summaryArr.length && <p>{t("noCatchData", "Ei saalistietoja.")}</p>}

      {summaryArr.map(({ speciesKey, totalCount, totalCr, totalWeight }) => (
        <p key={speciesKey}>
          {t(`fish.${speciesKey}`, speciesKey)}: {totalCount} {t("pcs", "kpl")} (
          {totalCr} C&R
          {Number.isFinite(totalWeight) && totalWeight > 0
            ? `, ${totalWeight.toFixed(2)} kg`
            : ""}
          )
        </p>
      ))}

      {summaryArr.length > 0 && (
        <button onClick={handleExportCSV} style={{ marginTop: "0.5em" }}>
          📥 {t("exportCSV", "Vie yhteenveto CSV-muodossa")}
        </button>
      )}
    </div>
  );
};

export default Summary;
