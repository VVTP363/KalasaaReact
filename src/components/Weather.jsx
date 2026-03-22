// src/components/Weather.jsx
import "../i18n";
import React, { useLayoutEffect, useState, useEffect, useMemo, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AppContext } from "./AppContext";
import { EMOJI_BY_KEY, normalizeMoonKey } from "../utils/moon";
import {
  collectFuturePressures,
  collectPastPressures,
} from "../utils/ohUnified";
import { buildHourlyWindow } from "../utils/hourWindow";
import { fetchForecastData } from "./fetchForecast";
import LakeSeaPressureStatsCard from "./LakeSeaPressureStatsCard";
import { useFishingSession } from "../hooks/useFishingSession";
import StartFishingButton from "./StartFishingButton";
import SessionMenu from "./SessionMenu";
import { useEntitlement } from "./EntitlementContext";

// Valitse mille tunnille "päiväennusteen" OH lasketaan
// dayObj = fcData[selDate]
function pickTargetHour(dayObj, isToday) {
  if (!dayObj || typeof dayObj !== "object") return null;

  const availableHours = Object.keys(dayObj)
    .map(Number)
    .filter((h) => !Number.isNaN(h))
    .sort((a, b) => a - b);

  if (!availableHours.length) return null;

  // Jos tänään → lähin tunti nykyhetkeen
  if (isToday) {
    const nowHour = new Date().getHours();
    let best = availableHours[0];
    let bestDiff = Math.abs(best - nowHour);
    for (const h of availableHours) {
      const diff = Math.abs(h - nowHour);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = h;
      }
    }
    return best;
  }

  // Muut päivät: mieluiten klo 12, muuten klo 18, muuten ensimmäinen saatavilla
  if (availableHours.includes(12)) return 12;
  if (availableHours.includes(18)) return 18;
  return availableHours[0];
}

const getCompassDirection = (deg, lang = "fi") => {
  const fi = [
    "Pohjoinen",
    "Koillinen",
    "Itä",
    "Kaakko",
    "Etelä",
    "Lounas",
    "Länsi",
    "Luode",
  ];
  const en = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const arr = lang === "fi" ? fi : en;
  const idx = Math.round((deg ?? 0) / 45) % 8;
  return arr[(idx + 8) % 8];
};

// Päiväavain "YYYY-MM-DD" tai "DD.MM.YYYY" -> Date
function parseDateKeyToDate(key) {
  if (!key) return new Date();
  const s = String(key);

  // DD.MM.YYYY
  if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length !== 3) return new Date();
    const dd = Number(parts[0]);
    const mm = Number(parts[1]) - 1;
    const yyyy = Number(parts[2]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) {
      return new Date();
    }
    return new Date(yyyy, mm, dd, 12, 0, 0);
  }

  // YYYY-MM-DD
  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length !== 3) return new Date();
    const yyyy = Number(parts[0]);
    const mm = Number(parts[1]) - 1;
    const dd = Number(parts[2]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) {
      return new Date();
    }
    return new Date(yyyy, mm, dd, 12, 0, 0);
  }

  return new Date();
}

// Päiväavain "YYYY-MM-DD" -> "DD.MM.YYYY"
function formatDMY(key) {
  if (!key) return "";
  const s = String(key);
  if (s.includes(".")) return s; // jo valmiiksi dd.mm.yyyy
  const [yyyy, mm, dd] = s.split("-");
  if (!yyyy || !mm || !dd) return s;
  return `${dd}.${mm}.${yyyy}`;
}

