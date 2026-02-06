// src/components/LakeSeaCatchForm_fixed.jsx
import React, { useMemo, useState, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppContext } from "./AppContext";
import { normalizeSpecies, toFiCanonical } from "../utils/species";
import { useRealizedOHActive } from "../hooks/useRealizedOHActive";
import Toast from "./Toast";
import { recomputeAndStoreCatchStats } from "../utils/catchStats";
import { devWarn } from "../utils/devInvariant";
import { classifySessionFactor } from "../utils/sessionRating";
import { TARGET_KG_BY_SPECIES } from "../utils/sessionTarget";

// Apuri: kääntää kalalajin i18next-avaimella fish.<Laji>
const translateSpecies = (sp, t) => {
  const key = normalizeSpecies(sp); // "Hauki" -> "pike"
  return sp ? t(`fish.${key}`, { defaultValue: sp }) : "";
};

// ---- helpers ----
const SAALIS_KEY = "jarvisaaliit";

// normalisoi pyyntitapa-avaimeksi (data → i18n)
const normalizeFishingMethodKey = (v) => {
  if (!v) return "";
  const s = String(v).trim().toLowerCase();

  // oikeat avaimet
  if (s === "active" || s === "passive") return s;

  // suomi
  if (s === "aktiivinen") return "active";
  if (s === "passiivinen") return "passive";

  // ruotsi / norja / englanti varalle
  if (s === "aktiv") return "active";
  if (s === "passiv") return "passive";

  return "";
};

const readArr = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const writeArr = (key, arr) => {
  localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
};

const emitCatchesUpdated = () => {
  try {
    window.dispatchEvent(new Event("catchesUpdated"));
  } catch {}
};

// tuulen suunnan tekstitys
const degToCompass = (deg, lang = "fi") => {
  const fi = ["Pohjoinen", "Koillinen", "Itä", "Kaakko", "Etelä", "Lounas", "Länsi", "Luode"];
  const en = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const arr = lang === "fi" ? fi : en;
  const idx = Math.round((Number(deg) || 0) / 45) % 8;
  return arr[(idx + 8) % 8];
};

const speciesOptions = [
  "Hauki",
  "Kuha",
  "Ahven",
  "Made",
  "Särkikalat",
  "Siika",
  "Lohi",
  "Taimen",
  "Harjus",
  "Rautu",
];

// lajikohtaiset pituusluokat
const pituudet = {
  Ahven: [],
  Hauki: ["<45 cm", "46–50 cm", "51–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", ">81-100 cm", ">101-120 cm", ">121 cm"],
  Kuha: ["<42 cm", "43–50 cm", "51–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", ">90 cm"],
  Made: [],
  Muikku: [],
  Särkikalat: [],
  Lohi: ["<50 cm", "50–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", "91–100 cm", "101–110 cm", "111–120 cm", "121–130 cm", ">130 cm"],
  Taimen: ["<50 cm", "51–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", ">90 cm"],
  Harjus: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
  Saimaannieriä: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
  Rautu: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
  Siika: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
};

// kuunvaihe-tekstitys (string tai object → siisti label)
const getMoonPhaseText = (moonPhaseKey, t) => {
  if (!moonPhaseKey) return "-";

  let kebab = "";
  if (typeof moonPhaseKey === "object") {
    kebab = moonPhaseKey.kebab || moonPhaseKey.camel || "";
  } else if (typeof moonPhaseKey === "string") {
    kebab = moonPhaseKey.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }
  if (!kebab) return "-";
  return t(`moonPhaseNames.${kebab}`, kebab);
};

