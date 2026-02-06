// src/components/SaalisYhteenveto.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";
import { useTranslation } from "react-i18next";
import StatsChart from "./StatsChart";
import { toCsv, downloadCsv } from "../utils/csvExport";

export default function SaalisYhteenveto() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [species, setSpecies] = useState("ALL");

  // Ladataan kaikki saaliit: vanha "saaliit" + järvi/meri "jarvisaaliit"
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem("jarvisaaliit") || "[]");
	setRows([...(Array.isArray(b) ? b : [])]);
     } catch {
       setRows([]);
     }
   }, []);

  // Normalisoidaan rivit
 const items = useMemo(() => {
  return rows.map((r) => {
    const eh = Number(
      r.effortHours ??
        r.fishingHours ??
        r.sessionHours ??
        r.kalastusaikaH ??
        r.hours
    );

    return {
      ts: new Date(r.date || r.aika || Date.now()).getTime(),
      date: (r.date || r.aika || "").toString().slice(0, 10),
      species: r.species || r.laji || "-",
      length: r.length || r.pituus || "",
      count: Number(r.count ?? r.maara) || 0,
      weight: Number(r.weight ?? r.paino) || 0,
      place: r.locationName || r.location || r.paikka || "-",
      effortHours: Number.isFinite(eh) ? eh : 0, // ✅ ei NaN
    };
  });
}, [rows]);

  // Lajisuodattimen vaihtoehdot
  const speciesOptions = useMemo(() => {
    const s = new Set(items.map((i) => i.species));
    return ["ALL", ...Array.from(s)];
  }, [items]);

  // Suodatus päivämäärän ja lajin perusteella
  const filtered = useMemo(() => {
    const fromT = from ? new Date(from + "T00:00:00Z").getTime() : -Infinity;
    const toT = to ? new Date(to + "T23:59:59Z").getTime() : Infinity;
    return items.filter((r) => {
      const dateOk = r.ts >= fromT && r.ts <= toT;
      const spOk = species === "ALL" ? true : r.species === species;
      return dateOk && spOk;
    });
  }, [items, from, to, species]);

// Custom label: estää prosentteja karkaamasta yläreunan yli
const CustomValueLabel = (props) => {
  const {
    x,
    y,
    width,
    height,
    value,
  } = props;

  if (value == null) return null;

  const label = String(value);

  // Normaalisijainti pylvään yläpuolella
  const normalY = y - 6;

  // Tarkistetaan: onko label menossa ulos ylärajasta?
  // SVG:n y=0 on yläreuna, joten liian ylös menevä label → y < 12
  const tooHigh = normalY < 12;

  // Jos liian korkea pylväs → siirretään teksti pylvään sisään
  const insideY = y + height * 0.35;

  return (
    <text
      x={x + width / 2}
      y={tooHigh ? insideY : normalY}
      textAnchor="middle"
      fontSize="12"
      fontWeight="bold"
      fill="#000000"              // aina musta teksti
      stroke="#ffffff"            // valkoinen ääriviiva kontrastiksi
      strokeWidth={2}
      paintOrder="stroke"
      style={{ pointerEvents: "none" }}
    >
      {label}
    </text>
  );
};


  // Lajikohtainen yhteenveto pylväsdiagrammiin + prosentit
  const chartData = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const key = r.species;
      if (!m.has(key))
        m.set(key, {
          laji: t(`fish.${key}`, key),
          maara: 0,
          paino: 0,
          hours: 0,
        });
      const obj = m.get(key);
      obj.maara += r.count;
      obj.paino += r.weight;

      const h = Number(r.effortHours);
      if (Number.isFinite(h) && h > 0) obj.hours += h;
    }

    const arr = Array.from(m.values());

    const totalMaara = arr.reduce((sum, r) => sum + r.maara, 0);
    const totalPaino = arr.reduce((sum, r) => sum + r.paino, 0);

    const withPct = arr.map((r) => {
      const maaraPct =
        totalMaara > 0 ? (r.maara / totalMaara) * 100 : 0;
      const painoPct =
        totalPaino > 0 ? (r.paino / totalPaino) * 100 : 0;
      const kgPerHour =
      r.hours > 0 ? r.paino / r.hours : null;

      const hoursPerKg =
      r.hours > 0 && r.paino > 0 ? r.hours / r.paino : null;

      return {
        ...r,
        maaraPct,
        painoPct,
        // näytetään muodossa "kpl% / kg%"
        labelPct: `${maaraPct.toFixed(0)}% / ${painoPct.toFixed(0)}%`,
        kgPerHour,
        hoursPerKg,
      };
    });

    return withPct.sort((a, b) => a.laji.localeCompare(b.laji));
  }, [filtered, i18n.language, t]);