// Sade-/pilvi-ikonit
function formatPrecip(d, t) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  function skyFromWmoOrClouds(src) {
    const wmo = num(src?.WeatherCode) ?? num(src?.weathercode);
    if (wmo !== undefined) {
      if (wmo === 0) return "☀️";
      if (wmo === 1 || wmo === 2) return "🌤️";
      if (wmo === 3) return "☁️";
      if (wmo === 45 || wmo === 48) return "🌫️";
    }
    const cloudKeys = [
      "CloudCover",
      "cloudcover",
      "clouds",
      "cloud",
      "cloudiness",
      "cloud_cover",
      "total_cloud_cover",
      "clouds_all",
      "cloudsTotal",
    ];
    for (const k of cloudKeys) {
      const v = num(src?.[k]) ?? num(src?.[k]?.value);
      if (v !== undefined) {
        if (v <= 15) return "☀️";
        if (v <= 60) return "🌤️";
        return "☁️";
      }
    }
    const raw = JSON.stringify(src ?? {}).toLowerCase();
    if (/clear|aurinko|selke|fair/.test(raw)) return "☀️";
    if (/few|scattered|partly|puolipilv|broken/.test(raw)) return "🌤️";
    if (/cloud|pilvi|overcast/.test(raw)) return "☁️";
    return "☁️";
  }

  if (!d || typeof d !== "object") return { emoji: "☁️", text: "" };

  const temp = num(d.Temperature ?? d.Temp);
  const rainMm = num(d.RainMm);
  const snowCm = num(d.SnowMm);
  let totalMm = num(d.PrecipMm);
  const prob = num(d.PrecipProb) ?? num(d.precipitation_probability);
  const wmo = num(d.WeatherCode) ?? num(d.weathercode);

  if (totalMm === undefined) {
    const sum = (rainMm ?? 0) + (snowCm ?? 0) / 10;
    totalMm = Number.isFinite(sum) ? sum : undefined;
  }

  const dryWmo =
    wmo === 0 || wmo === 1 || wmo === 2 || wmo === 3 || wmo === 45 || wmo === 48;
  const tinyPrecip = (totalMm ?? 0) > 0 ? totalMm < 0.1 : false;
  const lowProb = (prob ?? 100) < 20;
  const rainZero = (rainMm ?? 0) <= 0;
  const snowZero = (snowCm ?? 0) <= 0;
  const shouldForceDry = dryWmo && rainZero && snowZero && (tinyPrecip || lowProb);

  const isSnowCode =
    wmo !== undefined &&
    ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86 || wmo === 66 || wmo === 67);
  const isFreezing = (temp ?? 999) <= 0;
  const isSnow = (totalMm ?? 0) > 0 && (isFreezing || isSnowCode || (snowCm ?? 0) > 0);

  if (totalMm !== undefined) {
    if (totalMm <= 0 || shouldForceDry) {
      return { emoji: skyFromWmoOrClouds(d), text: "" };
    }
    if (isSnow) {
      const snowDepthCm = snowCm ?? totalMm * 10;
      return { emoji: "🌨️", text: `${snowDepthCm.toFixed(1)} cm/h ❄️` };
    }
    return { emoji: "🌧️", text: `${totalMm.toFixed(1)} mm/h 💧` };
  }

  if (prob !== undefined) {
    if (lowProb && dryWmo) return { emoji: skyFromWmoOrClouds(d), text: "" };
    return {
      emoji: "☔",
      text: `${Math.round(Math.max(0, Math.min(100, prob)))}%`,
    };
  }

  return { emoji: skyFromWmoOrClouds(d), text: "" };
}

const getWindDirectionText = (deg, t) => {
  if (!Number.isFinite(deg)) return "-";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % 8;
  const compassKey = directions[index];
  return `${t(`windDirections.${compassKey}`)} (${deg.toFixed(0)}°)`;
};

const FishIcons = ({ count }) => (
  <>
    {Array.from({ length: Math.max(0, count || 0) }, (_, i) => (
      <img
        key={i}
        src="/icons/bluefish.png"
        style={{ width: 24, height: 24, marginRight: 4 }}
        alt=""
      />
    ))}
  </>
);

// Rajaa OH aina välille 1–8 ja pyöristää lähimpään kokonaislukuun
function clampOh(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(8, Math.round(n)));
}

// kuunvaihe ajanhetkestä (fallback, jos context ei anna)
  function getMoonPhaseKeyFromDate(date = new Date()) {
  const lp = 2551443; // sekuntia
  const new_moon = new Date(Date.UTC(1970, 0, 7, 20, 35, 0));
  const phaseTime = (date.getTime() - new_moon.getTime()) / 1000;
  const phase = (phaseTime % lp) / lp;

  if (phase === 0 || phase === 1) return "newMoon";
  if (phase < 0.25) return "waxingCrescent";
  if (phase === 0.25) return "firstQuarter";
  if (phase < 0.5) return "waxingGibbous";
  if (phase === 0.5) return "fullMoon";
  if (phase < 0.75) return "waningGibbous";
  if (phase === 0.75) return "lastQuarter";
  return "waningCrescent";
}

