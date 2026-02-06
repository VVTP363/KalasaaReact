import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeSpecies } from "../utils/species";
import SpeciesStrikeForecast from "./SpeciesStrikeForecast";
import { recomputeAndStoreCatchStats } from "../utils/catchStats";
import { toCsv, downloadCsv } from "../utils/csvExport";

// ---- utils ----
function toISODateSafe(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function asNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}
function normalizeSessionClass(sc) {
  const s = (sc ?? "").toString().trim().toLowerCase();
  if (!s) return null;
  if (["weak", "heikko", "poor"].includes(s)) return "weak";
  if (["within", "ok", "normal", "rajoissa", "ennusteen rajoissa"].includes(s))
    return "within";
  if (["excellent", "erinomainen", "great"].includes(s)) return "excellent";
  return s;
}

function degToCompassKey(deg) {
  if (!Number.isFinite(Number(deg))) return null;
  const keys = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(Number(deg) / 45) % 8;
  return keys[(idx + 8) % 8];
}

const translateSpecies = (keyOrName, t) => {
  const safeT =
    typeof t === "function" ? t : (_k, opt) => opt?.defaultValue ?? "";

  if (!keyOrName || keyOrName === "__none__" || keyOrName === "-") return "";
  const key = normalizeSpecies(keyOrName);
  return safeT(`fish.${key}`, { defaultValue: keyOrName });
};

// ✅ sama logiikka kuin Virtavesissä: sessio/noTarget tunnistus
function isSessionLike(x) {
  if (!x) return false;
  const kind = String(x?.kind || "").trim().toLowerCase();
  const outcome = String(x?.targetOutcome || "").trim().toLowerCase();
  const sp = String(x?.species || "").trim();
  return (
    x?.isSession === true ||
    kind === "session" ||
    x?.isTargetNone === true ||
    outcome === "none" ||
    sp === "__none__"
  );
}

function normalizeRow(r) {
  const aika = r?.aika || r?.timeISO || null;

  let date = r?.date;
  let time = r?.time;

  if ((!date || !time) && typeof aika === "string" && aika.includes("T")) {
    date = date || aika.slice(0, 10);
    time = time || aika.slice(11, 16).replace(":", ".");
  }

  const kind = r?.kind || (r?.isSession || r?.targetOutcome ? "session" : "catch");
  return { ...r, date, time, kind };
}