const downloadSummaryCSV = () => {
  if (!chartData.length) return;

  const exportRows = chartData.map((r) => ({
    laji: r.laji,          // jo käännetty nimi
    kpl: r.maara,
    kg: r.paino,
    h: r.hours,
    kgph: Number.isFinite(r.kgPerHour) ? r.kgPerHour : "",
    hpkg: Number.isFinite(r.hoursPerKg) ? r.hoursPerKg : "",
  }));

 const COLUMNS = [
  { key: "laji", label: t("csvSummary.species", { defaultValue: "Laji" }), type: "text" },
  { key: "kpl", label: t("csvSummary.count", { defaultValue: "kpl" }), type: "int" },
  { key: "kg", label: t("csvSummary.weightKg", { defaultValue: "kg" }), type: "num", decimals: 1 },
  { key: "h", label: t("csvSummary.hours", { defaultValue: "h" }), type: "num", decimals: 1 },
  { key: "kgph", label: t("csvSummary.kgPerHour", { defaultValue: "kg/h" }), type: "num", decimals: 2 },
  { key: "hpkg", label: t("csvSummary.hourPerKg", { defaultValue: "h/kg" }), type: "num", decimals: 2 },
];

  const csvText = toCsv({ rows: exportRows, columns: COLUMNS, delimiter: ";" });
  downloadCsv(csvText, "jarvi_meri_yhteenveto.csv");
};

  // CSV-lataus
  const downloadCSV = () => {
  if (!filtered.length) return;

  const exportRows = filtered.map((r) => ({
    date: r.date,                 // YYYY-MM-DD (jätä näin, toimii parhaiten)
    place: r.place,
    species: t(`fish.${r.species}`, { defaultValue: r.species }),
    lengthClass: r.length || "",
    count: r.count ?? 0,
    weightKg: r.weight ?? 0,
    effortHours: Number.isFinite(r.effortHours) ? r.effortHours : 0,
    realizedOH: r.realizedOH ?? "",
    match: r.ohMatchFactor ?? "",
    source: r.origin || r.source || "",
  }));

  const COLUMNS = [
  { key: "date", label: t("csv.date", { defaultValue: "Päivämäärä" }), type: "text" },
  { key: "place", label: t("csv.place", { defaultValue: "Paikka" }), type: "text" },
  { key: "species", label: t("csv.species", { defaultValue: "Kalalaji" }), type: "text" },
  { key: "lengthClass", label: t("csv.length", { defaultValue: "Pituus" }), type: "text" },
  { key: "count", label: t("csv.count", { defaultValue: "Kappalemäärä" }), type: "int" },
  { key: "weightKg", label: t("csv.weightKg", { defaultValue: "Paino (kg)" }), type: "num", decimals: 2 },
  { key: "effortHours", label: t("csv.fishingHours", { defaultValue: "Kalastusaika (h)" }), type: "num", decimals: 2 },
  { key: "realizedOH", label: t("csv.realizedOH", { defaultValue: "Toteutunut OH" }), type: "num", decimals: 0 },
  { key: "match", label: t("csv.realizedVsForecast", { defaultValue: "Toteuma / ennuste" }), type: "num", decimals: 2 },
  { key: "source", label: t("csv.source", { defaultValue: "Lähde" }), type: "text" },
];

  const csvText = toCsv({ rows: exportRows, columns: COLUMNS, delimiter: ";" });
  downloadCsv(csvText, "jarvi_meri_saalishistoria.csv");
};

  // värit lajeille (kiertää, jos lajeja paljon)
  const colors = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
  ];

  return (
    <div>
      <h3>📊 {t("catchSummaryTitle", "Saalisyhteenveto")}</h3>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <label>
          {t("from", "Alkaen")}{" "}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("to", "Päättyen")}{" "}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          {t("species", "Laji")}{" "}
          <select
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
          >
            {speciesOptions.map((sp) => (
              <option key={sp} value={sp}>
                {sp === "ALL"
                  ? t("allSpecies", "Kaikki lajit")
                  : t(`fish.${sp}`, sp)}
              </option>
            ))}
          </select>
        </label>

        <button onClick={downloadSummaryCSV}>
	  ⬇️ {t("buttons.downloadSummaryCSV", { defaultValue: "Lataa yhteenveto CSV" })}
	</button>

        <button onClick={() => window.print()}>
          🖨️ {t("print", "Tulosta")}
        </button>
        
      </div>

      {chartData.length === 0 ? (
        <p>
          {t(
            "noStatsAvailable",
            "Ei dataa valituilla suodattimilla."
          )}
        </p>
      ) : (
        <>
          {/* Paine–OH -kuvaaja (järvi/meri + virtavesi) */}
          <div style={{ marginBottom: "1rem" }}>
            <StatsChart source="both" metric="delta" />
            <p
              style={{
                fontSize: "0.9rem",
                opacity: 0.8,
                marginTop: "0.5rem",
              }}
            >
              {t(
                "pressureOhExplanation",
                "Kuvaaja näyttää, miten ilmanpaine ja ottihalukkuus ovat toteutuneet järvi-/merivesillä (🌅) ja virtavesillä (🌊). Mitä enemmän saalistietoa kertyy, sitä paremmin kuvaaja paljastaa omalle kalastuksellesi tyypillisiä painealueita."
              )}
            </p>
          </div>

          {/* Viritetty pylväsdiagrammi: värit + prosentit pylvään päällä */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="laji" />
              <YAxis />
              <Tooltip />
              <Legend />
              {/* kpl-pylväät (täysi väri) */}
              <Bar dataKey="maara" name={t("pcs", "kpl")}>
                <LabelList 
		  dataKey="labelPct"
                   content={<CustomValueLabel />}
                />

                {chartData.map((entry, index) => (
                  <Cell
                    key={`maara-${entry.laji}-${index}`}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Bar>
              {/* kg-pylväät (sama väri, hieman läpikuultava) */}
              <Bar
                dataKey="paino"
                name={t("weightKg", "kg")}
                opacity={0.5}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`paino-${entry.laji}-${index}`}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Taulukko yhteenvetona */}
          <div style={{ marginTop: "0.75rem" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {t("species", "Laji")}
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {t("pcs", "kpl")}
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {t("weightKg", "kg")}     
                  </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
		      {t("effortHours", { defaultValue: "h" })}
		    </th>
		    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
		      {t("kgPerHour", { defaultValue: "kg/h" })}
		    </th>
		    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>
		      {t("hoursPerKg", { defaultValue: "h/kg" })}
		    </th>
                </tr>
              </thead>
              <tbody>
	  {chartData.map((r, idx) => (
	    <tr key={idx}>
	      <td>{r.laji}</td>
	      <td style={{ textAlign: "right" }}>{r.maara}</td>
	      <td style={{ textAlign: "right" }}>{r.paino.toFixed(1)}</td>

	      <td style={{ textAlign: "right" }}>
	        {r.hours > 0 ? r.hours.toFixed(1) : "-"}
	      </td>
	      <td style={{ textAlign: "right" }}>
	        {Number.isFinite(r.kgPerHour) ? r.kgPerHour.toFixed(2) : "-"}
	      </td>
	      <td style={{ textAlign: "right" }}>
	        {Number.isFinite(r.hoursPerKg) ? r.hoursPerKg.toFixed(2) : "-"}
	      </td>
	    </tr>
	  ))}
	</tbody>
           </table>
          </div>
        </>
      )}
    </div>
  );
}
