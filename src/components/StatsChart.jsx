// src/components/StatsChart.jsx
import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Scatter,
} from "recharts";
import { useTranslation } from "react-i18next";

// Poimitaan (pressure, y) -pisteet yhdestä localStorage-avaimesta
// metric: "realized" | "forecast" | "delta"
function extractPressureOhPoints(key, sourceTag, metric = "realized") {
  let arr = [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(raw)) arr = raw;
  } catch {
    arr = [];
  }

  const out = [];

  for (const d of arr) {
    const p =
      d.pressure_hPa != null
        ? Number(d.pressure_hPa)
        : d.pressure != null
        ? Number(d.pressure)
        : NaN;

    if (!Number.isFinite(p)) continue;

    const realizedRaw =
      d.realizedOH ?? d.realizedOh ?? d.realized_oh ?? d.ohRealized ?? d.OH_realized;
    const realizedOH = Number(realizedRaw);

    const forecastRaw =
      d.forecastOH ??
      d.ohForecast ??
      d.fishingInterest ??
      d.hourlyOH ??
      d.riverOH ??
      d.oh ??
      d.OH;

    const forecastOH = Number(forecastRaw);

    let y = NaN;
    if (metric === "realized") {
      // sallitaan 0
      if (Number.isFinite(realizedOH)) y = realizedOH;
    } else if (metric === "forecast") {
      if (Number.isFinite(forecastOH)) y = forecastOH;
    } else if (metric === "delta") {
      if (Number.isFinite(realizedOH) && Number.isFinite(forecastOH)) {
        y = realizedOH - forecastOH; // voi olla negatiivinen
      }
    }

    if (!Number.isFinite(y)) continue;

    // Ennusteessa 0 ei yleensä järkevä, mutta realized/delta saa olla 0/negatiivinen
    if (metric === "forecast" && y <= 0) continue;

    out.push({ pressure: p, oh: y, source: sourceTag });
  }

  return out;
}

function buildCombinedSeries(lakePoints, riverPoints, binStep = 1) {
  // binStep=1 => 1 hPa binni (suositus tähän)
  const map = new Map();

  function add(points, field) {
    for (const { pressure, oh } of points) {
      const key = Math.round(pressure / binStep) * binStep; // esim. 1012
      let obj = map.get(key);
      if (!obj) {
        obj = {
          pressure: key,
          lakeSum: 0,
          lakeCount: 0,
          riverSum: 0,
          riverCount: 0,
        };
      }
      if (field === "lake") {
        obj.lakeSum += oh;
        obj.lakeCount += 1;
      } else {
        obj.riverSum += oh;
        obj.riverCount += 1;
      }
      map.set(key, obj);
    }
  }

  add(lakePoints, "lake");
  add(riverPoints, "river");

  return Array.from(map.values())
    .map((obj) => ({
      pressure: obj.pressure,
      lakeOH: obj.lakeCount ? obj.lakeSum / obj.lakeCount : null,
      riverOH: obj.riverCount ? obj.riverSum / obj.riverCount : null,
      lakeN: obj.lakeCount,
      riverN: obj.riverCount,
    }))
    .sort((a, b) => a.pressure - b.pressure);
}

// --- UUSI: Saalis kg/h pisteet (sessiorivit) ---
function extractPressureKgPerHourPoints(key, sourceTag) {
  let arr = [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(raw)) arr = raw;
  } catch {
    arr = [];
  }

  const out = [];

  for (const d of arr) {
    const p =
      d.pressure_hPa != null
        ? Number(d.pressure_hPa)
        : d.pressure != null
        ? Number(d.pressure)
        : NaN;

    if (!Number.isFinite(p)) continue;

    const effortRaw =
      d.effortHours ??
      d.sessionHours ??
      d.fishingHours ??
      d.effort_h ??
      d.hours;

    const effortHours = Number(effortRaw);

    const kgRaw =
      d.totalKg ??
      d.kg ??
      d.weightKg ??
      d.weight_kg ??
      d.weight ??
      d.paino;

    const totalKg = Number(kgRaw);

    if (!Number.isFinite(effortHours) || effortHours <= 0) continue;
    if (!Number.isFinite(totalKg) || totalKg < 0) continue;

    const kgPerHourRaw = totalKg / effortHours;
    if (!Number.isFinite(kgPerHourRaw) || kgPerHourRaw <= 0) continue;

    const kgPerHour = Math.min(kgPerHourRaw, 10); // CAP 10 kg/h

    out.push({
      pressure: p,
      kgPerHour,
      kgPerHourRaw,
      source: sourceTag,
    });
  }

  return out;
}