// Kuuvaiheen tekstitys: toimii sekä stringille että objektimuodolle
  const getMoonPhaseText = (moonPhaseKey, t) => {
  if (!moonPhaseKey) return "-";

  let kebab = "";

  if (typeof moonPhaseKey === "object") {
    kebab = moonPhaseKey.kebab || moonPhaseKey.camel || "";
  } else if (typeof moonPhaseKey === "string") {
    kebab = moonPhaseKey
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase();
  }

  if (!kebab) return "-";
  return t(`moonPhaseNames.${kebab}`, kebab);
};

export default function Weather() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const nav = useNavigate();
  const omakalaAnchorRef = useRef(null);
  const omakalaTipRef = useRef(null);
  const [omakalaTipStyle, setOmakalaTipStyle] = useState({});
 const {
  locationCoords,
  setLocationCoords,
  setLocationName,
  windDirection,
  windSpeed,
  pressure,
  locationName,
  riverOH,
  moonPhaseKey,
  moonEmoji,
  updatePressure,
  updateWind,
  updateLakeSeaOH,
  computeOH,
} = useContext(AppContext);

useEffect(() => {
  if (
    !locationCoords ||
    !Number.isFinite(locationCoords.lat) ||
    !Number.isFinite(locationCoords.lon)
  ) {
    return;
  }

  const { lat, lon } = locationCoords;

  // Hae paikannimi, jos sitä ei ole
  if (!locationName) {
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    )
      .then((res) => res.json())
      .then((data) => {
        const shortName =
          data.address?.village ||
          data.address?.town ||
          data.address?.municipality ||
          data.address?.city ||
          data.address?.county ||
          data.display_name?.split(",")[0] ||
          "Tuntematon sijainti";

        setLocationName(shortName);
        console.log("[Weather] Reverse geocode OK:", shortName);
      })
      .catch((e) =>
        console.warn("[Weather] Reverse geocode epäonnistui:", e)
      );
  }
}, [locationCoords, locationName, setLocationName]);

  const { isPro } = useEntitlement();
  const [showProInfo, setShowProInfo] = useState(false);

  const [showHourly, setShowHourly] = useState(false);
  const [search, setSearch] = useState("");
  const [locName, setLocName] = useState(locationName || "GPS");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [fcData, setFcData] = useState({});
  const [idx, setIdx] = useState(0);
  const [selectedHour, setSelectedHour] = useState(null);
  const [showOmakalaTip, setShowOmakalaTip] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false); 
  const omakalaWrapRef = useRef(null);
  const closeTimerRef = useRef(null);
  const dayKeys =
    fcData && typeof fcData === "object" ? Object.keys(fcData) : [];
  const selDate = dayKeys[idx] || null;
  const dayObj = selDate && fcData?.[selDate] ? fcData[selDate] : null;

  const clearCloseTimer = () => {
  if (closeTimerRef.current) {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }
};

  const delayedClose = (ms = 140) => {
  clearCloseTimer();
  closeTimerRef.current = setTimeout(() => {
    setShowOmakalaTip(false);
  }, ms);
};

useEffect(() => {
  const mq = window.matchMedia?.("(pointer: coarse)");
  const update = () => setIsCoarsePointer(!!mq?.matches);

  update();
  mq?.addEventListener?.("change", update);
  mq?.addListener?.(update); // Safari fallback

  const onOutside = (e) => {
    if (!showOmakalaTip) return;
    const el = omakalaWrapRef.current;
    if (el && !el.contains(e.target)) setShowOmakalaTip(false);
  };

  document.addEventListener("mousedown", onOutside);
  document.addEventListener("touchstart", onOutside, { passive: true });

  return () => {
    mq?.removeEventListener?.("change", update);
    mq?.removeListener?.(update);
    document.removeEventListener("mousedown", onOutside);
    document.removeEventListener("touchstart", onOutside);
  };
}, [showOmakalaTip]);

