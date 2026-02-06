// src/components/RiverSummary.jsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { loadCatches } from "../utils/catchSummary"; // jos tämä palauttaa arrayn
import InfoTooltip from "./InfoTooltip";

const toNum = (v) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Excel-varma: erotin ;, desimaalit pilkulla, UTF-8 BOM
const fmtDec = (n, digits = 2) =>
  Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "";

const RiverSummary = () => {
  const { t } = useTranslation();

  const catches = loadCatches("virtavesisaaliit") || [];

  // Normalisoi saalisrivit (eri avainnimet -> yhtenäiset)
  const items = useMemo(() => {
    return (Array.isArray(catches) ? catches : []).map((r) => {
      const speciesKey = r.speciesKey || r.species || r.laji || r.fish || "-";
      const count = toNum(r.totalCount ?? r.count ?? r.maara ?? r.amount);
      const cr = toNum(r.totalCr ?? r.cr ?? r.crCount);
      const weightKg = toNum(r.totalWeight ?? r.weightKg ?? r.weight ?? r.paino);
      const effortHours = toNum(r.effortHours ?? r.fishingHours ?? r.hours);

      return { speciesKey, count, cr, weightKg, effortHours };
    });
  }, [catches]);

  // Lajikohtainen aggregointi: kpl, kg, h + johdetut kg/h ja h/kg
  const summary = useMemo(() => {
    const m = new Map();

    for (const r of items) {
      const key = r.speciesKey || "-";
      if (!m.has(key)) {
        m.set(key, { speciesKey: key, totalCount: 0, totalCr: 0, totalWeight: 0, totalHours: 0 });
      }
      const o = m.get(key);
      o.totalCount += toNum(r.count);
      o.totalCr += toNum(r.cr);
      o.totalWeight += toNum(r.weightKg);
      o.totalHours += toNum(r.effortHours);
    }

    const arr = Array.from(m.values());

    return arr
      .map((r) => {
        const kgph = r.totalHours > 0 ? r.totalWeight / r.totalHours : null;
        const hpkg = r.totalWeight > 0 ? r.totalHours / r.totalWeight : null;
        return { ...r, kgph, hpkg };
      })
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [items]);

  const handleExportCSV = () => {
    if (!summary.length) return;

    // Käytä ; erotinta, jotta Excel (FI) avaa sarakkeiksi
    const header = [
      t("species", "Laji"),
      t("pcs", "kpl"),
      t("crAmount", "C&R"),
      t("weightKg", "kg"),
      "h",
      "kg/h",
      "h/kg",
    ];

    const rows = summary.map((r) => [
      t(`fish.${r.speciesKey}`, r.speciesKey),
      String(r.totalCount),
      String(r.totalCr),
      fmtDec(r.totalWeight, 1),
      fmtDec(r.totalHours, 1),
      r.kgph == null ? "" : fmtDec(r.kgph, 2),
      r.hpkg == null ? "" : fmtDec(r.hpkg, 2),
    ]);

    const lines = [header, ...rows].map((row) =>
      row
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );

    const csv = "\uFEFF" + lines.join("\n"); // BOM

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "virtavesi_yhteenveto.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h3>
        📊 {t("riverSummaryTab", "Virtavesien yhteenveto")}
        <InfoTooltip
          text={t(
            "riverSummaryInfo",
            "Virtavesien yhteenveto laskee virtavesien saalislomakkeelta tallennetut lajit yhteen."
          )}
        />
      </h3>

      {!summary.length ? <p>{t("noCatchData", "Ei saalistietoja.")}</p> : null}

      {summary.length > 0 ? (
        <>
          <div style={{ marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    {t("species", "Laji")}
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
                    {t("pcs", "kpl")}
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
                    {t("weightKg", "kg")}
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
                    h
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
                    kg/h
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
                    h/kg
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.speciesKey}>
                    <td>{t(`fish.${r.speciesKey}`, r.speciesKey)}</td>
                    <td style={{ textAlign: "right" }}>{r.totalCount}</td>
                    <td style={{ textAlign: "right" }}>{r.totalWeight.toFixed(1)}</td>
                    <td style={{ textAlign: "right" }}>{r.totalHours.toFixed(1)}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.kgph == null ? "-" : r.kgph.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.hpkg == null ? "-" : r.hpkg.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={handleExportCSV} style={{ marginTop: "0.75rem" }}>
            📥 {t("exportCSVRiver", "Vie virtavesien yhteenveto CSV:ksi")}
          </button>
        </>
      ) : null}
    </div>
  );
};

export default RiverSummary;
