// src/components/CatchDataExport.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Toast from "./Toast";
import { toCsv, downloadCsv } from "../utils/csvExport";

// pieni apufunktio tuulensuunnan tekstitykseen (fallback)
function getWindDirectionText(deg) {
  const dirs = [
    "Pohjoinen",
    "Koillinen",
    "Itä",
    "Kaakko",
    "Etelä",
    "Lounas",
    "Länsi",
    "Luode",
  ];
  const idx = Math.round((Number(deg) || 0) / 45) % 8;
  return dirs[(idx + 8) % 8];
}

// 🔭 Päätellään kuun emoji erilaisista tekstimuodoista
function inferMoonEmojiFromRecord(s) {
  if (typeof s.moonEmoji === "string" && s.moonEmoji.trim()) {
    return s.moonEmoji.trim();
  }

  const key = s.moonPhaseKey || s.moonPhase || s.moonPhaseLabel || "";
  const k = String(key).toLowerCase().trim();
  if (!k) return "";

  if (k.includes("new") || k.includes("uusikuu")) return "🌑";

  if (
    k.includes("waxing crescent") ||
    k.includes("kasvava sirppi") ||
    k.includes("kasvava sirp")
  )
    return "🌒";

  if (
    k.includes("first quarter") ||
    k.includes("ensimmäinen") ||
    k.includes("1.") ||
    k.includes("eka nelj")
  )
    return "🌓";

  if (
    k.includes("waxing gibbous") ||
    k.includes("kasvava kupera") ||
    k.includes("kasvava kuper")
  )
    return "🌔";

  if (k.includes("full") || k.includes("täysikuu") || k.includes("täysi"))
    return "🌕";

  if (
    k.includes("waning gibbous") ||
    k.includes("vähenevä kupera") ||
    k.includes("vähenevä kuper")
  )
    return "🌖";

  if (
    k.includes("last quarter") ||
    k.includes("viimeinen") ||
    k.includes("3.") ||
    k.includes("kolmas nelj")
  )
    return "🌗";

  if (
    k.includes("waning crescent") ||
    k.includes("vähenevä sirppi") ||
    k.includes("vähenevä sirp")
  )
    return "🌘";

  return "";
}

