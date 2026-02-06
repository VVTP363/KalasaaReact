// src/components/PressureStatsCard.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const PRESSURE_BUCKETS = [
  {
    key: "low",
    rangeLabel: "< 1000 hPa",
    test: (p) => p < 1000,
  },
  {
    key: "normal",
    rangeLabel: "1000–1015 hPa",
    test: (p) => p >= 1000 && p <= 1015,
  },
  {
    key: "high",
    rangeLabel: "> 1015 hPa",
    test: (p) => p > 1015,
  },
];


function getBucketKey(p) {
  const bucket = PRESSURE_BUCKETS.find((b) => b.test(p));
  return bucket ? bucket.key : "unknown";
}

// Yritetään löytää OH-arvo useista mahdollisista kentistä
function extractOH(row) {
  const cand =
    row.riverOH ??
    row.oh ??
    row.OH ??
    row.oh8 ??
    row.lakeSeaOH ??
    row.RealizedOHActive ??
    row.realizedOH;

  const v = Number(cand);
  return Number.isFinite(v) ? v : null;
}

export default function PressureStatsCard() {
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
      const raw = JSON.parse(
        localStorage.getItem("virtavesisaaliit") || "[]"
      );

      const arr = Array.isArray(raw) ? raw : [];
      if (arr.length === 0) {
        setError(t("noCatchData", { defaultValue: "Ei saalistietoja." }));
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
        // Hyväksy useita mahdollisia painekenttiä:
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
        const oh = extractOH(row);
        if (Number.isFinite(oh)) {
          bucketMeta[bucketKey].ohSum += oh;
          bucketMeta[bucketKey].ohCount += 1;
          allOHSum += oh;
          allOHCount += 1;
        }
      }

      if (pressures.length === 0) {
        setError("Ei ilmanpainedataa saalistiedoissa.");
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
  	label: t(`pressureRanges.${b.key}`, {
    	defaultValue: b.key,
  	}),
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
        Number.isFinite(avgOHGlobal)
          ? avgOHGlobal.toFixed(2)
          : null
      );
      setBucketStats(stats);
      setTotalCount(total);
      setTotalOHCount(allOHCount);
      setLoading(false);
    } catch (e) {
      console.error("[PressureStatsCard] parse error:", e);
      setError("Virhe luettaessa paikallista dataa.");
      setLoading(false);
    }
  }, []);

  const bestFreqBucket =
    bucketStats.length > 0
      ? bucketStats.reduce(
          (best, b) =>
            b.count > (best?.count || 0) ? b : best,
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
        "linear-gradient(135deg, rgba(0, 123, 255, 0.08), rgba(0, 200, 83, 0.08))",
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
      {t("pressureCard.riverTitle", {
        defaultValue: "🌡️ Ilmanpaine & ottihalukkuus – virtavesisaaliit",
      })}
    </h3>

    {loading && (
      <p>
        {t("pressureCard.loading", {
          defaultValue: "Ladataan tilastoja…",
        })}
      </p>
    )}

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
              {t("pressureCard.avgPressure", {
                defaultValue: "Keskimääräinen ilmanpaine",
              })}
            </div>

            <div style={{ fontSize: "1.9rem", fontWeight: 700 }}>
              {avgPressure} hPa
            </div>

            <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              {t("pressureCard.rows", {
                count: totalCount,
                defaultValue: "({{count}} saalisriviä)",
              })}
            </div>

            {Number.isFinite(Number(avgOHAll)) && (
              <div style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>
                {t("pressureCard.avgOhLabel", {
                  defaultValue: "🎣 Keskimääräinen ottihalukkuus:",
                })}{" "}
                <strong>{avgOHAll}/8</strong>{" "}
                <span style={{ opacity: 0.7 }}>
                  {t("pressureCard.ohCount", {
                    count: totalOHCount,
                    defaultValue: "({{count}} OH-arvoa)",
                  })}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
                  {t("pressureCard.typicalRange", {
                    defaultValue: "Tyypillisin painealue",
                  })}
                </span>
                <br />
                <strong>
                  {bestFreqBucket.label} ({bestFreqBucket.rangeLabel})
                </strong>
                <span style={{ opacity: 0.75 }}>
                  {" "}
                  – {bestFreqBucket.count}{" "}
                  {t("pressureCard.timesShort", { defaultValue: "krt" })} /{" "}
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
                  {t("pressureCard.bestRange", {
                    defaultValue: "Paras painealue ottihalukkuuden kannalta",
                  })}
                </span>
                <br />
                <strong>
                  {bestOHBucket.label} ({bestOHBucket.rangeLabel})
                </strong>
                <span style={{ opacity: 0.8 }}>
                  {" "}
                  – {t("pressureCard.ohAvgShort", { defaultValue: "🎣 OH-keskiarvo" })}{" "}
                  {bestOHBucket.avgOH.toFixed(2)}/8
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Alarivi */}
        <div>
          <div style={{ fontSize: "0.9rem", marginBottom: "0.4rem", opacity: 0.85 }}>
            {t("pressureCard.distributionTitle", {
              defaultValue: "Ilmanpainejakauma & ottihalukkuus per painealue",
            })}
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
                    {b.count} {t("pressureCard.pcsShort", { defaultValue: "kpl" })} (
                    {b.percent} %)
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
                          ? "rgba(0, 200, 83, 0.9)"
                          : "rgba(0, 123, 255, 0.7)",
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
                      {t("pressureCard.ohAvgLabel", {
                        defaultValue: "🎣 OH-keskiarvo:",
                      })}{" "}
                      {b.avgOH.toFixed(2)}/8
                    </span>
                    <span>
                      {t("pressureCard.ohCount", {
                        count: b.ohCount,
                        defaultValue: "({{count}} OH-arvoa)",
                      })}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Selite */}
        <p style={{ marginTop: "0.9rem", fontSize: "0.8rem", opacity: 0.75 }}>
          {t("pressureCard.explanationRiver", {
            defaultValue:
              "Tämä kortti näyttää, millaisissa ilmanpaineissa olet saanut saalista virtavesissä ja millä painealueilla ottihalukkuus (OH) on ollut keskimäärin paras. Tilasto perustuu omaan saalishistoriaasi, ei suoraan sääennusteeseen.",
          })}
        </p>
      </>
    )}
  </div>
);
}