function computePressureDomain(points, fallback = [995, 1035]) {
  const ps = (points || [])
    .map((x) => Number(x.pressure))
    .filter((n) => Number.isFinite(n));

  if (ps.length < 3) return fallback;

  let minP = ps[0];
  let maxP = ps[0];
  for (const v of ps) {
    if (v < minP) minP = v;
    if (v > maxP) maxP = v;
  }

  const lo = Math.floor(minP - 2);
  const hi = Math.ceil(maxP + 2);
  return [lo, hi];
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] == null) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function buildNearPeakTrend(points, binSize = 1, q = 0.85, smoothWindow = 3) {
  const bins = new Map();

  for (const p of points) {
    const x = Number(p.pressure);
    const y = Number(p.kgPerHour);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const key = Math.round(x / binSize) * binSize;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(y);
  }

  const series = Array.from(bins.entries())
    .map(([x, ys]) => {
      ys.sort((a, b) => a - b);
      const yQ = quantile(ys, q);
      return { pressure: x, kgPerHourPeak: yQ };
    })
    .filter((d) => Number.isFinite(d.kgPerHourPeak))
    .sort((a, b) => a.pressure - b.pressure);

  if (smoothWindow <= 1) return series;

  const half = Math.floor(smoothWindow / 2);
  return series.map((d, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k++) {
      const v = series[k]?.kgPerHourPeak;
      if (Number.isFinite(v)) {
        sum += v;
        n += 1;
      }
    }
    return { ...d, kgPerHourPeakSmooth: n ? sum / n : d.kgPerHourPeak };
  });
}

function findBestPressureWindow(series, windowHPa = 6) {
  const s = (Array.isArray(series) ? series : [])
    .map((d) => ({
      pressure: Number(d?.pressure),
      y: Number(d?.kgPerHourPeakSmooth ?? d?.kgPerHourPeak),
    }))
    .filter((d) => Number.isFinite(d.pressure) && Number.isFinite(d.y))
    .sort((a, b) => a.pressure - b.pressure);

  if (s.length === 0) return null;

  // jos liian vähän dataa, valitse paras yksittäinen piste
  if (s.length < 5) {
    let best = s[0];
    for (const d of s) if (d.y > best.y) best = d;
    return { mode: "single", pressure: best.pressure, score: best.y };
  }

  // arvioidaan paineaskel (mediaani)
  const diffs = [];
  for (let i = 1; i < s.length; i++) {
    const dx = s[i].pressure - s[i - 1].pressure;
    if (Number.isFinite(dx) && dx > 0) diffs.push(dx);
  }
  const step = diffs.length
    ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)]
    : 1;

  // ikkunan pisteet: vähintään 3, mutta EI KOSKAAN yli s.length
  let k = Math.max(3, Math.round((Number(windowHPa) || 0) / step) + 1);
  k = Math.min(k, s.length); // ✅ tärkein turva

  // jos k sattuu olemaan 1..2 (teoriassa ei pitäisi), pakota vähintään 1
  if (k < 1) k = 1;

  let bestScore = -Infinity;
  let bestI = 0;

  // ✅ looppi on turvallinen kun k <= s.length
  for (let i = 0; i <= s.length - k; i++) {
    let sum = 0;
    let localMax = -Infinity;

    for (let j = i; j < i + k; j++) {
      const y = s[j]?.y;
      // varmistus, vaikka ei pitäisi osua
      if (!Number.isFinite(y)) continue;
      sum += y;
      if (y > localMax) localMax = y;
    }

    const avg = sum / k;
    const score = avg * 0.85 + localMax * 0.15;

    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }

  // ✅ varmistus: jos looppi ei ajanut (ei pitäisi), palauta paras yksittäinen
  if (!Number.isFinite(bestScore)) {
    let best = s[0];
    for (const d of s) if (d.y > best.y) best = d;
    return { mode: "single", pressure: best.pressure, score: best.y };
  }

  // Palautetaan “ikkuna”: paine keskiarvona + score
  const slice = s.slice(bestI, bestI + k);
  const avgP =
    slice.reduce((acc, d) => acc + d.pressure, 0) / Math.max(1, slice.length);

  return {
    mode: "window",
    pressure: avgP,
    score: bestScore,
    k,
    startPressure: slice[0]?.pressure,
    endPressure: slice[slice.length - 1]?.pressure,
  };
}

