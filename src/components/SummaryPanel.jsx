// src/components/SummaryPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadCatches, buildSpeciesSummary } from "../utils/catchSummary";
import InfoTooltip from "./InfoTooltip";

const emitCatchesUpdated = () => {
  try {
    window.dispatchEvent(new Event("catchesUpdated"));
  } catch {}
};

export default function SummaryPanel({
  storageKey,
  exportFileName = "yhteenveto.csv",
  titleKey = "summaryTab",
  titleDefault = "Yhteenveto",
  infoKey = "summaryInfo",
  infoDefault = "Yhteenveto laskee saalislomakkeelta talletetut tiedot lajeittain yhteen (kpl, C&R ja paino).",
  showClear = true,
}) {
  const { t } = useTranslation();

  // pieni "tick", jolla pakotetaan reload kun localStorage muuttuu
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onUpd = () => setTick((x) => x + 1);
    window.addEventListener("catchesUpdated", onUpd);
    window.addEventListener("storage", onUpd); // toinen tab / selainikkuna
    return () => {
      window.removeEventListener("catchesUpdated", onUpd);
      window.removeEventListener("storage", onUpd);
    };
  }, []);

  const catches = useMemo(() => {
    // loadCatches osaa yleensä lukea localStoragesta avaimella
    return loadCatches(storageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, tick]);

  const summaryArr = useMemo(() => {
    return buildSpeciesSummary(catches).sort((a, b) => b.totalCount - a.totalCount);
  }, [catches]);

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
    a.download = exportFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!storageKey) return;
    const ok = window.confirm(t("confirmClear", { defaultValue: "Tyhjennetäänkö historia?" }));
    if (!ok) return;

    try {
      localStorage.removeItem(storageKey);

      // jos sinulla on stats-avain samalla nimellä, siivotaan sekin varalta
      localStorage.removeItem(`${storageKey}_stats`);
      localStorage.removeItem(`${storageKey}-stats`);
    } catch {}

    emitCatchesUpdated();
    setTick((x) => x + 1);
  };

  return (
    <div>
      {/* Otsikko + Tyhjennä samalla rivillä (IDENTTINEN järvi/meren kanssa) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0 }}>
          📊 {t(titleKey, titleDefault)}
          <InfoTooltip text={t(infoKey, infoDefault)} />
        </h3>

        {showClear ? (
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: "0.45rem 0.65rem",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
            title={t("clearHistory", { defaultValue: "Tyhjennä historia" })}
          >
            🧹 {t("clearHistory", { defaultValue: "Tyhjennä" })}
          </button>
        ) : null}
      </div>

      {!summaryArr.length && <p>{t("noCatchData", "Ei saalistietoja.")}</p>}

      {/* Sama “taulukkomuotoinen” tekstilista kuin järvi/meri */}
      {summaryArr.map(({ speciesKey, totalCount, totalCr, totalWeight }) => (
        <p key={speciesKey}>
          {t(`fish.${speciesKey}`, speciesKey)}: {totalCount} {t("pcs", "kpl")} (
          {totalCr} C&R
          {Number.isFinite(totalWeight) && totalWeight > 0 ? `, ${totalWeight.toFixed(2)} kg` : ""}
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
}
