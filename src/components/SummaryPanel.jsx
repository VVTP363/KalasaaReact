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
  const { t, i18n } = useTranslation("translation");

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

    const csvNum = (v, decimals = 2) => {
    const n = Number(String(v ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return "0";
    return n.toFixed(decimals).replace(".", ","); // FI-Excel desimaalipilkku
  };

  const handleExportCSV = () => {
    if (!summaryArr.length) return;
  console.log("[SummaryPanel] lang:", i18n.language);
  console.log("[SummaryPanel] exists csvSummary.species:", i18n.exists("csvSummary.species"));
  console.log("[SummaryPanel] t(csvSummary.species):", t("csvSummary.species", { defaultValue: "Laji" }));
  console.log("[SummaryPanel] t(csvSummary.count):", t("csvSummary.count", { defaultValue: "kpl" }));

    // ✅ Otsikot käännöksillä
    const header = [
      t("csvSummary.species", { defaultValue: "Laji" }),
      t("csvSummary.count", { defaultValue: "kpl" }),
      t("csvSummary.weightKg", { defaultValue: "kg" }),
      t("csvSummary.hours", { defaultValue: "h" }),
      t("csvSummary.kgPerHour", { defaultValue: "kg/h" }),
      t("csvSummary.hourPerKg", { defaultValue: "h/kg" }),
    ];

    const rows = summaryArr.map((row) => {
      const count = Number(row.totalCount ?? 0);
      const kg = Number(row.totalWeight ?? 0);

      // tunnit: tue useita kenttiä (riippuu mitä buildSpeciesSummary antaa)
      const hours = Number(
        row.totalHours ??
          row.totalEffortHours ??
          row.totalFishingHours ??
          row.totalTimeHours ??
          0
      );

      const kgph = hours > 0 ? kg / hours : 0;
      const hpkg = kg > 0 ? hours / kg : 0;

      return [
        t(`fish.${row.speciesKey}`, { defaultValue: row.speciesKey }),
        String(count),
        csvNum(kg, 1),
        csvNum(hours, 1),
        csvNum(kgph, 2),
        csvNum(hpkg, 2),
      ];
    });

    const all = [header, ...rows];

    // ✅ ; erotin + lainaus + BOM
    const csv = all
      .map((r) =>
        r
          .map((v) => (v == null ? "" : String(v)))
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