export default function CatchDataExport({ saaliit }) {
  const { t, i18n } = useTranslation();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const downloadCSV = () => {
    try {
      if (!Array.isArray(saaliit) || saaliit.length === 0) {
        setToastMsg(t("noCatchData", { defaultValue: "Ei saalistietoja." }));
        setToastOpen(true);
        return;
      }

      // Lukittu sarakejärjestys + käännettävät otsikot
	const COLUMNS = [
	  { key: "dateIso", label: t("csv.date", { defaultValue: "Päivämäärä" }), type: "text" },
	  { key: "place", label: t("csv.place", { defaultValue: "Paikka" }), type: "text" },
	  { key: "species", label: t("csv.species", { defaultValue: "Laji" }), type: "text" },
	  { key: "lengthClass", label: t("csv.length", { defaultValue: "Pituus" }), type: "text" },
	  { key: "count", label: t("csv.count", { defaultValue: "Kappalemäärä" }), type: "int" },
	  { key: "weightKg", label: t("csv.weightKg", { defaultValue: "Paino (kg)" }), type: "num", decimals: 2 },
	  { key: "cr", label: t("csv.cr", { defaultValue: "C&R" }), type: "int" },
	  { key: "pressure", label: t("csv.pressure", { defaultValue: "Ilmanpaine" }), type: "num", decimals: 1 },
	  { key: "ohForecast", label: t("csv.ohForecast", { defaultValue: "Ottihalukkuus" }), type: "num", decimals: 0 },
	  { key: "windText", label: t("csv.windDirection", { defaultValue: "Tuulen suunta" }), type: "text" },
	  { key: "moon", label: t("csv.moon", { defaultValue: "Kuun vaihe" }), type: "text" },
	  { key: "rating", label: t("csv.rating", { defaultValue: "Arviointi" }), type: "text" },	
	  { key: "realized", label: t("csv.realizedOH", { defaultValue: "Toteutunut OH" }), type: "num", decimals: 0 },
	  { key: "match", label: t("csv.realizedVsForecast", { defaultValue: "Toteuma / ennuste" }), type: "num", decimals: 2 },	
	  { key: "sourceLabel", label: t("csv.source", { defaultValue: "Lähde" }), type: "text" },
	];

      const num = (v) => {
        const s = String(v ?? "").trim();
        if (!s) return null;
        const n = Number(s.replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };

      const rows = saaliit.map((s) => {
        const dateIsoRaw = (s.date || s.aika || "").toString().slice(0, 10);
	// Excel-ystävällinen tekstipäivä: "19.10.2026"
	let dateIso = "";
	if (dateIsoRaw && dateIsoRaw.includes("-")) {
	  const [y, m, d] = dateIsoRaw.split("-");
	  dateIso = `${d}.${m}.${y}`;
	} else {
	  dateIso = dateIsoRaw;
	}
        const place = s.locationName || s.place || s.paikka || "-";
        const rawKey =
	  s.speciesKey ||
	  s.targetSpecies ||
	  s.species ||     // fallback (vanha data)
	  s.laji ||        // fallback (vanha data)
	  "";

	const cleanKey = String(rawKey || "").trim();
	const species =
	  cleanKey && cleanKey !== "__none__" && cleanKey !== "none" && cleanKey !== "-"
	    ? t(`fish.${cleanKey}`, { lng: i18n.language, defaultValue: cleanKey })
	    : "-";

        const lengthClass = s.lengthClass || s.pituus || s.length || "";

        const count = num(s.count ?? s.maara ?? s.amount ?? s.kpl ?? 0) ?? 0;

        const weightKg =
          num(s.weightKg ?? s.weight ?? s.paino ?? s.kg ?? null) ?? null;

        const cr = num(s.cr ?? s.crAmount ?? s.cr_count ?? 0) ?? 0;

        const pressure =
          num(s.pressure_hPa ?? null) ??
          num(s.pressure ?? null) ??
          (typeof s.pressure === "string"
            ? num(String(s.pressure).replace(" hPa", ""))
            : null);

        const ohForecastRaw =
          s.fishingInterest ??
          s.oh ??
          s.lakeSeaOH ??
          s.riverOH ??
          s.forecastOH ??
          null;
        const ohForecast = num(ohForecastRaw);

        let windText = "-";
        if (s.windText) windText = s.windText;
        else if (typeof s.windDirection === "string") windText = s.windDirection;
        else if (num(s.windDeg) != null) {
          const deg = num(s.windDeg);
          windText = `${getWindDirectionText(deg)} (${deg}°)`;
        }

        const moon = inferMoonEmojiFromRecord(s);

        const rating =
          s.ratingDisplay || s.rating || s.arvio || s.catchRating || "";

        const realized = num(s.realizedOH);

        const matchSource = s.ohMatchFactor ?? s.riverMatchFactor ?? null;
        const match = num(matchSource);
        const sourceKey = (s.origin || s.source || "").toString().trim() || "unknown";
        const sourceLabel = t(`source.${sourceKey}`, { defaultValue: sourceKey });


        return {
          dateIso,
          place,
          species,
          lengthClass,
          count,
          weightKg,
          cr,
          pressure,
          ohForecast,
          windText,
          moon,
          rating,
          realized,
          match,
          sourceLabel,
        };
      });

      // Suomessa turvallinen: ; erotin (desimaalit voi olla pilkulla tai pisteellä)
      const csvText = toCsv({ rows, columns: COLUMNS, delimiter: ";" });
      downloadCsv(csvText, "kalasaa_catch_export.csv");

      setToastMsg(t("toast.csvSaved", { defaultValue: "CSV tallennettu!" }));
      setToastOpen(true);

    } catch (err) {
      console.error("CSV export error:", err);
      setToastMsg(t("toast.saveError", { defaultValue: "Tallennus epäonnistui." }));
      setToastOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={downloadCSV}
        style={{
          padding: "0.4rem 0.6rem",
          border: "1px solid #888",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        💾 CSV
      </button>

      <Toast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        message={toastMsg}
      />
    </>
  );
}