function toTs(item) {
  const ca = Number(item?.createdAt);
  if (Number.isFinite(ca) && ca > 0) return ca;

  const d = String(item?.date || item?.aika || "").trim();
  const t0 = String(item?.time || "").trim();
  if (!d) return 0;

  let hh = "00",
    mm = "00";
  if (t0) {
    const norm = t0.replace(".", ":");
    const parts = norm.split(":");
    if (parts[0]) hh = parts[0].padStart(2, "0");
    if (parts[1]) mm = parts[1].padStart(2, "0");
  }
  const ts = new Date(`${d}T${hh}:${mm}:00`).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function makeKey(x) {
  const d = String(x?.date || "");
  const t0 = String(x?.time || "");
  const kind = String(x?.kind || "");
  const rawSp = isSessionLike(x)
    ? String(x?.targetSpecies || x?.species || "")
    : String(x?.species || "");
  const len = String(x?.length || x?.lengthClass || "");
  const w = String(x?.weight ?? x?.weightKg ?? x?.paino ?? "");
  const a = String(x?.amount ?? x?.count ?? x?.maara ?? "");
  const loc = String(x?.locationName || x?.location || x?.paikka || "");
  const src = String(x?.source || x?.origin || "");
  return [d, t0, kind, rawSp, len, w, a, loc, src].join("|");
}

function pickPressure(x) {
  const raw =
    x?.pressure ??
    x?.pressure_hPa ??
    x?.pressureHPa ??
    x?.weatherSnapshot?.pressure ??
    x?.summaryData?.pressure ??
    null;

  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickOH(x) {
  const raw =
    x?.OH ??
    x?.oh ??
    x?.forecastOH ??
    x?.lakeSeaOH ??
    x?.hourlyOH ??
    x?.weatherSnapshot?.forecastOH ??
    x?.summaryData?.forecastOH ??
    null;

  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pickWindText(x) {
  const wt =
    x?.windDirText ??
    x?.windText ??
    x?.windDirectionText ??
    x?.windDirection ??
    x?.weatherSnapshot?.windDirectionText ??
    null;

  if (wt != null && String(wt).trim()) return String(wt).trim();

  const deg = Number(x?.windDeg ?? x?.windDirection ?? x?.WindDirection);
  return Number.isFinite(deg) ? `${deg}°` : "";
}

export default function SaalisHistoria({ mode = "lake", speciesFilter = "ALL" }) {
  const { t, i18n } = useTranslation("translation");

  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // ✅ lajitekstin käännös turvallisesti (fi/en/sv/no), toimii sekä keyllä että raw-nimellä
    // ✅ lajitekstin käännös turvallisesti (fi/en/sv/no), toimii sekä keyllä että raw-nimellä
  const translateSpeciesSafe = (keyOrName) => {
    if (
      !keyOrName ||
      keyOrName === "__none__" ||
      keyOrName === "-" ||
      keyOrName === "none"
    )
      return "";

    const raw = String(keyOrName).trim();

    // 1) jos raw on jo avain (esim "salmon") ja löytyy käännöksistä
    if (i18n?.exists?.(`fish.${raw}`)) {
      return t(`fish.${raw}`, { defaultValue: raw });
    }

    // 2) normalisoi (esim "Lohi" -> "salmon") ja kokeile sillä
    const norm = normalizeSpecies(raw);
    if (norm && i18n?.exists?.(`fish.${norm}`)) {
      return t(`fish.${norm}`, { defaultValue: raw });
    }

    // 3) fallback
    return raw;
  };

  // ✅ YKSI valikko: laji suodatukseen + ennusteeseen
  const [species, setSpecies] = useState(speciesFilter || "ALL");

  useEffect(() => {
    if (speciesFilter && speciesFilter !== species) setSpecies(speciesFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesFilter]);

  function loadRowsByMode() {
    try {
      if (mode === "river") {
        const river = JSON.parse(localStorage.getItem("virtavesisaaliit") || "[]");
        return (Array.isArray(river) ? river : []).map(normalizeRow);
      }
      const lake = JSON.parse(localStorage.getItem("jarvisaaliit") || "[]");
      return (Array.isArray(lake) ? lake : []).map(normalizeRow);
    } catch {
      return [];
    }
  }


  useEffect(() => {
    setRows(loadRowsByMode());

    const onUpdate = () => setRows(loadRowsByMode());
    window.addEventListener("catchesUpdated", onUpdate);
    window.addEventListener("storage", onUpdate);

    return () => {
      window.removeEventListener("catchesUpdated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const sortedRows = useMemo(() => {
    const arr = Array.isArray(rows) ? rows : [];
    const dedup = new Map();
    for (const x of arr) {
      if (!x) continue;
      const k = makeKey(x);
      if (!dedup.has(k)) dedup.set(k, x);
    }
    return Array.from(dedup.values())
      .map((x, idx) => ({ ...x, __idx: idx }))
      .sort((a, b) => toTs(b) - toTs(a) || b.__idx - a.__idx);
  }, [rows]);

  // ✅ mapataan UI-rivit
  const items = useMemo(() => {
    const lang = i18n.language || "fi";

    return sortedRows.map((r) => {
      const dateISO = toISODateSafe(r.date || r.aika);

      const kind =
        r?.kind || (r?.isSession || r?.isTargetNone || r?.targetOutcome ? "session" : "catch");
      const isSess = kind === "session";

      const rawTarget = String(r?.targetSpecies || "").trim();
      const rawCatch = String(r?.species || "").trim();

      const isNoTargetRow =
        r?.isTargetNone === true ||
        String(r?.targetOutcome || "").toLowerCase() === "none" ||
        rawCatch === "__none__";

      const targetNorm =
        rawTarget && rawTarget !== "__none__" && rawTarget !== "-"
          ? normalizeSpecies(rawTarget)
          : "";
      const catchNorm =
        rawCatch && rawCatch !== "__none__" && rawCatch !== "-" ? normalizeSpecies(rawCatch) : "";

      // ✅ historiarivin "lajiavain" suodatukseen:
      
      const speciesKey =
       isSess || isNoTargetRow
       ? (targetNorm || catchNorm || "")
       : (catchNorm || targetNorm || "");

  // ✅ näytettävä lajiteksti (toimii fi/en/sv/no): ensin key, sitten raw, sitten fallback
const titleSpecies =
  speciesKey ? translateSpeciesSafe(speciesKey) : (r?.speciesRaw || rawCatch || "—");

// displayName: noTarget → "Ei tavoitesaalista (tavoite: X)"
const displayName = isNoTargetRow
  ? targetNorm
    ? t("session.noTargetCatchWithTarget", {
        species: translateSpeciesSafe(targetNorm),
        defaultValue: "Ei tavoitesaalista (tavoite: {{species}})",
      })
    : t("session.noTargetCatch", { defaultValue: "Ei tavoitesaalista" })
  : titleSpecies;

      const pressureVal = pickPressure(r);
      const ohVal = pickOH(r);
      const windTextVal = pickWindText(r);	

      const count = asNum(r.amount ?? r.count ?? r.maara) ?? 0;
      const cr = asNum(r.cr ?? r.crCount ?? r.crAmount) ?? 0;
      const weight = asNum(r.weight ?? r.weightKg ?? r.paino) ?? 0;
      const place = r.locationName || r.paikka || r.location || "-";
      const pressure = asNum(r.pressure ?? r.pressure_hPa);
      
      // OH ennuste
      let ohRaw = null;
      if (r.summaryData && typeof r.summaryData.oh === "string") {
        const part = r.summaryData.oh.split("/")[0];
        const parsed = Number(part);
        if (Number.isFinite(parsed)) ohRaw = parsed;
      }
      if (ohRaw == null && r.summaryData && typeof r.summaryData.fishingInterest === "number") {
        ohRaw = r.summaryData.fishingInterest;
      }
      if (ohRaw == null && typeof r.fishingInterest === "number") ohRaw = r.fishingInterest;
      if (ohRaw == null) {
        const tmp = asNum(r.oh ?? r.OH ?? r.forecastOH ?? r.hourlyOH);
        if (Number.isFinite(tmp)) ohRaw = tmp;
      }
      const OH = Number.isFinite(ohRaw) ? Math.max(1, Math.min(8, Math.round(ohRaw))) : null;
      // ✅ Lopulliset arvot: jos uusi poiminta löytyi, käytä sitä. Muuten fallback vanhaan logiikkaan.
	const pressureFinal = pressureVal ?? pressure ?? null;
	const ohFinal = ohVal ?? OH ?? null;

	// windTextVal voi olla esim "Itä (76°)" tai "76°" → jos tyhjä, käytä laskettua windDi  
        const windDeg = asNum(r.windDeg ?? r.windDirection ?? r.WindDirection);
	const windFinal =
	  Number.isFinite(windDeg)
	    ? `${t(`windDirections.${degToCompassKey(windDeg)}`, {
	        defaultValue: degToCompassKey(windDeg),
	      })} (${windDeg}°)`
	    : "";
  
      // Toteuma + kerroin vain saalisriveille
      let realizedStored =
        asNum(r.realizedOH) ??
        asNum(r.realizedOHActive) ??
        asNum(r.ohRealized) ??
        (r.summaryData ? asNum(r.summaryData.realizedOH) : null);

      let matchStored =
        asNum(r.ohMatchFactor) ??
        asNum(r.OH_matchFactor) ??
        asNum(r.matchFactor) ??
        (r.summaryData ? asNum(r.summaryData.ohMatchFactor) : null);

      if (isNoTargetRow || isSess) {
        realizedStored = null;
        matchStored = null;
      }

      const factor = asNum(matchStored);
      const showFactor = !isNoTargetRow && !isSess && Number.isFinite(factor) && factor > 0.01;

      const realizedFinal =
        !isNoTargetRow &&
        !isSess &&
        Number.isFinite(realizedStored) &&
        realizedStored > 0
          ? realizedStored
          : null;

      // sessionFactor badge (valinnainen)
      const sessionFactor = asNum(r.sessionFactor);
      const sessionClass = normalizeSessionClass(r.sessionClass);

      return {
        dateISO,
        speciesKey: speciesKey || "",
        speciesRaw: r?.speciesRaw || rawCatch || "",
        displayName,
        length: r.length || r.lengthClass || r.pituus || "",
        count,
        cr,
        weight,
        place,
        pressure: pressureFinal,
	OH: ohFinal,
	windDirText: windFinal,
        realizedOH: realizedFinal,
        ohMatchFactor: factor,
        showFactor,
        isSession: isSess,
        isTargetNone: isNoTargetRow,
        targetSpecies: targetNorm || null,
        origin: mode === "river" ? "river" : "lake",
        effortHours: asNum(r.effortHours),
        sessionFactor,
        sessionClass,
      };
    });
  }, [sortedRows, i18n.language, t, mode]);

  const speciesOptions = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it?.speciesKey) set.add(it.speciesKey);
    }
    return ["ALL", ...Array.from(set)];
  }, [items]);

  // ✅ suodatus: päivämäärä + laji
  const filtered = useMemo(() => {
    const fromT = from ? new Date(from + "T00:00:00Z").getTime() : -Infinity;
    const toT = to ? new Date(to + "T23:59:59Z").getTime() : Infinity;

    return items.filter((it) => {
      const ts = it.dateISO ? new Date(it.dateISO + "T12:00:00Z").getTime() : 0;
      const dateOk = ts >= fromT && ts <= toT;

      const spOk = species === "ALL" ? true : String(it?.speciesKey || "") === species;

      return dateOk && spOk;
    });
  }, [items, from, to, species]);

 const catchRows = useMemo(
  () => filtered.filter((r) => !r.isSession && !r.isTargetNone),
  [filtered]
);

  const totals = useMemo(() => {
    return catchRows.reduce(
      (acc, r) => {
        acc.count += r.count || 0;
        acc.weight += r.weight || 0;
        return acc;
      },
      { count: 0, weight: 0 }
    );
  }, [catchRows]);

  // (valinnainen) stats recompute järvi/meri -puolelle
  useEffect(() => {
    if (mode === "lake") {
      try {
        recomputeAndStoreCatchStats("jarvisaaliit", "jarvisaaliit_stats");
      } catch {
        // ignore
      }
    }
  }, [mode, rows]);

  const downloadCSV = () => {
  console.log("[CSV] lang:", i18n.language);

  const header = [
    t("csv.date", { defaultValue: "Päivämäärä" }),
    t("csv.place", { defaultValue: "Paikka" }),
    t("csv.species", { defaultValue: "Kalalaji" }),
    t("csv.count", { defaultValue: "Kappalemäärä" }),
    t("csv.weightKg", { defaultValue: "Paino (kg)" }),
    t("csv.length", { defaultValue: "Pituus" }),
    t("cr", "Catch & Release"),
    t("pressure", "Ilmanpaine"),
    t("catchLikelihoodShort", "Ottihalukkuus"),
    t("windDirection", "Tuulen suunta"),
    t("csv.realizedOH", { defaultValue: "Toteutunut OH" }),
    t("csv.realizedVsForecast", { defaultValue: "Toteuma / ennuste" }),
    t("csv.source", { defaultValue: "Lähde" }),
  ];

  // ✅ helperit TÄHÄN (ennen dataRows)
  const getSpeciesKey = (r) => {
    const direct = String(r?.speciesKey || "").trim();
    if (direct) return direct;

    const raw = String(
      r?.speciesRaw || r?.laji || r?.species || r?.displayName || ""
    ).trim();

    return normalizeSpecies(raw) || "";
  };

  const getSpeciesLabel = (r) => {
    const key = getSpeciesKey(r);
    const fallback = String(
      r?.speciesRaw || r?.laji || r?.species || r?.displayName || key || ""
    ).trim();

    return key ? t(`fish.${key}`, { defaultValue: fallback }) : fallback;
  };

  // (valinnainen) debug sample nyt oikein:
  console.log(
    "[CSV] sample:",
    filtered.slice(0, 5).map((r) => {
      const key = getSpeciesKey(r);
      return {
        raw: r.speciesRaw || r.laji || r.species || r.displayName,
        stored: r.speciesKey,
        normalizedKey: key,
        exists: key ? i18n.exists(`fish.${key}`, { ns: "translation" }) : null,
        translated: key ? t(`fish.${key}`, { defaultValue: "MISSING" }) : null,
      };
    })
  );

  const asText = (v) =>
    v === null || v === undefined || v === "" ? "" : "\t" + String(v);

  const dataRows = filtered.map((r) => {
    const csvSpecies = getSpeciesLabel(r);

    // ... tee muut sarakkeet kuten ennen ...
    // PALAUTA TAULUKKORIVI:
    return [
      r.date || "",
      r.paikka || r.place || "",
      csvSpecies,
      asText(r.amount ?? r.maara ?? ""),
      asText(r.weightKg ?? r.paino ?? ""),
      r.lengthClass ?? r.pituus ?? "",
      asText(r.crCount ?? r.cr ?? ""),
      asText(r.pressure ?? ""),
      asText(r.oh ?? r.fishingInterest ?? ""),
      r.windText ?? r.windHuman ?? "",
      r.realizedOH ?? "",
      r.ohMatchFactor ?? "",
      r.source ?? r.origin ?? "",
    ];
  });

  const allRows = [header, ...dataRows];

  const csvBody = allRows
    .map((row) =>
      row
        .map((v) => (v === null || v === undefined ? "" : String(v).replace(/"/g, '""')))
        .map((v) => `"${v}"`)
        .join(";")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "catch_history_filtered.csv";
  a.click();
  URL.revokeObjectURL(url);
};

  // ✅ ennuste käyttää samaa lajia kuin suodatin; jos ALL, näytä vaikka Ahven fallbackina
  const forecastSpeciesKey = species !== "ALL" ? species : "Ahven";
  const storageKey = mode === "river" ? "virtavesisaaliit" : "jarvisaaliit";

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t("historyTitle", "Saalishistoria")}</h3>

      {/* ✅ Lajikohtainen ottiennuste (synkassa lajivalikon kanssa) */}
      <div
        style={{
          margin: "0.75rem 0",
          padding: "0.5rem 0",
          borderTop: "1px solid #ddd",
          borderBottom: "1px solid #eee",
        }}
      >
        <SpeciesStrikeForecast
          speciesKey={forecastSpeciesKey}
          storageKey={storageKey}
          showDebug={false}
        />
      </div>

      {/* Suodattimet + CSV */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <label>
          {t("from", "Alkaen")}{" "}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>

        <label>
          {t("to", "Päättyen")}{" "}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>

        <label>
          {t("species", "Laji")}{" "}
          <select value={species} onChange={(e) => setSpecies(e.target.value)}>
            {speciesOptions.map((sp) => (
              <option key={sp} value={sp}>
                {sp === "ALL"
                  ? t("allSpecies", { defaultValue: "Kaikki" })
                  : t(`fish.${sp}`, { defaultValue: sp })}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={downloadCSV}>
          ⬇️ {t("downloadCSV", "Lataa CSV")}
        </button>
      </div>

      <div style={{ margin: "0.5rem 0", opacity: 0.85 }}>
        {t("history.total", { defaultValue: "Yhteensä" })}: {catchRows.length}{" "}
        {t("history.rows", { defaultValue: "riviä" })} •{" "}
        {t("history.pcs", { defaultValue: "kpl" })}: {totals.count} •{" "}
        {t("history.weightKg", { defaultValue: "kg" })}: {totals.weight.toFixed(1)}
      </div>

      {!filtered.length ? (
        <p>{t("noHistory", "Ei tallennettuja saaliita valituilla suodattimilla.")}</p>
      ) : (
        <ul style={{ paddingLeft: "1em" }}>
          {[...filtered].map((r, idx) => {
            const key = `${r.dateISO || "x"}-${idx}`;

            if (r.isSession) {
              return (
                <li key={key} style={{ marginBottom: "0.25em" }}>
                  {r.dateISO} – {r.displayName}
                  {" | "} 📍 {r.place}
                  {Number.isFinite(r.effortHours) ? ` • ${r.effortHours.toFixed(2)} h` : ""}
                </li>
              );
            }

            return (
              <li key={key} style={{ marginBottom: "0.25em" }}>
                {r.dateISO} – {r.displayName}
                {r.length ? ` ${r.length}` : ""}, {r.count} kpl ({r.cr} C&R)
                {r.weight ? `, ${r.weight} kg` : ""}
                {" | "} 📍 {r.place}
                {" | "} {r.pressure ?? "-"} hPa
                {" | "} {r.windDirText || "-"}
                {" | "} OH {r.OH ?? "-"}

                {Number.isFinite(r.realizedOH) ? (
                  <>
                    {" | "} {t("oh.realizedLine", { defaultValue: "Toteutunut OH" })}{" "}
                    {Math.round(r.realizedOH)}/8
                    {r.showFactor && Number.isFinite(r.ohMatchFactor)
                      ? ` (${r.ohMatchFactor.toFixed(2)}×)`
                      : ""}
                  </>
                ) : r.showFactor && Number.isFinite(r.ohMatchFactor) ? (
                  <>
                    {" | "} {t("oh.realizedLine", { defaultValue: "Toteutunut OH" })}{" "}
                    {t("history.missingRealized", { defaultValue: "(puuttuu)" })} (
                    {r.ohMatchFactor.toFixed(2)}×)
                  </>
                ) : null}
                

                {r.origin === "river" ? (
                  <>
                    {" | "} 🌊 {t("origin.river", "Virtavesi")}
                  </>
                ) : (
                  <>
                    {" | "} 🌅 {t("origin.lake", "Järvi/Meri")}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}