const StatsChart = ({ source = "both" }) => {
  const metric = "realized";
  const { t } = useTranslation();

  // === OH-pisteet (toteutunut / ennuste / erotus) ===
  const lakePoints = useMemo(
    () => extractPressureOhPoints("jarvisaaliit", "lake", metric),
    [metric]
  );
  const riverPoints = useMemo(
    () => extractPressureOhPoints("virtavesisaaliit", "river", metric),
    [metric]
  );

  const { data, showLake, showRiver } = useMemo(() => {
    let d = [];
    let sl = false;
    let sr = false;

    if (source === "virtavesi") {
      d = buildCombinedSeries([], riverPoints, 1);
      sr = true;
    } else if (source === "lake") {
      d = buildCombinedSeries(lakePoints, [], 1);
      sl = true;
    } else if (source === "both") {
      d = buildCombinedSeries(lakePoints, riverPoints, 1);
      sl = true;
      sr = true;
    } else {
      d = buildCombinedSeries(lakePoints, [], 1);
      sl = true;
    }

    return { data: d, showLake: sl, showRiver: sr };
  }, [source, lakePoints, riverPoints]);

  // === kg/h-pisteet (sessioista) ===
  const lakeKgH = useMemo(
    () => extractPressureKgPerHourPoints("jarvisaaliit", "lake"),
    []
  );
  const riverKgH = useMemo(
    () => extractPressureKgPerHourPoints("virtavesisaaliit", "river"),
    []
  );

  const kgHPoints = useMemo(() => {
    if (source === "virtavesi") return riverKgH;
    if (source === "lake") return lakeKgH;
    if (source === "both") return [...lakeKgH, ...riverKgH];
    return lakeKgH;
  }, [source, lakeKgH, riverKgH]);

  const kgHTrend = useMemo(() => buildNearPeakTrend(kgHPoints, 1, 0.85, 5), [kgHPoints]);
  const bestPressure = useMemo(() => findBestPressureWindow(kgHTrend, 6), [kgHTrend]);

  const pressureDomainOH = useMemo(
    () => computePressureDomain(data?.map((d) => ({ pressure: d.pressure })) ?? [], [995, 1035]),
    [data]
  );

  const pressureDomainKgH = useMemo(
    () => computePressureDomain(kgHPoints, [995, 1035]),
    [kgHPoints]
  );

  const hasPressureChart = Array.isArray(data) && data.length > 0;
  const hasKgH = Array.isArray(kgHPoints) && kgHPoints.length > 0;

  if (!hasPressureChart && !hasKgH) {
    return <p>{t("stats.noStatsData", { defaultValue: "Ei vielä tilastodataa." })}</p>;
  }

  return (
    <div>
      {/* --- PAINE ↔ OH --- */}
      {hasPressureChart && (
        <>
          <h4>
	  📈 {t("stats.chartTitleRealized", { defaultValue: "Ilmanpaine ja toteutunut OH" })}
	</h4>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="#ccc" />
              <XAxis
                type="number"
                dataKey="pressure"
                domain={pressureDomainOH}
                allowDecimals={false}
                label={{
                  value: t("stats.pressureLabel", { defaultValue: "Ilmanpaine (hPa)" }),
                  position: "insideBottom",
                  offset: -5,
                }}
              />
              <YAxis
	  label={{
	    value: t("oh.realizedLine", { defaultValue: t("realizedOH", "Toteutunut OH") }),
	    angle: -90,
	    position: "insideLeft",
	  }}
	  domain={[0, 8]}
	/>
              <Tooltip />
              <Legend />

              {showLake && (
                <Line
                  type="monotone"
                  dataKey="lakeOH"
                  name={`🌅 ${t("stats.lakeSea", { defaultValue: "Järvi / meri" })}`}
                  stroke="#1f77b4"
                  dot={false}
                  connectNulls
                />
              )}

              {showRiver && (
                <Line
                  type="monotone"
                  dataKey="riverOH"
                  name={`🌊 ${t("stats.river", { defaultValue: "Virtavedet" })}`}
                  stroke="#d62728"
                  dot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* --- SAALIS (kg/h) × ILMANPAINE --- */}
      {hasKgH && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <h4 style={{ marginTop: 0 }}>
            📊 {t("stats.kgHourTitle", { defaultValue: "Saalis (kg/h) × ilmanpaine" })}
          </h4>

          <p style={{ margin: "0.35rem 0 0.75rem 0", opacity: 0.85 }}>
            {t("stats.kgHourDesc", {
              defaultValue:
                "Pisteet: saalis per tunti (kg/h) tallennetuista sessioista. Trendiviiva on liki-huippuja myötäilevä (kvantiili + pehmennys).",
            })}
          </p>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={kgHTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="pressure"
                  domain={pressureDomainKgH}
                  label={{
                    value: t("stats.pressureLabel", { defaultValue: "Ilmanpaine (hPa)" }),
                    position: "insideBottom",
                    offset: -5,
                  }}
                />
                <YAxis
                  type="number"
                  domain={[0, 10]}
                  label={{
                    value: t("stats.kgPerHourLabel", { defaultValue: "Saalis (kg/h)" }),
                    angle: -90,
                    position: "insideLeft",
                  }}
                />

                <Tooltip
                  formatter={(value, name, props) => {
                    if (name === "kgPerHour") {
                      const raw = props?.payload?.kgPerHourRaw;
                      const shown = Number(value);
                      if (Number.isFinite(raw) && raw > 10) {
                        return [`${shown.toFixed(2)} (cap, raw ${raw.toFixed(1)})`, "kg/h"];
                      }
                      return [shown.toFixed(2), "kg/h"];
                    }
                    if (name === "kgPerHourPeakSmooth") {
                      return [
                        Number(value).toFixed(2),
                        t("stats.nearPeakTrend", { defaultValue: "Liki-huiput" }),
                      ];
                    }
                    return [value, name];
                  }}
                />

                <Legend />

                <Scatter
                  name={t("stats.samplesKgH", { defaultValue: "Havainnot (sessio)" })}
                  data={kgHPoints}
                  dataKey="kgPerHour"
                  r={2}
                />

                <Line
                  name={t("stats.nearPeakTrend", { defaultValue: "Liki-huiput (silotettu)" })}
                  type="monotone"
                  dataKey="kgPerHourPeakSmooth"
                  data={kgHTrend}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              background: "#fafafa",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {t("stats.insightYield", { defaultValue: "🧠 Oivallus" })}
            </div>

            <div>
		  {bestPressure?.mode === "window"
		    ? t("stats.insightYieldRangeText", {
		        defaultValue:
		          "Tuottoisinta kalastuksesi näyttäisi olevan ilmanpaineella {{from}}–{{to}} hPa.",
		        from: Math.round(bestPressure.startPressure),
		        to: Math.round(bestPressure.endPressure),
		      })
		    : bestPressure?.mode === "single"
		    ? t("stats.insightYieldText", {
		        defaultValue:
		          "Tuottoisinta kalastuksesi näyttäisi olevan ilmanpaineella {{pressure}} hPa.",
		        pressure: Math.round(bestPressure.pressure),
		      })
		    : t("stats.insightYieldFallback", {
		        defaultValue:
		          "Kun saalisdataa kertyy lisää, näytän tuottoisimman ilmanpainealueen.",
		      })}
		</div>

          </div>
        </div>
      )}
    </div>
  );
};

export default StatsChart;
