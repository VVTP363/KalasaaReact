// src/components/LakeSeaPressureStatsCard.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
console.log("Summary.jsx render");
const PRESSURE_BUCKETS = [
  {
    key: "low",
    labelFi: "Matala",
    rangeLabel: "< 1000 hPa",
    test: (p) => p < 1000,
  },
  {
    key: "normal",
    labelFi: "Normaali",
    rangeLabel: "1000–1015 hPa",
    test: (p) => p >= 1000 && p <= 1015,
  },
  {
    key: "high",
    labelFi: "Korkea",
    rangeLabel: "> 1015 hPa",
    test: (p) => p > 1015,
  },
];

function getBucketKey(p) {
  const bucket = PRESSURE_BUCKETS.find((b) => b.test(p));
  return bucket ? bucket.key : "unknown";
}

// Yritetään löytää OH-arvo useista mahdollisista kentistä, painotus järvi/meri-puolen arvoilla
function extractLakeSeaOH(row) {
  const cand =
    row.lakeSeaOH ??
    row.ohLakeSea ??
    row.oh ??
    row.OH ??
    row.RealizedOHActive ??
    row.realizedOH;

  const v = Number(cand);
  return Number.isFinite(v) ? v : null;
}

export default function LakeSeaPressureStatsCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [avgPressure, setAvgPressure] = useState(null);
  const [avgOHAll, setAvgOHAll] = useState(null);
  const [bucketStats, setBucketStats] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalOHCount, setTotalOHCount] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("saaliit") || "[]");
      const arr = Array.isArray(raw) ? raw : [];

      if (arr.length === 0) {
        setError("Ei järvi-/merisaalistietoja.");
        setLoading(false);
        return;
      }

      const pressures = [];
      const bucketMeta = {
        low: { count: 0, ohSum: 0, ohCount: 0 },
        normal: { count: 0, ohSum: 0, ohCount: 0 },
        high: { count: 0, ohSum: 0, ohCount: 0 },
        unknown: { count: 0, ohSum: 0, ohCount: 0 },
      };

      let allOHSum = 0;
      let allOHCount = 0;

      for (const row of arr) {
        // hyväksytään useita painekenttiä
        const rawP =
          row.pressure_hPa ??
          row.pressure ??
          row.ilmanpaine ??
          row.Pressure;

        const p = Number(rawP);
        if (!Number.isFinite(p)) continue;

        pressures.push(p);

        const bucketKey = getBucketKey(p);
        if (!bucketMeta[bucketKey]) {
          bucketMeta[bucketKey] = { count: 0, ohSum: 0, ohCount: 0 };
        }
        bucketMeta[bucketKey].count += 1;

        // OH mukaan, jos löytyy
        const oh = extractLakeSeaOH(row);
        if (Number.isFinite(oh)) {
          bucketMeta[bucketKey].ohSum += oh;
          bucketMeta[bucketKey].ohCount += 1;
          allOHSum += oh;
          allOHCount += 1;
        }
      }

      if (pressures.length === 0) {
        setError("Ei ilmanpainedataa järvi-/merisaalistiedoissa.");
        setLoading(false);
        return;
      }

      const sumP = pressures.reduce((acc, v) => acc + v, 0);
      const avgP = sumP / pressures.length;

      const total = pressures.length;
      const stats = PRESSURE_BUCKETS.map((b) => {
        const meta = bucketMeta[b.key] || {
          count: 0,
          ohSum: 0,
          ohCount: 0,
        };
        const percent = total > 0 ? (meta.count / total) * 100 : 0;
        const avgOHBucket =
          meta.ohCount > 0 ? meta.ohSum / meta.ohCount : null;

        return {
          key: b.key,
          label: b.labelFi,
          rangeLabel: b.rangeLabel,
          count: meta.count,
          percent: percent.toFixed(1),
          avgOH: avgOHBucket,
          ohCount: meta.ohCount,
        };
      });

      const avgOHGlobal =
        allOHCount > 0 ? allOHSum / allOHCount : null;

      setAvgPressure(avgP.toFixed(1));
      setAvgOHAll(
        Number.isFinite(avgOHGlobal) ? avgOHGlobal.toFixed(2) : null
      );
      setBucketStats(stats);
      setTotalCount(total);
      setTotalOHCount(allOHCount);
      setLoading(false);
    } catch (e) {
      console.error("[LakeSeaPressureStatsCard] parse error:", e);
      setError("Virhe luettaessa paikallista dataa.");
      setLoading(false);
    }
  }, []);

  const bestFreqBucket =
    bucketStats.length > 0
      ? bucketStats.reduce(
          (best, b) => (b.count > (best?.count || 0) ? b : best),
          null
        )
      : null;

  const bestOHBucket =
    bucketStats.length > 0
      ? bucketStats
          .filter((b) => Number.isFinite(b.avgOH))
          .reduce(
            (best, b) =>
              b.avgOH > (best?.avgOH || -Infinity) ? b : best,
            null
          )
      : null;

  return (
    <div
      style={{
        marginTop: "2rem",
        padding: "1.5rem",
        borderRadius: "12px",
        background:
          "linear-gradient(135deg, rgba(25, 118, 210, 0.08), rgba(0, 191, 165, 0.08))",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: "0.5rem",
          fontSize: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        🌊 Ilmanpaine & ottihalukkuus – järvi/meri
      </h3>

      {loading && <p>Ladataan tilastoja…</p>}

      {!loading && error && (
        <p style={{ color: "#b00020", fontWeight: 500 }}>{error}</p>
      )}

      {!loading && !error && (
        <>
          {/* Ylärivi: keskiarvot & “pillerit” */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.8,
                  marginBottom: "0.1rem",
                }}
              >
                Keskimääräinen ilmanpaine
              </div>
              <div style={{ fontSize: "1.9rem", fontWeight: 700 }}>
                {avgPressure} hPa
              </div>
              <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                ({totalCount} saalisriviä)
              </div>

              {Number.isFinite(Number(avgOHAll)) && (
                <div
                  style={{
                    marginTop: "0.4rem",
                    fontSize: "0.9rem",
                  }}
                >
                  🎣 Keskimääräinen ottihalukkuus:{" "}
                    <strong>{avgOHAll}/8</strong>{" "}
                  <span style={{ opacity: 0.7 }}>
                    ({totalOHCount} OH-arvoa)
                  </span>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              {bestFreqBucket && (
                <div
                  style={{
                    padding: "0.5rem 0.9rem",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(0,0,0,0.05)",
                    fontSize: "0.8rem",
                  }}
                >
                  <span
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      opacity: 0.7,
                    }}
                  >
                    Tyypillisin painealue
                  </span>
                  <br />
                  <strong>
                    {bestFreqBucket.label} (
                    {bestFreqBucket.rangeLabel})
                  </strong>
                  <span style={{ opacity: 0.75 }}>
                    {" "}
                    – {bestFreqBucket.count} krt /{" "}
                    {bestFreqBucket.percent} %
                  </span>
                </div>
              )}

              {bestOHBucket && (
                <div
                  style={{
                    padding: "0.5rem 0.9rem",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid rgba(0,0,0,0.05)",
                    fontSize: "0.8rem",
                  }}
                >
                  <span
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      opacity: 0.7,
                    }}
                  >
                    Paras painealue ottihalukkuuden kannalta
                  </span>
                  <br />
                  <strong>
                    {bestOHBucket.label} (
                    {bestOHBucket.rangeLabel})
                  </strong>
                  <span style={{ opacity: 0.8 }}>
                    {" "}
                    – 🎣 OH-keskiarvo{" "}
                    {bestOHBucket.avgOH.toFixed(2)}/8
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Alarivi: “bar chart” + OH-tiedot */}
          <div>
            <div
              style={{
                fontSize: "0.9rem",
                marginBottom: "0.4rem",
                opacity: 0.85,
              }}
            >
              Ilmanpainejakauma & ottihalukkuus per painealue
            </div>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {bucketStats.map((b) => (
                <div key={b.key}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      marginBottom: "0.15rem",
                    }}
                  >
                    <span>
                      {b.label} – {b.rangeLabel}
                    </span>
                    <span>
                      {b.count} kpl ({b.percent} %)
                    </span>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      borderRadius: "999px",
                      background: "rgba(0,0,0,0.06)",
                      overflow: "hidden",
                      marginBottom: "0.15rem",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(b.percent, 100)}%`,
                        borderRadius: "999px",
                        background:
                          b.key === bestFreqBucket?.key
                            ? "rgba(0, 191, 165, 0.9)"
                            : "rgba(25, 118, 210, 0.8)",
                        transition: "width 0.3s ease-out",
                      }}
                    />
                  </div>

                  {Number.isFinite(b.avgOH) && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        opacity: 0.8,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>
                        🎣 OH-keskiarvo: {b.avgOH.toFixed(2)}/8
                      </span>
                      <span>({b.ohCount} OH-arvoa)</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Selite */}
          <p
            style={{
              marginTop: "0.9rem",
              fontSize: "0.8rem",
              opacity: 0.75,
            }}
          >
            Tämä kortti näyttää, millaisissa ilmanpaineissa olet
            saanut saalista järvillä ja merellä ja millä painealueilla
            ottihalukkuus (OH) on ollut keskimäärin paras.
            Tilasto perustuu omaan järvi-/merisaalishistoriaasi.
          </p>
        </>
      )}
    </div>
  );
}