export default function LakeSeaCatchForm({
  sessionDraft,
  sessionActive,
  activeTargetSpecies,
  sessionKey: sessionKeyProp,
  onTargetNone,
  onAfterSave,
}) {

  const { t, i18n } = useTranslation("translation");
  const lang = i18n.language;

  const {
    pressure,
    windDirection,
    windSpeed,
    moonPhaseKey,
    moonEmoji,
    locationName,
    locationCoords,
    lakeSeaOH,
    computeOH,
  } = useContext(AppContext);

     // ---- lomakkeen tilat ----
  const [laji, setLaji] = useState("");
  const [pituus, setPituus] = useState("");
  const [maara, setMaara] = useState("");
  const [cr, setCr] = useState("");
  const [paino, setPaino] = useState("");
  const [arvio, setArvio] = useState("");
  const [pyydys, setPyydys] = useState("1");
  const [pyyntitapa, setPyyntitapa] = useState("active");
  const [saving, setSaving] = useState(false);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // vapautus: kun tavoite kirjattu tai “ei tavoitesaalista”
  const [lockReleased, setLockReleased] = useState(false);

  // yksi “tallennettu” -vihje (toast/banner)
  const [showSavedHint, setShowSavedHint] = useState(false);
  const [savedHintKey, setSavedHintKey] = useState(""); // "targetSaved" | "targetNone" | ""

  // ---- kohdekala sessiosta (ainoa “totuus” tässä komponentissa) ----
  // ---- kohdekala: aktiivinen sessio ensin, sitten draft ----
const draftTarget = (() => {
  // jos sessio on aktiivinen → käytä VAIN aktiivisen session targetia (tai activeTargetSpecies)
  if (sessionActive) {
    return (
      activeTargetSpecies ||
      sessionActive?.targetSpecies ||
      sessionActive?.target ||
      ""
    );
  }
  // jos ei aktiivinen sessio → voidaan käyttää draftia (edellisen stopin jälkeen)
  return (
    activeTargetSpecies ||
    sessionDraft?.targetSpecies ||
    sessionDraft?.target ||
    ""
  );
})();

const lockedSpecies = normalizeSpecies(draftTarget || "");
const lockedSpeciesRaw = String(draftTarget || "").trim(); // UI (FI)
const lockedSpeciesKey = normalizeSpecies(lockedSpeciesRaw); // data key (jos tarvitset)
const hasTarget = Boolean(lockedSpeciesRaw);

const effectiveLock = hasTarget && !lockReleased;

const sessionKey =
  sessionKeyProp ||
  sessionActive?.startedAt ||
  sessionActive?.id ||
  sessionDraft?.startedAt ||
  sessionDraft?.id ||
  null;
 
const showHint = (key) => {
  setShowSavedHint(false);
  setSavedHintKey(key);
  setShowSavedHint(true);
};

// kun kohdekala vaihtuu (uusi sessio / uusi tavoite), nollaa vapautus + vihje
useEffect(() => {
  setLockReleased(false);
  setToastOpen(false);
  setShowSavedHint(false);
  setLaji("");
  setPituus("");
  setMaara("");
  setCr("");
  setPaino("");
  setArvio("");
  setPyydys("1");
  setPyyntitapa("active");
}, [sessionKey, lockedSpeciesRaw]);

// auto-hide toast
useEffect(() => {
  if (!toastOpen) return;
  const tid = setTimeout(() => setToastOpen(false), 2500);
  return () => clearTimeout(tid);
}, [toastOpen]);

// pakota lomakkeen laji kohdekalaan kun lukko on päällä
useEffect(() => {
  if (effectiveLock && lockedSpeciesRaw) {
    setLaji(lockedSpeciesRaw);     // ✅ pysyy "Hauki"
    setPituus("");
  }
}, [effectiveLock, lockedSpeciesRaw]);


useEffect(() => {
  if (!showSavedHint) return;
  const tid = window.setTimeout(() => setShowSavedHint(false), 2000); // 2s riittää
  return () => window.clearTimeout(tid);
}, [showSavedHint]);

  // header-numerot
  const presNum = Number.isFinite(pressure) ? Number(pressure) : null;
  const windDeg = Number.isFinite(windDirection) ? Math.round(Number(windDirection)) : null;

  // yhteinen järvi/meri-ennuste-OH
  const forecastOH = useMemo(() => {
    if (Number.isFinite(lakeSeaOH)) {
      const v = Math.round(Number(lakeSeaOH));
      return Math.max(1, Math.min(8, v));
    }
    if (!Number.isFinite(pressure) || !Number.isFinite(windDirection) || typeof computeOH !== "function") {
      return null;
    }
    const raw = computeOH({ pressure, windDirection, moonPhaseKey });
    if (!Number.isFinite(raw)) return null;
    const v = Math.round(Number(raw));
    return Math.max(1, Math.min(8, v));
  }, [lakeSeaOH, pressure, windDirection, moonPhaseKey, computeOH]);

  const safeWeight = useMemo(() => {
    const n = parseFloat((paino ?? "").toString().replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [paino]);

  const safeCount = useMemo(() => {
    const n = parseInt((maara ?? "").toString().replace(",", "."), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [maara]);

  const safeCr = useMemo(() => {
    const n = parseInt((cr ?? "").toString(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [cr]);

  // sessioajat
  const sessionDurMin = useMemo(() => {
    const v = sessionDraft?.durationMinutes;
    const n = v != null ? Number(v) : null;
    return Number.isFinite(n) ? n : null;
  }, [sessionDraft?.durationMinutes]);

  const fishingHours = useMemo(() => (Number.isFinite(sessionDurMin) ? sessionDurMin / 60 : 0), [sessionDurMin]);

  const fishingTimeText = useMemo(() => {
    if (!Number.isFinite(sessionDurMin) || sessionDurMin <= 0) return "-";
    return `~${(sessionDurMin / 60).toFixed(2)} h`;
  }, [sessionDurMin]);

  const sessionTimeText = useMemo(() => {
    if (!Number.isFinite(sessionDurMin) || sessionDurMin <= 0) return "-";
    return `${sessionDurMin} min`;
  }, [sessionDurMin]);

  devWarn(
    !sessionDraft || (Number.isFinite(sessionDurMin) && sessionDurMin > 0),
    "sessionDraft exists but durationMinutes missing/<=0. Check useFishingSession.stopToDraft() -> draft.durationMinutes",
    { durationMinutes: sessionDraft?.durationMinutes, keys: sessionDraft ? Object.keys(sessionDraft) : [] }
  );

  const placeText =
    locationName && String(locationName).trim()
      ? locationName
      : locationCoords && Number.isFinite(locationCoords?.lat) && Number.isFinite(locationCoords?.lon)
      ? `GPS (${Number(locationCoords.lat).toFixed(3)}, ${Number(locationCoords.lon).toFixed(3)})`
      : "-";

  const isOnlyWeightFish = laji === "Muikku" || laji === "Särkikalat";
  const kalalajit = Object.keys(pituudet);

  const moonLabel = getMoonPhaseText(moonPhaseKey, t);
  const moonDisplay = `${moonEmoji || "🌙"} ${moonLabel}`;

  // pyyntitapa avaimena (active/passive)
const methodKey = normalizeFishingMethodKey(pyyntitapa);

// toteutunut OH aktiivipyynnille
const { realizedOH, matchFactor } = useRealizedOHActive({
  species: laji,
  catchKg: safeWeight,
  fishingHours,
  gearUnits: Number(pyydys),
  forecastOH: forecastOH ?? undefined,
  enabled:
    methodKey === "active" &&
    safeWeight > 0 &&
    Number(pyydys) > 0 &&
    fishingHours > 0,
});


  const buildCatch = () => {
    const currentTimeISO = new Date().toISOString();
    const currentDay = currentTimeISO.slice(0, 10);
    const nowISO = new Date().toISOString();
    const day = nowISO.slice(0, 10);
    const hhmm = nowISO.slice(11, 16).replace(":", ".");
    const presNow = presNum;
    const windDegNow = windDeg;

    const pressureDisplay = presNow != null ? `${presNow.toFixed(1)} hPa` : "-";
    const ohDisplay = forecastOH != null ? `${forecastOH}/8` : "-";
    const ohv = forecastOH != null ? Number(forecastOH) : null;
    const speedRounded = Number.isFinite(windSpeed) ? `${Number(windSpeed).toFixed(1)} m/s` : "";
    const windHuman =
      windDegNow != null
        ? `${degToCompass(windDegNow, lang)} (${windDegNow}°)${speedRounded ? ` 💨 ${speedRounded}` : ""}`
        : "-";

    const realized = Number.isFinite(realizedOH) ? Number(realizedOH) : null; // sallii 0
    const match = Number.isFinite(matchFactor) ? Number(matchFactor) : null;  // sallii 0 (mutta ei näytetä jos 0)

    const realizedDisplay = realized != null ? `${realized}/8` : "-";
    const matchDisplay =
    realized != null && Number.isFinite(match) && match > 0 ? ` (${match.toFixed(2)}×)` : "";

    // tavoite kg/h lasketaan kohdelajista jos on
    const targetKey = normalizeSpecies(lockedSpecies || "");
    const targetKgPerHour =
      targetKey && TARGET_KG_BY_SPECIES?.[targetKey] != null ? Number(TARGET_KG_BY_SPECIES[targetKey]) : null;

    const hours = Number.isFinite(sessionDurMin) && sessionDurMin > 0 ? sessionDurMin / 60 : 0;
    const effortHours = Number.isFinite(hours) ? hours : 0;
    const realizedKgPerHour = hours > 0 ? safeWeight / hours : 0;
    
    const sessionFactor =
      targetKgPerHour && targetKgPerHour > 0 && realizedKgPerHour > 0 ? realizedKgPerHour / targetKgPerHour : null;

    const sessionClass = sessionFactor != null ? classifySessionFactor(sessionFactor) : null;
    const speciesDisplay = laji ? t(`fish.${normalizeSpecies(laji)}`, laji) : "";
    const ratingDisplay = arvio ? t(["rating", arvio].join("."), arvio) : "";
    const methodKey = normalizeFishingMethodKey(pyyntitapa);

const methodKeyLocal = normalizeFishingMethodKey(pyyntitapa);

const methodLabel = methodKeyLocal
  ? t(`fishingMethod.${methodKeyLocal}`, { defaultValue: methodKeyLocal })
  : "-";

const fallbackActive =
  lang?.startsWith("fi")
    ? "OH-toteuma (aktiivipyynti): {{realized}}{{match}}"
    : "Realized OH (active): {{realized}}{{match}}";

const fallbackMissing =
  lang?.startsWith("fi")
    ? "OH-toteuma: -"
    : "Realized OH: -";

// ✅ realizedLine ENNEN previewTextiä
const realizedLine =
  methodKeyLocal === "active" && realized != null
    ? `🎣 ${t("oh.realizedActiveLine", {
        realized: realizedDisplay,
        match: matchDisplay || "",
        defaultValue: fallbackActive,
      })}`
    : `🎣 ${t("oh.realizedMissing", { defaultValue: fallbackMissing })}`;

const previewText = [
  `📅 ${currentDay} – ${speciesDisplay || ""} ${pituus ? `${pituus}, ` : ""}${safeCount} kpl (${safeCr} C&R), ${safeWeight || "-"} kg`,
  `📍 ${placeText}`,
  `📈 ${t("pressure", { defaultValue: "Ilmanpaine" })}: ${pressureDisplay}`,
  `🎣 ${t("fishingInterest", { defaultValue: "Ottihalukkuus" })}: ${ohDisplay}`,

  realizedLine,

  `🌙 ${t("moonPhase", { defaultValue: "Kuun vaihe" })}: ${moonDisplay}`,
  `💨 ${t("windDirection", { defaultValue: "Tuulen suunta" })}: ${windHuman}`,
  `⏱️ ${t("oh.sessionDuration", { defaultValue: "Kalastusaika (sessio)" })}: ${sessionTimeText}`,
  `⏱️ ${t("fishingTime", { defaultValue: "Pyyntiaika" })}: ${fishingTimeText}`,
  `🕸️ ${t("gearUnits", { defaultValue: "Gear units" })}: ${pyydys || "-"} | ⚙️ ${t("fishingMethod.label", { defaultValue: "Fishing method" })}: ${methodLabel}`,
]
  .filter(Boolean)
  .join("\n");

	const speciesRaw = String(laji || "").trim();     // mitä UI:ssa valittiin (usein FI)
	const speciesKey = normalizeSpecies(speciesRaw);  // ✅ oikea, pysyvä key (pike/salmon/...)
	const speciesFi = toFiCanonical(speciesRaw);      // (valinnainen) FI-kanoninen nimi "Hauki"


    return {
      kind: "catch",
      isSession: false,
      date: day,
      time: hhmm,
      source: "lake",
      origin: "lake",

      aika: nowISO,
      paikka: placeText,

      laji,
      pituus,
      maara: safeCount,
      cr: safeCr,
      paino: safeWeight,
      arvio,

      pressure: presNow != null ? Number(presNow.toFixed(1)) : null,
      windDeg: windDegNow,
      windText: windDegNow != null ? `${degToCompass(windDegNow, lang)} (${windDegNow}°)` : "-",
      windSpeed: Number.isFinite(windSpeed) ? Number(windSpeed) : null,

      moonPhaseKey: moonPhaseKey || null,
      moonEmoji: moonEmoji || "🌙",
      moonPhaseLabel: moonLabel,

      speciesRaw,
      speciesKey,
      species: speciesKey,
      speciesFi,
      
      forecastOH: ohv,
	ohForecast: ohv,
	oh: ohv,
	fishingInterest: ohv,

      gearUnits: Number(pyydys) || 0,
      pyydys: pyydys || "",

      fishingDurationMin: sessionDurMin,
      fishingHours: fishingHours || 0,
      effortHours: effortHours,
      pyyntiaika: fishingTimeText,

      pyyntitapa: normalizeFishingMethodKey(pyyntitapa) || "active",

      lang,

      realizedOH: realized,
      ohMatchFactor: match,

      // kohdekala sessiosta (tavoite)
      targetSpecies: lockedSpecies || null,

      targetKgPerHour,
      realizedKgPerHour: Number.isFinite(realizedKgPerHour) ? realizedKgPerHour : null,
      sessionFactor,
      sessionClass,

      previewText,
      
      ratingDisplay,
      pressureDisplay,
      windHuman,
      ohDisplay,
      amount: safeCount,
      weightKg: safeWeight,
      crCount: safeCr,
      lengthClass: pituus || null,
    };
  };

  const draft = useMemo(() => {
    try {
      return buildCatch();
    } catch (e) {
      console.warn("Preview buildCatch failed:", e);
      return { previewText: "", pyyntitapa: "", realizedOH: null, ohMatchFactor: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    laji,
    pituus,
    maara,
    cr,
    paino,
    arvio,
    pyydys,
    pyyntitapa,
    presNum,
    windDeg,
    windSpeed,
    moonPhaseKey,
    moonEmoji,
    locationName,
    locationCoords,
    forecastOH,
    sessionDurMin,
    sessionTimeText,
    fishingTimeText,
    moonLabel,
    placeText,
  ]);

  const showPreview = Boolean(draft.previewText && draft.previewText.trim().length > 0);

  const clearForm = () => {
    setLaji("");
    setPituus("");
    setMaara("");
    setCr("");
    setPaino("");
    setArvio("");
    setPyydys("1");
    setPyyntitapa("active");
  };
  
   const onChangeLaji = (e) => {
    if (effectiveLock) return;
    setLaji(e.target.value);
  };

  // “Ei tavoitesaalista” (sessiorivi)
const handleNoTarget = () => {
  const nowISO = new Date().toISOString();
  const day = nowISO.slice(0, 10);

  try {
    onTargetNone?.();
  } catch {}

  const p = presNum != null ? Number(presNum.toFixed(1)) : null;
  const wd = windDeg != null ? Number(windDeg) : null;
  const wt = wd != null ? `${degToCompass(wd, lang)} (${wd}°)` : null;

  const ohv =
    Number.isFinite(Number(forecastOH))
      ? Math.max(1, Math.min(8, Math.round(Number(forecastOH))))
      : null;

  const row = {
    kind: "session",
    isSession: true,
    isTargetNone: true,
    targetOutcome: "none",
    source: "lake",
    origin: "lake",

    date: day,
    time: nowISO.slice(11, 16).replace(":", "."),
    aika: nowISO,

    locationName,
    paikka: placeText,
    targetSpecies: lockedSpecies || null,
    effortHours: Number.isFinite(fishingHours) ? fishingHours : null,

    // ympäristö / OH
    pressure: p,
    windDeg: wd,
    windDirText: wt,

    forecastOH: ohv,
    ohForecast: ohv,
    oh: ohv,
    fishingInterest: ohv,

    // koonti muille näkymille (turvalliset arvot)
    summaryData: {
      pressure: p,
      windDirectionText: wt,
      forecastOH: ohv,
      oh: ohv != null ? `${ohv}/8` : null,
    },

    // jos jossain luetaan tätä:
    weatherSnapshot: {
      pressure: p,
      windDeg: wd,
      windDirectionText: wt,
      forecastOH: ohv,
    },
  };

  const all = readArr(SAALIS_KEY);
  all.push(row);
  writeArr(SAALIS_KEY, all);
  emitCatchesUpdated();

  setLockReleased(true);
  clearForm();
  showHint("targetNone");
};

  const handleSubmit = (e) => {
  e.preventDefault();

  if (!laji) {
    setToastMsg(
      t("validation.selectSpecies", {
        defaultValue: "Valitse kalalaji.",
      })
    );
    setToastOpen(true);
    return;
  }

  if (!safeWeight || safeWeight <= 0) {
    setToastMsg(
      t("validation.enterWeight", {
        defaultValue: "Anna paino (kg).",
      })
    );
    setToastOpen(true);
    return;
  }

  if (saving) return;
  setSaving(true);

  try {
    const uusi = buildCatch();

    // 1) TALLENNA AINA ENSIN SAALIS
    const all = readArr(SAALIS_KEY);
    all.push(uusi);
    writeArr(SAALIS_KEY, all);
    emitCatchesUpdated();

    // 2) Statsit EI saa kaataa tallennusta
    try {
      recomputeAndStoreCatchStats("jarvisaaliit", "jarvisaaliit_stats");
    } catch (statsErr) {
      console.warn("Stats recompute failed (ignored):", statsErr);
    }

	    onAfterSave?.(); // jos haluat pitää callbackin (voit tyhjentää WeatherTabsissä toastin)

	const savedIsTarget =
	  hasTarget && normalizeSpecies(laji) === normalizeSpecies(lockedSpecies);

	if (savedIsTarget) {
	  setLockReleased(true);
	  showHint("targetSaved");
	  setToastMsg(
	    t("session.targetSavedContinue", {
	      defaultValue: "Target catch saved — you can save other catches.",
	    })
	  );
	} else {
	  setSavedHintKey("");
	  setShowSavedHint(false);
	  setToastMsg(
	    t("toast.catchSaved", { defaultValue: "Catch saved!" })
	  );
	}
	setToastOpen(true);


	    clearForm();
	  } catch (err) {
	    console.error("Save error:", err);

    // Näytä myös virheen syy dev-mielessä
	    const msg = err?.message ? ` (${err.message})` : "";
	    setToastMsg(t("toast.saveError", { defaultValue: "Tallennus epäonnistui." }) + msg);
	    setToastOpen(true);

    // HUOM: älä tyhjennä lomaketta epäonnistuessa
	  } finally {
	    setSaving(false);
	  }
	};

	const hideSavedHintNow = () => {
	  setShowSavedHint(false);
	};


  return (
    <>
      <form onSubmit={handleSubmit} key={lang} noValidate style={{ padding: "1rem" }}>
        <h3>🎣 {t("lakeCatchTitle") || "Järvi- ja merisaalisraportti"}</h3>

        {lockedSpeciesRaw ? (
	  <div style={{ marginBottom: 8, opacity: 0.9 }}>
	    🎯 {t("session.targetFish", { defaultValue: "Kohdekala" })}:{" "}
	    <strong>{t(`fish.${lockedSpeciesKey}`, { defaultValue: lockedSpeciesRaw })}</strong>
	  </div>
	) : null}

        {showSavedHint ? (
	  <div style={{ marginBottom: 8, color: "#0a6", fontWeight: 700 }}>
	    ✅{" "}
	    {savedHintKey === "targetNone"
	      ? t("session.targetNoneSaved", {
	          defaultValue: "No target catch logged — you can save other catches.",
	        })
	      : t("session.targetSavedContinue", {
	          defaultValue: "Target catch saved — you can save other catches.",
	        })}
	  </div>
	) : null}


        {/* Laji */}
        <label>
          {t("species") || "Laji"}:{" "}
          <select
	  value={laji}
	  onChange={onChangeLaji}
	  disabled={effectiveLock}
	>
	  <option value="">{t("select", { defaultValue: "Valitse" })}</option>
	  {speciesOptions.map((sp) => (
	    <option key={sp} value={sp}>
	      {translateSpecies(sp, t)}
	    </option>
	  ))}
	</select>

        </label>

        {hasTarget ? (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={handleNoTarget}
              style={{
                padding: "0.45rem 0.65rem",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              🚫 {t("session.noTargetCatch", { defaultValue: "Ei tavoitesaalista" })}
            </button>
          </div>
        ) : null}

        <br />

        {/* Pituusluokka */}
        <label>
          {t("lengthClass") || "Pituusluokka"}:{" "}
          <select
            value={pituus}
            onChange={(e) => setPituus(e.target.value)}
          >
            <option value="">{t("select") || "Valitse"}</option>
            {(pituudet[laji] || []).map((mitta) => (
              <option key={mitta} value={mitta}>
                {mitta}
              </option>
            ))}
          </select>
        </label>

        <br />

        {/* Määrä + C&R, jos ei pelkkä painolaji */}
        {!isOnlyWeightFish ? (
          <>
            <label>
              {t("count") || "Kappaleet"}:{" "}
              <input type="number" min="0" value={maara} onChange={(e) => setMaara(e.target.value)} />
            </label>
            <br />
            <label>
              {t("crAmount") || "C&R määrä"}:{" "}
              <input type="number" min="0" value={cr} onChange={(e) => setCr(e.target.value)} />
            </label>
            <br />
          </>
        ) : null}

        {/* Paino */}
        <label>
          {t("weight") || "Paino (kg)"}:{" "}
          <input type="number" step="0.01" min="0" required value={paino} onChange={(e) => setPaino(e.target.value)} />
        </label>
        <br />

        {/* Arviointi */}
        <label>
          {t("rating.label") || "Arviointi"}:{" "}
          <select value={arvio} onChange={(e) => setArvio(e.target.value)}>
            <option value="">{t("select") || "Valitse"}</option>
            <option value="Heikko">{t("rating.Heikko") || "Heikko"}</option>
            <option value="Kohtalainen">{t("rating.Kohtalainen") || "Kohtalainen"}</option>
            <option value="Hyvä">{t("rating.Hyvä") || "Hyvä"}</option>
            <option value="Kiitettävä">{t("rating.Kiitettävä") || "Kiitettävä"}</option>
            <option value="Erinomainen">{t("rating.Erinomainen") || "Erinomainen"}</option>
          </select>
        </label>
        <br />

        {/* Pyydysyksiköt */}
	<label>
	  {t("gearUnits", { defaultValue: "Pyydysyksiköt" })}:{" "}
	  <select value={pyydys} onChange={(e) => setPyydys(e.target.value)}>
	    {[...Array(25)].map((_, i) => (
	      <option key={i + 1} value={String(i + 1)}>
	        {i + 1}
	      </option>
	    ))}
	  </select>
	</label>
	<br />

	{/* Pyyntitapa */}
	<label>
	  {t("fishingMethod.label", { defaultValue: "Pyyntitapa" })}:{" "}
	  <select value={pyyntitapa} onChange={(e) => setPyyntitapa(e.target.value)}>
		    <option value="active">
	      {t("fishingMethod.active", { defaultValue: "Aktiivinen" })}
		    </option>
		    <option value="passive">
	      {t("fishingMethod.passive", { defaultValue: "Passiivinen" })}
	    </option>
	  </select>
	</label>

        {/* Toteutunut OH - rivi */}
	{draft.pyyntitapa === "active" &&
	Number.isFinite(draft.realizedOH) &&
	draft.realizedOH > 0 ? (
	  <p style={{ marginTop: "0.5em", fontWeight: "bold" }}>
	    {t("oh.realizedActiveBase", {
	      realized: draft.realizedOH,
	      defaultValue: "🎣 OH-toteuma (aktiivipyynti): {{realized}}/8",
	    })}

	    {Number.isFinite(draft.ohMatchFactor) && draft.ohMatchFactor > 0 ? (
	      <>
	        {" "}
	        {t("oh.realizedActiveFactor", {
	          factor: draft.ohMatchFactor.toFixed(2),
	          defaultValue: "- ennusteeseen verrattuna {{factor}}x",
	        })}
	      </>
	    ) : null}
	  </p>
	) : null}

        <h4>{t("previewCSV") || "Esikatsele CSV-rivi"}</h4>

        {showPreview ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f5f5f5",
              padding: "0.5em",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "0.9rem",
              lineHeight: 1.4,
            }}
          >
            {draft.previewText}
          </pre>
        ) : (
          <p style={{ opacity: 0.7 }}>
            {t("previewHint", { defaultValue: "Täytä saalistiedot, niin esikatselu päivittyy." })}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            fontSize: "1rem",
            borderRadius: "6px",
            border: "1px solid #444",
            background: saving ? "#ddd" : "#fafafa",
            cursor: saving ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span role="img" aria-label="save">
            💾
          </span>
          {saving ? "…" : t("save") || "Tallenna saalis"}
        </button>
      </form>

      <Toast open={toastOpen} onClose={() => setToastOpen(false)} message={toastMsg} />
    </>
  ); 
}