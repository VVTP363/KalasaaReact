// src/components/CatchSummaryChart.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { loadCatches, buildSpeciesSummary } from "../utils/catchSummary";

const COLORS = [
  "#FF6384",
  "#36A2EB",
  "#FFCD56",
  "#4BC0C0",
  "#9966FF",
  "#FF9F40",
  "#8DD17E",
  "#F17CB0",
];

const CatchSummaryChart = ({ storageKey = "saaliit" }) => {
  const { t } = useTranslation();

  const catches = loadCatches(storageKey);
  const summaryArr = buildSpeciesSummary(catches).filter(
    (s) => s.totalCount > 0
  );

  const total = summaryArr.reduce((sum, s) => sum + s.totalCount, 0);

  if (!total) {
    return <p>{t("noCatchData")}</p>;
  }

  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  let acc = 0;
  const segments = summaryArr.map((s) => {
    const fraction = s.totalCount / total;
    const length = fraction * circumference;
    const offset = acc * circumference;
    acc += fraction;
    return { ...s, length, offset };
  });

  return (
    <div style={{ marginTop: "1em" }}>
      <h4>📊 {t("speciesShareChart", "Lajien jakauma")}</h4>

      <svg viewBox="0 0 32 32" width="200" height="200">
        {/* tausta */}
        <circle cx="16" cy="16" r={radius} fill="#f5f5f5" />
        {/* sektorit */}
        {segments.map((seg, idx) => (
          <circle
            key={seg.speciesKey}
            cx="16"
            cy="16"
            r={radius}
            fill="transparent"
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth="32"
            strokeDasharray={`${seg.length} ${circumference - seg.length}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
        {/* pieni keskireikä → donitsi */}
        <circle cx="16" cy="16" r="8" fill="#ffffff" />
      </svg>

      <ul style={{ listStyle: "none", paddingLeft: 0, marginTop: "0.5em" }}>
        {segments.map((seg, idx) => (
          <li key={seg.speciesKey} style={{ marginBottom: "0.25em" }}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                marginRight: 6,
                backgroundColor: COLORS[idx % COLORS.length],
              }}
            />
            {t(`fish.${seg.speciesKey}`, seg.speciesKey)} – {seg.totalCount}{" "}
            {t("pcs")} (
            {((seg.totalCount / total) * 100).toFixed(1)} %)
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CatchSummaryChart;