const selectedDateObj = useMemo(() => parseDateKeyToDate(selDate), [selDate]);

  const today = new Date();
  const isToday =
    !!selDate &&
    selectedDateObj.getFullYear() === today.getFullYear() &&
    selectedDateObj.getMonth() === today.getMonth() &&
    selectedDateObj.getDate() === today.getDate();

  const startWindow = useMemo(
  () => new Date(Date.now() - 3 * 60 * 60 * 1000),
  []
   );
  const endWindow = useMemo(
  () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  []
 );

const hourlyWindow = useMemo(
  () => (forecast ? buildHourlyWindow(forecast, startWindow, endWindow) : []),
  [forecast, startWindow, endWindow]
);


  // Ennusteen haku
  useEffect(() => {
    if (!locationCoords) return;
    const controller = new AbortController();

    fetchForecastData(locationCoords, undefined, { signal: controller.signal })
      .then((data) => setForecast(data))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
  }, [locationCoords]);

  // forecast → fcData
  useEffect(() => {
    if (!forecast || typeof forecast !== "object") return;
    setFcData(forecast);
    const keys = Object.keys(forecast);
    if (keys.length && idx >= keys.length) setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast]);

  // paikkahaku ja "HAE"
  const resolveAndSet = async (la, lo) => {
    setLocationCoords({ lat: la, lon: lo });
    const fallback = `GPS (${la.toFixed(3)}, ${lo.toFixed(3)})`;
    setLocName(fallback);
    if (typeof setLocationName === "function") setLocationName(fallback);
    try {
      const { data } = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${lo}`
      );
      const a = data?.address || {};
      const nice =
        a.village ||
        a.town ||
        a.municipality ||
        a.city ||
        a.county ||
        a.state ||
        (data?.display_name ? data.display_name.split(",")[0] : fallback);
      setLocName(nice);
      if (typeof setLocationName === "function") setLocationName(nice);
    } catch {
      setLocName(`GPS (${la.toFixed(2)},${lo.toFixed(2)})`);
    }
  };

  const handleSearch = async () => {
    const q = (search || "").trim();
    if (!q) return;
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}`
    );
    if (Array.isArray(data) && data[0]) {
      const la = +data[0].lat;
      const lo = +data[0].lon;
      await resolveAndSet(la, lo);
    } else {
      setLocName(t("notFound"));
    }
  };

  // OMA PAIKKA -nappi: käytä viimeksi haettua paikkaa AppContextista
 const handleOwnPlace = () => {
  if (!navigator.geolocation) {
    alert("Geopaikannus ei ole käytettävissä tässä laitteessa.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const la = Number(pos.coords.latitude);
      const lo = Number(pos.coords.longitude);

      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        alert("GPS-koordinaatteja ei saatu.");
        return;
      }

      setGpsCoords({ lat: la, lon: lo });       // ✅ muistiin oma paikka
      await resolveAndSet(la, lo);              // ✅ siirry omaan paikkaan
      setIdx(0);
      setSelectedHour(null);
    },
    (err) => {
      console.warn("[GPS] failed:", err);
      alert("Sijaintia ei saatu. Tarkista puhelimen sijaintiasetukset ja salli sijainti.");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60_000,
    }
  );
};


  // header: päivittää contextin paineen/tuulen valitulle päivälle sopivasta tunnista
  useEffect(() => {
    if (!selDate) return;
    const day = fcData?.[selDate];
    if (!day) return;

    const targetHour = pickTargetHour(day, isToday);
    if (targetHour == null) return;

    const slot = day[String(targetHour)];
    if (!slot) return;

    const p = Number(slot.Pres ?? slot.Pressure);
    const d = Number(slot.Wind ?? slot.WindDirection);
    const s = Number(slot.WindSpeed);

    const dp =
      Number.isFinite(p) && Number.isFinite(pressure)
        ? Math.abs(p - pressure)
        : Infinity;
    const ddif =
      Number.isFinite(d) && Number.isFinite(windDirection)
        ? Math.abs(((d - windDirection + 540) % 360) - 180)
        : Infinity;
    const ds =
      Number.isFinite(s) && Number.isFinite(windSpeed)
        ? Math.abs(s - windSpeed)
        : Infinity;

    if (Number.isFinite(p) && dp > 0.05) {
      updatePressure(
        p,
        selectedHour != null
          ? "Weather:selectedHour"
          : "Weather:selDate-targetHour"
      );
    }
    if (Number.isFinite(d) && (ddif > 1 || (Number.isFinite(s) && ds > 0.1))) {
      updateWind(
        d,
        Number.isFinite(s) ? s : null,
        selectedHour != null
          ? "Weather:selectedHour"
          : "Weather:selDate-targetHour"
      );
    }
  }, [
    selDate,
    fcData,
    isToday,
    selectedHour,
    pressure,
    windDirection,
    windSpeed,
    updatePressure,
    updateWind,
  ]);

  // Päivän yhteenvetorivit: nykyhetken lähin, 12, 18
  const summaryHours = useMemo(() => {
    if (!dayObj) return [];
    const hours = Object.keys(dayObj)
      .map(Number)
      .filter((h) => !Number.isNaN(h));
    if (!hours.length) return [];

    const set = new Set();

    if (isToday) {
      const nowHour = new Date().getHours();
      let best = hours[0];
      let bestDiff = Math.abs(hours[0] - nowHour);
      for (const h of hours) {
        const diff = Math.abs(h - nowHour);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = h;
        }
      }
      set.add(best);
    }

    if (hours.includes(12)) set.add(12);
    if (hours.includes(18)) set.add(18);

    return Array.from(set).sort((a, b) => a - b);
  }, [dayObj, isToday]);

  // 🌙 Kuun vaihe – käytetään ensisijaisesti contextin arvoa, muuten laskettu päivästä
  const moonKey = getMoonPhaseKeyFromDate(selectedDateObj);

  const { camel: moonCamelLocal } = normalizeMoonKey(moonKey);

  const effectiveMoonKey =
    typeof moonPhaseKey === "object"
      ? moonPhaseKey.camel || moonPhaseKey.kebab || moonCamelLocal
      : moonPhaseKey || moonCamelLocal;

  const moonLabel = getMoonPhaseText(moonPhaseKey || moonKey, t);

  let moonEmojiSafe = moonEmoji || "🌙";
  try {
    const baseKey =
      typeof moonPhaseKey === "object"
        ? moonPhaseKey.camel || moonPhaseKey.kebab || ""
        : moonPhaseKey || moonKey;

    const norm = normalizeMoonKey(baseKey);
    moonEmojiSafe = moonEmoji || EMOJI_BY_KEY[norm.camel] || "🌙";
  } catch {
    // pidetään oletus-emoji
  }
   // --- HARMONISOITU lake/sea OH: sama logiikka kuin Virtavesissä ---
  const headerLakeSeaOH = useMemo(() => {
    if (!selDate || !dayObj || typeof computeOH !== "function") return null;

    const targetHour = pickTargetHour(dayObj, isToday);
    if (targetHour == null) return null;

    const slot = dayObj[String(targetHour)];
    if (!slot) return null;

    const pastPressures = collectPastPressures(fcData, selDate, targetHour, 6);
    const futurePressures = collectFuturePressures(
      fcData,
      selDate,
      targetHour,
      6
    );

    const rawOh =
      Number.isFinite(slot?.Pressure) && Number.isFinite(slot?.WindDirection)
        ? computeOH({
            pressure: Number(slot.Pressure),
            windDirection: Number(slot.WindDirection),
            moonPhaseKey: effectiveMoonKey,
            pastPressures,
            futurePressures,
          })
        : null;

    const clipped = clampOh(rawOh);
    return Number.isFinite(clipped) ? clipped : null;
  }, [selDate, dayObj, fcData, isToday, computeOH, effectiveMoonKey]);

  // Pusketaan headerin lake/sea OH myös AppContextiin,
  // jotta LakeSeaCatchForm ym. voivat käyttää samaa arvoa
  useEffect(() => {
    if (Number.isFinite(headerLakeSeaOH)) {
      updateLakeSeaOH(headerLakeSeaOH, "Weather:lakeSeaHeader");
    }
  }, [headerLakeSeaOH, updateLakeSeaOH]);


  // 💧 Ylärivin sade-/pilvi-ikoni ja teksti (käytetään samaa logiikkaa kuin tuntiriveillä)
  const headerPrecip = useMemo(() => {
    if (!dayObj) return null;

    const targetHour = pickTargetHour(dayObj, isToday);
    if (targetHour == null) return null;

    const slot = dayObj[String(targetHour)];
    if (!slot) return null;

    return formatPrecip(slot, t);
  }, [dayObj, isToday, t]);

    if (!dayKeys.length) {
    return <p style={{ padding: "1rem" }}>{t("loadingForecast", { defaultValue: "Ladataan ennustetta..." })}</p>;
  }


  return (
    <div style={{ padding: "1em" }}>
      {/* Haku + Oma paikka */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />
      <button onClick={handleSearch}>🔍 {t("search", "Hae")}</button>
      <button onClick={handleOwnPlace}>📍 {t("getLocation", "Oma paikka")}</button>

      <h2>{t("lakeSeaForecastTitle")}</h2>
      <p>
  📍 {locationName && locationName.trim()
    ? locationName
    : "GPS"}
</p>

      <p>
        📈 {t("pressure")}:{" "}
        {Number.isFinite(pressure) ? `${pressure.toFixed(1)} hPa` : "-"}
      </p>

            <p>
        💨 {t("windDirection")}:{" "}
        {Number.isFinite(windDirection)
          ? `${getCompassDirection(windDirection, lang)} (${Math.round(
              windDirection
            )}°)${
              Number.isFinite(windSpeed)
                ? ` ${windSpeed.toFixed(1)} m/s`
                : ""
            }`
          : "-"}
        {headerPrecip && (
          <>
            {" | "}
            {headerPrecip.emoji}
            {headerPrecip.text ? ` ${headerPrecip.text}` : ""}
          </>
        )}
      </p>


      <p>
        🌙 {t("moonPhase")}: {moonEmojiSafe} {moonLabel}
      </p>

      {/* Yhdistetty OH (järvi/meri, fallback riverOH:iin) */}
      <p>
        🌿 {t("fishingInterest")}:{" "}
        <FishIcons
          count={
            Number.isFinite(headerLakeSeaOH)
              ? headerLakeSeaOH
              : Number.isFinite(riverOH)
              ? riverOH
              : 0
          }
        />{" "}
        {Number.isFinite(headerLakeSeaOH)
          ? headerLakeSeaOH
          : Number.isFinite(riverOH)
          ? riverOH
          : "-"}{" "}
        / 8
      </p>

      {/* 7 päivän jakso-otsikko */}
      {dayKeys.length > 0 && (
        <h3 style={{ marginTop: "1em" }}>
          {t("sevenDayFishForecast")}: {formatDMY(dayKeys[0])} –{" "}
          {formatDMY(dayKeys[Math.min(dayKeys.length - 1, 6)])}
        </h3>
      )}

      {/* Valitun päivän data */}
      {dayObj ? (
        <>
          <h4>{formatDMY(selDate)}</h4>

          {/* Päivän yhteenveto: nykyhetken lähin + klo 12 + klo 18 */}
          {summaryHours.length > 0 && (
            <div style={{ margin: "0.5rem 0" }}>
              {summaryHours.map((hour) => {
                const d = dayObj[String(hour)];
                if (!d) return null;

                const { emoji: precipEmoji, text: precipText } = formatPrecip(
                  d,
                  t
                );

                const pastPressures = collectPastPressures(
                  fcData,
                  selDate,
                  hour,
                  6
                );
                const futurePressures = collectFuturePressures(
                  fcData,
                  selDate,
                  hour,
                  6
                );

                const rawOh =
                  Number.isFinite(d?.Pressure) &&
                  Number.isFinite(d?.WindDirection)
                    ? computeOH({
                        pressure: Number(d.Pressure),
                        windDirection: Number(d.WindDirection),
                        moonPhaseKey: effectiveMoonKey,
                        pastPressures,
                        futurePressures,
                      })
                    : null;

                const ohHour = clampOh(rawOh) ?? 1;

                return (
                  <p key={`summary-${hour}`}>
                    🕒 {hour.toString().padStart(2, "0")}:00 – 🌡{" "}
                    {Number.isFinite(d?.Temperature)
                      ? d.Temperature.toFixed(1)
                      : "-"}
                    °C | 📈{" "}
                    {Number.isFinite(d?.Pressure)
                      ? d.Pressure.toFixed(1)
                      : "-"}{" "}
                    hPa | 💨{" "}
                    {Number.isFinite(d?.WindDirection)
                      ? getWindDirectionText(d.WindDirection, t)
                      : ""}
                    {Number.isFinite(d?.WindSpeed)
                      ? ` ${d.WindSpeed.toFixed(1)} m/s`
                      : ""}
                    {" | 🎣 OH "}
                    {ohHour}/8{" "}
                    {" | "}
                    {precipEmoji}
                    {precipText ? ` ${precipText}` : ""}
                  </p>
                );
              })}
            </div>
          )}

          {/* Paine–OH-tilastokortti päivälle */}
          {/*<LakeSeaPressureStatsCard /> */}

          {/* Päivän vaihto */}
          <div style={{ margin: "0.5rem 0" }}>
            <button
              onClick={() => setIdx((prev) => Math.max(0, prev - 1))}
              style={{ marginRight: "0.5rem" }}
            >
              {t("prev", "Edellinen")}
            </button>
            <button
              onClick={() =>
                setIdx((prev) =>
                  dayKeys.length ? Math.min(dayKeys.length - 1, prev + 1) : prev
                )
              }
              style={{ marginRight: "0.5rem" }}
            >
              {t("next", "Seuraava")}
            </button>
          </div>
        </>
      ) : selDate ? (
        <p>{t("noData") || "Ei dataa tälle päivälle."}</p>
      ) : null}

      {/* Näytä / piilota tuntiennuste -nappi */}
      <button
        onClick={() => setShowHourly((prev) => !prev)}
        style={{
          backgroundColor: "#17507c",
          color: "white",
          border: "none",
          borderRadius: "5px",
          padding: "6px 12px",
          cursor: "pointer",
          margin: "0.5em 0",
        }}
      >
        {showHourly
          ? t("hideHourlyForecast", "Piilota tuntiennuste")
          : t("showHourlyForecast", "Näytä tuntiennuste")}
      </button>

      {/* Tuntiennuste */}
      {showHourly && dayObj && (
        <div className="hourly-forecast">
          {Object.entries(dayObj)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([hour, d]) => {
              const hourNum = Number(hour);

              const { emoji: precipEmoji, text: precipText } = formatPrecip(
                d,
                t
              );

              const pastPressures = collectPastPressures(
                fcData,
                selDate,
                hourNum,
                6
              );
              const futurePressures = collectFuturePressures(
                fcData,
                selDate,
                hourNum,
                6
              );

              const rawOh =
                Number.isFinite(d?.Pressure) &&
                Number.isFinite(d?.WindDirection)
                  ? computeOH({
                      pressure: Number(d.Pressure),
                      windDirection: Number(d.WindDirection),
                      moonPhaseKey: effectiveMoonKey,
                      pastPressures,
                      futurePressures,
                    })
                  : null;

              const ohHour = clampOh(rawOh) ?? 1;

              return (
                <p key={hour}>
                  🕒 {hour}:00 – 🌡{" "}
                  {Number.isFinite(d?.Temperature)
                    ? d.Temperature.toFixed(1)
                    : "-"}
                  °C | 📈{" "}
                  {Number.isFinite(d?.Pressure)
                    ? d.Pressure.toFixed(1)
                    : "-"}{" "}
                  hPa | 💨{" "}
                  {Number.isFinite(d?.WindDirection)
                    ? getWindDirectionText(d.WindDirection, t)
                    : ""}
                  {Number.isFinite(d?.WindSpeed)
                    ? ` ${d.WindSpeed.toFixed(1)} m/s`
                    : ""}
                  {" | 🎣 OH "}
                  {ohHour}/8{" "}
                  {" | "}
                  {precipEmoji}
                  {precipText ? ` ${precipText}` : ""}
                </p>
              );
            })}
        </div>
      )}

      {/* Napit loppuun */}
      <div style={{ display: "flex", gap: "0.5em", marginTop: "1em" }}>
  {/* Virtavesi-nappi (PRO-gated) */}
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <button
      type="button"
      onClick={() => {
        if (!isPro) {
          setShowProInfo(true);
          return;
        }
        setShowProInfo(false);
        nav("/virtavedet");
      }}
      title={!isPro ? t("proUnlock.proInfo") : undefined}
      style={{
        opacity: !isPro ? 0.6 : 1,
        cursor: !isPro ? "not-allowed" : "pointer",
      }}
    >
      ↪ {t("switchToVirtavesi")} {!isPro ? "🔒" : ""}
    </button>

    {showProInfo && !isPro ? (
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        {t("proUnlock.proInfo")}
      </div>
    ) : null}
  </div>

  {/* Omakala + tooltip (sun nykyinen blokkisi tähän ihan sellaisenaan) */}
  <div
    ref={omakalaWrapRef}
    style={{ position: "relative", display: "inline-flex", maxWidth: "100%" }}
    onMouseEnter={() => {
      if (!isCoarsePointer) {
        clearCloseTimer();
        setShowOmakalaTip(true);
      }
    }}
    onMouseLeave={() => {
      if (!isCoarsePointer) delayedClose();
    }}
  >


          <button
            type="button"
            onMouseEnter={() => {
              if (!isCoarsePointer) setShowOmakalaTip(true);
            }}
            onMouseLeave={() => {
              if (!isCoarsePointer && !showOmakalaTip) return;
              if (!isCoarsePointer) setShowOmakalaTip(false);
            }}
            onFocus={() => setShowOmakalaTip(true)}
            onBlur={() => {
              if (!isCoarsePointer && !showOmakalaTip) return;
              if (!isCoarsePointer) setShowOmakalaTip(false);
            }}
            onClick={() => {
              if (isCoarsePointer) {
                setShowOmakalaTip((v) => !v);
                return;
              }
              window.open("https://omakala.fi/", "_blank", "noopener,noreferrer");
            }}
            style={{
              backgroundColor: "#2a6db0",
              color: "white",
              border: "none",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
              touchAction: "manipulation",
              whiteSpace: "nowrap",
            }}
            aria-haspopup="dialog"
            aria-expanded={showOmakalaTip ? "true" : "false"}
          >
            🐟 {t("openOmakala", { defaultValue: "Avaa Omakala" })}
          </button>

          {showOmakalaTip && (
            <div
              ref={omakalaTipRef}
              role="dialog"
              aria-label={t("omakala.tooltipTitle", { defaultValue: "Omakala" })}
               onMouseEnter={() => {
	      if (!isCoarsePointer) clearCloseTimer();
	    }}
	    onMouseLeave={() => {
	      if (!isCoarsePointer) delayedClose();
	    }}
              style={{
  position: isCoarsePointer ? "fixed" : "absolute",

  ...(isCoarsePointer
    ? {
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 20,
        width: "92vw",
        maxWidth: 420,
      }
    : {
        top: "calc(100% + 8px)",
        right: 0,
        width: "min(520px, 92vw)",
      }),

  overflowWrap: "anywhere",
  padding: "10px 12px",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 12,
  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
  fontSize: "clamp(0.9rem, 2.8vw, 1rem)",
  lineHeight: 1.4,
  zIndex: 999999,
}}

            >
              <div
                style={{
                  display: "flex",
                  alignItems: "start",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  marginBottom: 6,
                }}
              >
                <strong style={{ fontSize: "1rem" }}>
                  🐟 {t("omakala.tooltipTitle", { defaultValue: "Omakala" })}
                </strong>

                <button
                  type="button"
                  onClick={() => setShowOmakalaTip(false)}
                  aria-label={t("close", { defaultValue: "Sulje" })}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "1.1rem",
                    lineHeight: 1,
                    padding: 2,
                  }}
                >
                  ×
                </button>
              </div>

              <div>
                {t("omakala.tooltip", {
                  defaultValue:
                    "Tästä avautuvasta sivustosta näet Suomen uhanalaiset, saaliiksi saadut ilmoitusta edellyttävät uhanalaiset kalalajit sekä muunkin saalisilmoituksen. Lisäksi Suomen alueen vesistöjen syvyyskartat löytyy täältä!",
                })}
              </div>

              {isCoarsePointer && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        "https://omakala.fi/",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    style={{
                      backgroundColor: "#2a6db0",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {t("open", { defaultValue: "Avaa" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOmakalaTip(false)}
                    style={{
                      backgroundColor: "#eee",
                      color: "#111",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {t("close", { defaultValue: "Sulje" })}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



