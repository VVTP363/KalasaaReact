// src/components/VirtavesiTabs.jsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import VirtavesiIlmoitus from "./VirtavesiIlmoitus";
import StatsChart from "./StatsChart";
import CatchDataExport from "./CatchDataExport";
import ClearHistoryButton from "./ClearHistoryButton";
import { useTranslation } from "react-i18next";
import { AppContext } from "./AppContext";
// nämä saat pitää varalta, vaikka eivät juuri nyt olisikaan käytössä
import { normalizeSpecies } from "../utils/species";
import PressureStatsCard from "./PressureStatsCard";
import SpeciesStrikeForecast from "./SpeciesStrikeForecast";
import { useFishingSession } from "../hooks/useFishingSession";
import StartFishingButton from "./StartFishingButton";
import SessionMenu from "./SessionMenu";
import TargetSpeciesModal from "./TargetSpeciesModal";
import InfoTooltip from "./InfoTooltip";
import { toCsv, downloadCsv } from "../utils/csvExport";

const VirtavesiTabs = () => {
  const { t, i18n } = useTranslation();
  const ctx = useContext(AppContext);

  const session = useFishingSession({
    mode: "river",
    lang: i18n.language,
    ctxSnapshot: {
      pressure: ctx.pressure,
      windDirection: ctx.windDirection,
      windSpeed: ctx.windSpeed,
      moonPhaseKey: ctx.moonPhaseKey,
      moonEmoji: ctx.moonEmoji,
      moonPhaseLabel: ctx.moonPhaseLabel,
      forecastOH: Number.isFinite(Number(ctx.riverOH))
        ? Math.min(8, Math.max(1, Math.round(Number(ctx.riverOH))))
        : null,
      locationName: ctx.locationName,
    },
  });

  // ⬅️ EI valittua tabia aluksi → aloituksessa ei näy ilmoitus eikä historia
  const [tab, setTab] = useState(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 600 : false
  );
  const [targetOpen, setTargetOpen] = useState(false);
  const [showSpeciesForecast, setShowSpeciesForecast] = useState(false);

  const { riverOH, pressure, locationName, windDirection, moonPhase } = ctx;

  // varmuuden vuoksi OH rajataan 1–8 ja pyöristetään
  const clampedRiverOH = Number.isFinite(Number(riverOH))
    ? Math.min(8, Math.max(1, Math.round(Number(riverOH))))
    : null;

  const RIVER_TARGETS = [
    "Lohi",
    "Taimen",
    "Harjus",
    "Saimaannieriä",
    "Rautu",
    "Siika",   
    "Hauki",
    "Ahven",
  ];

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Virtavesien saaliit localStoragesta
  const [saaliit, setSaaliit] = useState([]);

  const loadSaaliit = () => {
    try {
      const raw = JSON.parse(localStorage.getItem("virtavesisaaliit") || "[]");
      setSaaliit(Array.isArray(raw) ? raw : []);
    } catch {
      setSaaliit([]);
    }
  };

  useEffect(() => {
    loadSaaliit();
  }, []);

  useEffect(() => {
  const onUpd = () => loadSaaliit();
  window.addEventListener("catchesUpdated", onUpd);
  window.addEventListener("storage", onUpd); // varalle (toinen tab)
  return () => {
    window.removeEventListener("catchesUpdated", onUpd);
    window.removeEventListener("storage", onUpd);
  };
}, []);

  // ✅ Historia: suodatin + ennustevalinta

  // ✅ YKSI suodatin: vaikuttaa sekä riveihin että laji-ennusteeseen
const [historySpecies, setHistorySpecies] = useState("ALL");

// Virtavesihistorian rivin laji: sessio/noTarget → targetSpecies, muuten species
const rowSpeciesKey = (s) => {
  const kind = String(s?.kind || "").toLowerCase();
  const isSessionRow = s?.isSession === true || kind === "session";
  const isNoTargetRow =
    s?.isTargetNone === true ||
    String(s?.targetOutcome || "").toLowerCase() === "none" ||
    s?.species === "__none__" ||
    s?.species === "none";

  const raw = isSessionRow || isNoTargetRow
    ? (s?.targetSpecies || s?.species || "")
    : (s?.species || "");

  const clean = String(raw || "").trim();
  if (!clean || clean === "__none__" || clean === "none" || clean === "-") return "";
  return clean;
};
  
  // poimi riviltä laji suodatusta varten:
  // - session / "ei tavoitesaalista" → targetSpecies
  // - muuten → species
  
  // ✅ rakentaa "Kaikki + lajit jotka löytyvät historiasta"
	const historySpeciesOptions = useMemo(() => {
  const set = new Set();
  for (const s of saaliit) {
    const k = rowSpeciesKey(s);
    if (k) set.add(k);
  }
  return ["ALL", ...Array.from(set)];
}, [saaliit]);

  const filteredSaaliit = useMemo(() => {
  if (historySpecies === "ALL") return saaliit;
  return saaliit.filter((s) => rowSpeciesKey(s) === historySpecies);
}, [saaliit, historySpecies]);

  // 📊 Yhteenveto-tabin sisältö (lajikohtaiset kpl & C&R)
  // 📊 Virtavesi-yhteenveto: kpl, kg, h, kg/h, h/kg (ulkoasu sama idea kuin järvi/meri)
const renderYhteenveto = () => {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // määrä voi olla amount / count / maara
  const getCount = (s) => num(s?.amount ?? s?.count ?? s?.maara ?? s?.kpl ?? 0);

  // paino voi olla weightKg / weight / paino
  const getWeightKg = (s) =>
    num(s?.weightKg ?? s?.weight ?? s?.paino ?? s?.kg ?? s?.weight_kg ?? 0);

  // tunnit: effortHours / fishingHours / fishingDurationMin
  const getHours = (s) => {
    const eh = s?.effortHours ?? s?.fishingHours;
    if (eh != null) return num(eh);

    const min = s?.fishingDurationMin ?? s?.durationMinutes;
    if (min != null) return num(min) / 60;

    return 0;
  };

  // sama lajilogiikka kuin historiassa (session/noTarget → targetSpecies)
  const rowsMap = new Map();

  for (const s of saaliit) {
    const speciesKey = String(rowSpeciesKey(s) || "").trim();
    if (!speciesKey) continue;

    const prev = rowsMap.get(speciesKey) || {
      speciesKey,
      totalCount: 0,
      totalWeight: 0,
      totalHours: 0,
    };

    prev.totalCount += getCount(s);
    prev.totalWeight += getWeightKg(s);
    prev.totalHours += getHours(s);

    rowsMap.set(speciesKey, prev);
  }

  const rows = Array.from(rowsMap.values())
    .map((r) => {
      const kgph = r.totalHours > 0 ? r.totalWeight / r.totalHours : 0;
      const hpkg = r.totalWeight > 0 ? r.totalHours / r.totalWeight : null;
      return { ...r, kgph, hpkg };
    })
    .sort((a, b) => b.totalCount - a.totalCount || b.totalWeight - a.totalWeight);
   
  const tFish = (raw) => {
  const k1 = String(raw || "").trim();
  if (!k1) return "";

  // 1) yritä ensin sellaisenaan (tämä on se mikä UI:ssa toimii)
  const v1 = t(`fish.${k1}`, { defaultValue: "" });
  if (v1) return v1;

  // 2) vasta sitten normalisoitu (jos teillä joskus data on “sekaisin”)
  const k2 = normalizeSpecies(k1);
  if (k2 && k2 !== k1) {
    return t(`fish.${k2}`, { defaultValue: k1 });
  }

  return k1;
};

  const handleExportCSV = () => {
  if (!rows.length) return;
  const exportLng = i18n.resolvedLanguage || i18n.language || "fi";

  const tt = i18n.getFixedT(exportLng);

  console.log("[CSV] VirtavesiTabs exportLng =", exportLng);

  const COLUMNS = [
  { key: "species", label: tt("csvSummary.species", { defaultValue: "Laji" }), type: "text" },
  { key: "kpl",     label: tt("csvSummary.count",   { defaultValue: "kpl" }), type: "int"  },
  { key: "kg",      label: tt("csvSummary.weightKg",{ defaultValue: "kg"  }), type: "num", decimals: 1 },
  { key: "h",       label: tt("csvSummary.hours",   { defaultValue: "h"   }), type: "num", decimals: 1 },
  { key: "kgph",    label: tt("csvSummary.kgPerHour",{ defaultValue: "kg/h"}), type: "num", decimals: 2 },
  { key: "hpkg",    label: tt("csvSummary.hourPerKg",{ defaultValue: "h/kg"}), type: "num", decimals: 2 },
];


const trFish = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  const direct = t(`fish.${s}`, { defaultValue: "" });
  if (direct) return direct;

  const norm = normalizeSpecies(s);
  if (norm && norm !== s) {
    const alt = t(`fish.${norm}`, { defaultValue: "" });
    if (alt) return alt;
  }
  return s;
};
  const exportRows = rows.map((r) => {
  const key = normalizeSpecies(r.speciesKey) || r.speciesKey;
  return {
    species: tt(`fish.${key}`, { defaultValue: r.speciesKey }),
    kpl: r.totalCount,
    kg: r.totalWeight,
    h: r.totalHours,
    kgph: r.totalHours > 0 ? r.kgph : 0,
    hpkg: r.hpkg != null ? r.hpkg : "",
  };
});

  const csvText = toCsv({ rows: exportRows, columns: COLUMNS, delimiter: ";" });
  downloadCsv(csvText, "virtavesi_yhteenveto.csv");
};

  return (
    <div>
      {/* Otsikko + Tyhjennä samalla rivillä (kuten järvi/meri) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0 }}>
          📊 {t("summaryTab", "Yhteenveto")}
          <InfoTooltip
            text={t(
              "summaryInfo",
              "Yhteenveto laskee saalislomakkeelta talletetut tiedot lajeittain yhteen (kpl, C&R ja paino)."
            )}
          />
        </h3>

        <ClearHistoryButton />
      </div>

      {!rows.length ? (
        <p>{t("noCatchData", "Ei saalistietoja.")}</p>
      ) : (
        <>
          <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 520, width: "100%" }}>
              <thead>
  <tr>
    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.species", { defaultValue: "Laji" })}
    </th>

    <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.count", { defaultValue: "kpl" })}
    </th>

    <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.weightKg", { defaultValue: "kg" })}
    </th>

    <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.hours", { defaultValue: "h" })}
    </th>

    <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.kgPerHour", { defaultValue: "kg/h" })}
    </th>

    <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
      {t("csvSummary.hourPerKg", { defaultValue: "h/kg" })}
    </th>
  </tr>
</thead>


              <tbody>
                {rows.map((r) => (
                  <tr key={r.speciesKey}>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {t(`fish.${r.speciesKey}`, { defaultValue: r.speciesKey })}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {Math.round(r.totalCount)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {r.totalWeight.toFixed(1)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {r.totalHours.toFixed(1)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {(r.totalHours > 0 ? r.kgph : 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>
                      {r.hpkg != null ? r.hpkg.toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={handleExportCSV} style={{ marginTop: "0.75rem" }}>
            📥 {t("exportCSV", "Vie yhteenveto CSV-muodossa")}
          </button>
        </>
      )}
    </div>
  );
};

  return (
    <div>
      {/* TAB-NAPIT + CSV + tyhjennys */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5em",
          alignItems: "flex-start",
          justifyContent: "left",
          marginBottom: "1em",
        }}
      >
        {/* 🔘 Välilehtipainikkeet – vasempaan laitaan, aktiivinen tummennettuna */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            margin: "0.5rem 0",
            justifyContent: "flex-start",
            alignItems: "center",
          }}
        >
          {/* 🌦 Sää / ennuste (tab = null) */}
          <button
            onClick={() => {
              setTab(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            title={t("forecastTab", "Sää / ennuste")}
            style={{
              flex: "1 1 60px",
              minWidth: "50px",
              maxWidth: "80px",
              padding: "0.4rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: "1.2rem",
              backgroundColor: tab === null ? "#17507c" : "#f7f7f7",
              color: tab === null ? "#ffffff" : "#333333",
              fontWeight: tab === null ? "bold" : "normal",
              boxShadow:
                tab === null ? "0 0 0 2px rgba(23,80,124,0.25)" : "none",
            }}
          >
            🌦
          </button>

          {/* 🎣 Saalisilmoitus */}
          <button
            onClick={() => setTab("ilmoitus")}
            title={t("catchTab")}
            style={{
              flex: "1 1 60px",
              minWidth: "50px",
              maxWidth: "80px",
              padding: "0.4rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: "1.2rem",
              backgroundColor: tab === "ilmoitus" ? "#17507c" : "#f7f7f7",
              color: tab === "ilmoitus" ? "#ffffff" : "#333333",
              fontWeight: tab === "ilmoitus" ? "bold" : "normal",
            }}
          >
            🎣
          </button>

          {/* 📋 Historia */}
          <button
            onClick={() => {
              setTab("historia");
              loadSaaliit();
            }}
            title={t("historyTab")}
            style={{
              flex: "1 1 60px",
              minWidth: "50px",
              maxWidth: "80px",
              padding: "0.4rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: "1.2rem",
              backgroundColor: tab === "historia" ? "#17507c" : "#f7f7f7",
              color: tab === "historia" ? "#ffffff" : "#333333",
              fontWeight: tab === "historia" ? "bold" : "normal",
            }}
          >
            📋
          </button>

          {/* 📊 Yhteenveto */}
          <button
            onClick={() => setTab("yhteenveto")}
            title={t("summaryTab")}
            style={{
              flex: "1 1 60px",
              minWidth: "50px",
              maxWidth: "80px",
              padding: "0.4rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: "1.2rem",
              backgroundColor: tab === "yhteenveto" ? "#17507c" : "#f7f7f7",
              color: tab === "yhteenveto" ? "#ffffff" : "#333333",
              fontWeight: tab === "yhteenveto" ? "bold" : "normal",
            }}
          >
            📊
          </button>

          {/* 📈 Tilastot */}
          <button
            onClick={() => setTab("tilasto")}
            title={t("statsTab")}
            style={{
              flex: "1 1 60px",
              minWidth: "50px",
              maxWidth: "80px",
              padding: "0.4rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: "1.2rem",
              backgroundColor: tab === "tilasto" ? "#17507c" : "#f7f7f7",
              color: tab === "tilasto" ? "#ffffff" : "#333333",
              fontWeight: tab === "tilasto" ? "bold" : "normal",
            }}
          >
            📈
          </button>
        </div>

        {/* Sessio */}
        <StartFishingButton
          isActive={session.isActive}
          durationText={session.durationText}
          onStart={() => setTargetOpen(true)} // ✅ avaa valikko
          onStop={() => session.stopToDraft()}
        />

        <TargetSpeciesModal
          open={targetOpen}
          title={t("session.chooseTarget", { defaultValue: "Valitse kohdekala!" })}
          speciesOptions={RIVER_TARGETS}
          onClose={() => setTargetOpen(false)}
          onSelect={(targetSpecies) => {
            setTargetOpen(false);
            session.start({
              locationName: ctx.locationName,
              targetSpecies, // ✅ tärkein
            });
          }}
        />

        <SessionMenu
          isActive={session.isActive}
          hasDraft={!!session.draftCatch}
          showStop={false}
          onStopFishing={() => {
            session.stopToDraft();
            setTab("ilmoitus");
          }}
          onSaveForLater={() => {
            session.stopToDraft();
          }}
          onGoToCatchForm={() => setTab("ilmoitus")}
          onRequestExit={() => {
            const res = session.requestExit();
            if (res.action !== "no_pending") setTab("ilmoitus");
          }}
        />

        {/* CSV-vienti käyttää samoja saaliita */}
        <CatchDataExport saaliit={saaliit} />

        {/* Tyhjennysnappi vain historiassa / yhteenvedossa */}
        {tab === "historia" && <ClearHistoryButton />}
      </div>

      {/* 🎣 Saalisilmoitus – näkyy vain kun tab === "ilmoitus" */}
      {tab === "ilmoitus" && (
        <VirtavesiIlmoitus
          riverOH={clampedRiverOH}
          pressure={pressure}
          locationName={locationName}
          windDirection={windDirection}
          moonPhase={moonPhase}
          explicitForecastOH={clampedRiverOH}
          onSaved={loadSaaliit}
          session={session}
          sessionDraft={session.draftCatch}
          onResolveTargetNone={session.resolveTargetNone}
          onMarkTargetCaught={session.markTargetCaught}
        />
      )}

      {/* 📋 Saalishistoria (virtavedet) + lajisuodatin + laji-ennuste */}
      {tab === "historia" && (
  <div style={{ marginTop: "0.75rem" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        flexWrap: "wrap",
      }}
    >
      <h4 style={{ margin: 0 }}>
        {t("catchHistory", "Saalishistoria (virtavedet)")}
      </h4>

      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {t("species", "Laji")}
        <select
          value={historySpecies}
          onChange={(e) => setHistorySpecies(e.target.value)}
        >
          {historySpeciesOptions.map((sp) => (
            <option key={sp} value={sp}>
              {sp === "ALL"
                ? t("allSpecies", { defaultValue: "Kaikki" })
                : t(`fish.${sp}`, { defaultValue: sp })}
            </option>
          ))}
        </select>
      </label>
    </div>
      
          {/* Lajikohtainen ottiennuste (näytetään vain jos ei ALL) */}
          <div style={{ marginTop: "1rem" }}>
	  {historySpecies !== "ALL" ? (
	    <SpeciesStrikeForecast
	      speciesKey={historySpecies}
	      storageKey="virtavesisaaliit"
	      showDebug={false}
	    />
	  ) : null}
	</div>


          {filteredSaaliit.length === 0 ? (
            <p style={{ marginTop: "0.75rem" }}>
              {t("noCatchData", "Ei saalistietoja.")}
            </p>
          ) : (
            <ul style={{ paddingLeft: "1.2rem", marginTop: "0.75rem" }}>
              {[...filteredSaaliit]
                .slice()
                .reverse()
                .map((s, idx) => {
                  const dateStr = s.date || s.aika || "-";

                  const kind = String(s?.kind || "").toLowerCase();
                  const isSessionRow = s?.isSession === true || kind === "session";
                  const isNoTargetRow =
                    s?.isTargetNone === true ||
                    String(s?.targetOutcome || "").toLowerCase() === "none" ||
                    s?.species === "__none__" ||
                    s?.species === "none";

                  // Valitse näytettävä laji: noTarget/session → targetSpecies, muuten species
                  const rawName =
                    isSessionRow || isNoTargetRow
                      ? (s?.targetSpecies || s?.species || "")
                      : (s?.species || "");

                  const clean = String(rawName).trim();
                  const speciesText =
                    clean && clean !== "__none__" && clean !== "none"
                      ? t(`fish.${clean}`, clean)
                      : t("unknownFish", "Tuntematon kala");

                  const noTargetNote = isNoTargetRow
                    ? (s?.targetSpecies
                        ? t("session.noTargetCatchWithTarget", {
                            species: t(`fish.${s.targetSpecies}`, {
                              defaultValue: s.targetSpecies,
                            }),
                            defaultValue: "Ei tavoitesaalista (tavoite: {{species}})",
                          })
                        : t("session.noTargetCatch", {
                            defaultValue: "Ei tavoitesaalista",
                          }))
                    : "";

                  const lengthText = s.length || s.lengthClass || "";

                  const amount = s.amount ?? s.count ?? s.maara ?? 0;
                  const cr = s.cr ?? s.crAmount ?? s.cr_count ?? 0;

                  const ratingRaw =
                    s.ratingDisplay || s.rating || s.arvio || s.catchRating || "";
                  const ratingText = ratingRaw ? String(ratingRaw) : "";

                  const place = s.locationName || s.place || s.paikka || "-";
                  let pressureStr = "-";
                  if (typeof s.pressure === "number") {
                    pressureStr = `${s.pressure.toFixed(1)} hPa`;
                  } else if (s.pressure_hPa != null) {
                    const p = Number(s.pressure_hPa);
                    pressureStr = Number.isFinite(p)
                      ? `${p.toFixed(1)} hPa`
                      : String(s.pressure_hPa);
                  } else if (typeof s.pressure === "string") {
                    pressureStr = s.pressure;
                  }

                  const windStr = s.windDirection || s.windText || "-";

                  const ohForecast = Number.isFinite(Number(s.forecastOH))
                    ? Number(s.forecastOH)
                    : Number.isFinite(Number(s.hourlyOH))
                    ? Number(s.hourlyOH)
                    : null;

                  const num = (v) => {
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                  };

                  const sf = num(s.sessionFactor);
                  const sc = (s.sessionClass || "").toString().toLowerCase();
                  const ts = s.targetSpecies ? String(s.targetSpecies) : null;

                  const eh = num(s.effortHours);
                  const w = num(s.weight) ?? 0;

                  const label =
                    sc === "weak"
                      ? t("session.weak", "Heikko")
                      : sc === "within"
                      ? t("session.within", "Ennusteen rajoissa")
                      : sc === "excellent"
                      ? t("session.excellent", "Erinomainen")
                      : null;

                  const icon =
                    sc === "excellent"
                      ? "⭐"
                      : sc === "weak"
                      ? "⚠️"
                      : sc === "within"
                      ? "✅"
                      : null;

                  const kgPerEh = eh && eh > 0 ? w / eh : null;
                  const ehPerKg = w && w > 0 ? eh / w : null;

                  let sessionPart = "";
                  if (icon && label && Number.isFinite(sf)) {
                    const targetTxt = ts ? t(`fish.${ts}`, ts) : t("target", "Kohde");
                    sessionPart += ` | ${icon} ${targetTxt}: ${label} (${sf.toFixed(2)}×)`;
                    if (Number.isFinite(kgPerEh))
                      sessionPart += ` • ${kgPerEh.toFixed(2)} kg/eh`;
                    if (Number.isFinite(ehPerKg))
                      sessionPart += ` • ${ehPerKg.toFixed(2)} eh/kg`;
                  }

                  const ohRealized =
                    num(s.realizedOH) ??
                    num(s.realizedOh) ??
                    num(s.realizedOHActive) ??
                    (s.summaryData ? num(s.summaryData.realizedOH) : null);

                  const ohMatch =
                    num(s.ohMatchFactor) ??
                    num(s.matchFactor) ??
                    num(s.OH_matchFactor) ??
                    (s.summaryData ? num(s.summaryData.ohMatchFactor) : null);

                  let ohPart = "";
                  if (ohForecast != null) {
                    ohPart += ` | OH ${Math.round(ohForecast)}`;
                  }

                  const realizedLabel = t("oh.realizedLong", {
                    defaultValue: "Toteutunut OH",
                  });
                  const missingTxt = t("common.missing", { defaultValue: "missing" });

                  const factorTxt =
			  ohMatch != null
		    ? ` (${ohMatch.toFixed(2)}×)`
		    : "";

                  if (ohRealized != null) {
                    ohPart += ` | ${realizedLabel} ${Math.round(
                      ohRealized
                    )}/8${factorTxt}`;
                  } else if (ohForecast != null) {
                    ohPart += ` | ${realizedLabel} (${missingTxt})${factorTxt}`;
                  }

                  const head = noTargetNote ? noTargetNote : speciesText;

                  const line = `${dateStr} – ${head}${
                    !noTargetNote && lengthText ? ` ${lengthText}` : ""
                  }, ${amount} kpl (${cr} C&R)${
                    ratingText ? ` – ${ratingText}` : ""
                  } 📍 ${place} | ${pressureStr} | ${windStr}${ohPart}${sessionPart}`;

                  return <li key={idx}>{line}</li>;
                })}
            </ul>
          )}
        </div>
      )}

      {/* 📊 Yhteenveto + paine/OH-kortti */}
{tab === "yhteenveto" && (
  <div style={{ marginTop: "0.75rem" }}>
    {renderYhteenveto()}

    <div style={{ marginTop: "1.5rem" }}>
      <PressureStatsCard />
    </div>
  </div>
)}

      {/* 📈 Tilastot – virtavesi + järvi/meri käppyrä + laji-ennuste napin takana */}
      {tab === "tilasto" && (
        <div style={{ marginTop: "0.75rem" }}>
          <h4>{t("statsTab", "Tilastot")}</h4>
          <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
            {t("stats.description", {
              defaultValue: "Virtavesi- ja järvi/merivesisaaliiden tilastokuvaajat.",
            })}
          </p>

          <div style={{ marginTop: "0.75rem" }}>
            <h5>🌊 {t("water.river", "Virtavedet")}</h5>
            <StatsChart source="virtavesi" metric="realized" />
          </div>

          {/* 🐟 Laji-kohtainen ottiennuste napin taakse */}
          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={() => setShowSpeciesForecast((prev) => !prev)}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "8px",
                border: "1px solid #ccc",
                background: "#f8f8f8",
                cursor: "pointer",
              }}
            >
              🐟{" "}
              {showSpeciesForecast
                ? t("hideSpeciesForecast", " Piilota laji-ottiennuste")
                : t("showSpeciesForecast", " Näytä laji-ottiennuste")}
            </button>

            {showSpeciesForecast && (
              <div style={{ marginTop: "0.75rem" }}>
                <SpeciesStrikeForecast storageKey="virtavesisaaliit" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VirtavesiTabs;