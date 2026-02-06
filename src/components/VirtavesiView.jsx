// src/components/VirtavesiView.jsx
import "../i18n";
import React, {
  useEffect,
  useState,
  useMemo,
  useContext,
} from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { AppContext } from "./AppContext";
import VirtavesiTabs from "./VirtavesiTabs";
import { useTranslation } from "react-i18next";
import { fetchForecastData } from "./fetchForecast";
import "../styles/salmon.css";
import { EMOJI_BY_KEY, normalizeMoonKey } from "../utils/moon";
import {
  collectPastPressures,
  collectFuturePressures,
} from "../utils/ohUnified";
import { useFishingSession } from "../hooks/useFishingSession";
import StartFishingButton from "./StartFishingButton";
import SessionMenu from "./SessionMenu";

const USE_TREND_IN_OH = false; // ei käytössä, mutta jätetään talteen
const HOME_KEY = "kalasaa:homeCoords";

// kebab -> camel (esim. "waxing-gibbous" -> "waxingGibbous")
const kebabToCamel = (s) =>
  typeof s === "string" && s
    ? s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    : "";

// camel -> kebab (esim. "waxingGibbous" -> "waxing-gibbous")
const camelToKebab = (s) =>
  typeof s === "string" && s
    ? s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
    : "";

// fallback-emojit, jos EMOJI_BY_KEY ei kata avainta
const EMOJI_FALLBACK = {
  newMoon: "🌑",
  waxingCrescent: "🌒",
  firstQuarter: "🌓",
  waxingGibbous: "🌔",
  fullMoon: "🌕",
  waningGibbous: "🌖",
  lastQuarter: "🌗",
  waningCrescent: "🌘",
};

const tideStationMap = {
  Kongsfjorden: "809445",
  Berlevåg: "805670",
  Hammerfest: "806010",
  "Alta River": "806020",
  "Bjøra River (Namsen)": "805620",
  "Børselva River": "805950",
  "Driva River": "872280",
  "Gaula River": "872240",
  "Kongsfjord River": "809445",
  "Komag River": "805880",
  "Lakselv River": "805960",
  "Malselv River": "805970",
  "Namsen River": "805620",
  "Nausta River": "872100",
  "Neiden River": "805920",
  "Orkla River": "872420",
  "Otra River": "872600",
  "Rana River": "872360",
  "Rauma River": "872300",
  "Reisa River": "806000",
  "Stjørdal River": "805730",
  "Tana River": "805930",
  "Upper Namsen River": "805620",
  "Vefsna River": "872380",
  "Verdal River": "805740",
  "Vosso River": "872640",
  Bottsfjorden: "849939",
  Varangerfjorden: "3831652",
  Dalsfjorden: "783438",
  Gjersdalen: "348964",
  "Helga ": "120230",
  Munkefjorden: "565096",
  Kirkkoniemi: "140217",
  "Tanafjorden (Gamvik)": "323368",
  "Lággu (Gamvik)": "141271",
  Kunes: "687128",
  Vardø: "805600",
};

const fetchTideHourFromSeHavniva = async (stationId) => {
  const url = `https://api.met.no/api/v1/tidecalc?stationid=${stationId}&from=${new Date().toISOString()}&duration=P1D`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "KalasääApp/1.0" },
    });
    const data = await response.json();
    const firstHighTide = data?.extremes?.find((e) => e.type === "high");
    if (firstHighTide) {
      return new Date(firstHighTide.time).getHours();
    }
  } catch (err) {
    console.error("🌊 SeHavniva haku epäonnistui:", err);
  }
  return null;
};

const greenDot = new L.DivIcon({
  className: "custom-green-dot",
  html:
    '<div style="width: 12px; height: 12px; background-color: green; border-radius: 50%"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const redIcon = new L.Icon({
  iconUrl: "/icons/marker-red.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "/icons/marker-shadow.png",
});

const blueIcon = new L.Icon({
  iconUrl: "/icons/marker-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "/icons/marker-shadow.png",
});

const greenIcon = new L.Icon({
  iconUrl: "/icons/marker-green.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "/icons/marker-shadow.png",
});

const fetchTideTime = async (lat, lon) => {
  try {
    const response = await fetch(
      `http://localhost:3001/tide?lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    const nextHighTide = data?.tide?.times?.find(
      (t) => t.type === "high"
    )?.time;
    if (nextHighTide) {
      const date = new Date(nextHighTide);
      return date.getHours();
    }
    throw new Error("No tide data found");
  } catch (err) {
    console.error("❌ Vuoroveden haku epäonnistui:", err);
    return null;
  }
};

const getShortPlaceName = (addressObj, displayName = "") => {
  return (
    addressObj?.village ||
    addressObj?.town ||
    addressObj?.municipality ||
    addressObj?.state ||
    displayName.split(",")[0] ||
    ""
  );
};

const getMoonPhaseKeyFromDate = (date = new Date()) => {
  const lp = 2551443; // sekuntia
  const new_moon = new Date(Date.UTC(1970, 0, 7, 20, 35, 0));
  const phaseTime = (date.getTime() - new_moon.getTime()) / 1000;
  const phase = (phaseTime % lp) / lp;
  if (phase === 0 || phase === 1) return "newMoon";
  if (phase < 0.25) return "waxing-crescent";
  if (phase === 0.25) return "first-quarter";
  if (phase < 0.5) return "waxing-gibbous";
  if (phase === 0.5) return "full-moon";
  if (phase < 0.75) return "waning-gibbous";
  if (phase === 0.75) return "last-quarter";
  return "waning-crescent";
};

const getWindDirectionText = (deg, t) => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % 8;
  const compassKey = directions[index];
  const label = t(`windDirections.${compassKey}`, compassKey);
  return `${label} (${deg.toFixed(0)}°)`;
};

const renderSalmonIcons = (oh) => {
  const icons = [];
  for (let i = 0; i < 8; i++) {
    let className = "salmon-icon";
    if (i < oh) {
      if (oh <= 2) className += " jump-low";
      else if (oh <= 5) className += " jump-medium";
      else className += " jump-high";
    } else {
      className += " idle";
    }
    const delay = (i * 0.2).toFixed(2);
    icons.push(
      <img
        key={i}
        src="/icons/leaping-salmon.png"
        alt="lohi"
        className={className}
        style={{ animationDelay: `${delay}s` }}
      />
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end" }}>{icons}</div>
  );
};

const toRad = (deg) => (deg * Math.PI) / 180;

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ClickableMap = ({ addPoint, setTideHourOffset }) => {
  const map = useMapEvents({
    click: async (e) => {
      const latlng = e.latlng;
      addPoint(latlng);
      const { lat, lng } = latlng;
      const { lat: cLat, lng: cLng } = map.getCenter();

      // Norjan alue (likimääräinen rajaus)
      const inNO =
        cLng > 4 && cLng < 32 && cLat > 57 && cLat < 72;

      if (inNO) {
        try {
          const tideHour = await fetchTideTime(lat, lng);
          if (tideHour !== null) {
            setTideHourOffset(tideHour - 6);
          } else {
            console.log("Ei vuorovesitietoa tälle sijainnille.");
          }
        } catch (err) {
          console.warn("Vuoroveden haku epäonnistui:", err);
        }
      }
    },
  });
  return null;
};

const MapFocusUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lon)) {
      map.setView([center.lat, center.lon], map.getZoom());
    }
  }, [center, map]);
  return null;
};

// Päiväavain "YYYY-MM-DD" -> "DD.MM.YYYY"
function formatDMY(key) {
  if (!key) return "";
  const s = String(key);
  if (s.includes(".")) return s;
  const [yyyy, mm, dd] = s.split("-");
  if (!yyyy || !mm || !dd) return s;
  return `${dd}.${mm}.${yyyy}`;
}

// Sade/pilvi-ikoni
function formatPrecip(d, t) {
  function skyFromWmoOrClouds(src) {
    const wmo = Number.isFinite(src?.WeatherCode)
      ? Number(src.WeatherCode)
      : Number.isFinite(src?.weathercode)
      ? Number(src.weathercode)
      : undefined;

    if (Number.isFinite(wmo)) {
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
      const v = src?.[k];
      const val = Number.isFinite(v)
        ? Number(v)
        : v &&
          typeof v === "object" &&
          Number.isFinite(Number(v.value))
        ? Number(v.value)
        : undefined;
      if (Number.isFinite(val)) {
        if (val <= 15) return "☀️";
        if (val <= 60) return "🌤️";
        return "☁️";
      }
    }

    const raw = JSON.stringify(src ?? {}).toLowerCase();
    if (/clear|aurinko|selke|fair/.test(raw)) return "☀️";
    if (/few|scattered|partly|puolipilv|broken/.test(raw))
      return "🌤️";
    if (/cloud|pilvi|overcast/.test(raw)) return "☁️";
    return "☁️";
  }

  if (!d || typeof d !== "object") {
    return { emoji: "☁️", text: "" };
  }

  const temp = Number.isFinite(d?.Temperature)
    ? Number(d.Temperature)
    : undefined;
  const rainMm = Number.isFinite(d?.RainMm)
    ? Number(d.RainMm)
    : undefined;
  const snowMm = Number.isFinite(d?.SnowMm)
    ? Number(d.SnowMm)
    : undefined;

  let totalMm = Number.isFinite(d?.PrecipMm)
    ? Number(d.PrecipMm)
    : Number(rainMm || 0) + Number(snowMm || 0);

  if (!Number.isFinite(totalMm)) {
    const tryKeysNumber = [
      "Precip",
      "Precipitation",
      "precipitation",
      "precip",
      "Rain",
      "rain",
      "rain1h",
      "rain_rate",
      "precipitation_amount",
      "precip_1h",
      "precip1h",
      "precip_mm",
      "Precip_mm",
      "Precipitation1h",
      "PrecipitationAmount",
      "Snow",
      "snow",
      "snowfall",
      "snow_1h",
      "snow_mm",
    ];
    for (const k of tryKeysNumber) {
      const v = d[k];
      if (Number.isFinite(v)) {
        totalMm = Number(v);
        break;
      }
      if (v && typeof v === "object") {
        const cand = Number(v.value ?? v.amount ?? v.mm);
        if (Number.isFinite(cand)) {
          totalMm = cand;
          break;
        }
      }
    }

    if (!Number.isFinite(totalMm)) {
      for (const [k, v] of Object.entries(d)) {
        const key = String(k).toLowerCase();
        if (/(precip|rain|snow)/.test(key)) {
          if (Number.isFinite(v)) {
            totalMm = Number(v);
            break;
          }
          if (v && typeof v === "object") {
            const cand = Number(v.value ?? v.amount ?? v.mm);
            if (Number.isFinite(cand)) {
              totalMm = cand;
              break;
            }
          }
        }
      }
    }
  }

// Valitse mille tunnille "päiväennusteen" OH lasketaan
// dayObj = forecast[selectedDate]
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

  const prob = Number.isFinite(d?.PrecipProb)
    ? Number(d.PrecipProb)
    : Number.isFinite(d?.precipitation_probability)
    ? Number(d.precipitation_probability)
    : undefined;

  const wmo = Number.isFinite(d?.WeatherCode)
    ? Number(d.WeatherCode)
    : Number.isFinite(d?.weathercode)
    ? Number(d.weathercode)
    : undefined;

  const isSnowCode =
    Number.isFinite(wmo) &&
    ((wmo >= 71 && wmo <= 77) ||
      wmo === 85 ||
      wmo === 86 ||
      wmo === 66 ||
      wmo === 67);

  const isSnowTemp =
    Number.isFinite(temp) && temp <= 0;

  const hasSnowfall =
    Number.isFinite(d?.SnowMm) &&
    Number(d.SnowMm) > 0;

  const hasTotal =
    Number.isFinite(totalMm) && totalMm > 0;

  const isSnow =
    hasTotal && (hasSnowfall || isSnowCode || isSnowTemp);

  if (Number.isFinite(totalMm)) {
    if (totalMm <= 0) {
      return { emoji: skyFromWmoOrClouds(d), text: "" };
    }
    if (isSnow) {
      return {
        emoji: "🌨️❄️",
        text: `${totalMm.toFixed(1)} mm/h`,
      };
    }
    return {
      emoji: "🌧️",
      text: `${totalMm.toFixed(1)} mm/h`,
    };
  }

  if (Number.isFinite(prob)) {
    const pct = Math.round(
      Math.max(0, Math.min(100, prob))
    );
    return { emoji: "☔", text: `${pct}%` };
  }

  return { emoji: skyFromWmoOrClouds(d), text: "" };
}

export default function VirtavesiView() {
  const {
    forecast,
    computeOH,
    riverOH,
    updateRiverOH,
    setForecast,
    updatePressure,
    updateWind,
    moonPhaseKey: ctxMoonKey,
    setMoonPhaseKey,
    locationName,
    setLocationName,
    locationCoords,
  } = useContext(AppContext);

  const { t } = useTranslation();
  const navigate = useNavigate();

  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 66.5, lon: 25.7 });
  const [searchLocation, setSearchLocation] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [forecastDates, setForecastDates] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [path, setPath] = useState([]);
  const [tideHourOffset, setTideHourOffset] = useState(0);
  const tideBaseHour = 6;
  const [selectedTideHour, setSelectedTideHour] = useState(6);
  const [selectedTideMinute, setSelectedTideMinute] = useState(0);
  const [tideTimeConfirmed, setTideTimeConfirmed] = useState(false);
  const [showHourly, setShowHourly] = useState(false);

  // pieni apuri: hyväksyy {lat,lon} tai [lat,lon]
  function normalizeCoords(c) {
    if (!c) return null;
    if (Array.isArray(c) && c.length >= 2) {
      const lat = Number(c[0]);
      const lon = Number(c[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      return null;
    }
    if (typeof c === "object" && c.lat != null && c.lon != null) {
      const lat = Number(c.lat);
      const lon = Number(c.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    return null;
  }

  // kartan keskitys: searchLocation -> locationCoords -> userLocation -> fallback
  useEffect(() => {
    const search = normalizeCoords(searchLocation);
    if (search) {
      setMapCenter(search);
      return;
    }

    const ctxLoc = normalizeCoords(locationCoords);
    if (ctxLoc) {
      setMapCenter(ctxLoc);
      return;
    }

    const gps = normalizeCoords(userLocation);
    if (gps) {
      setMapCenter(gps);
      return;
    }

    setMapCenter({ lat: 66.5, lon: 25.7 });
  }, [searchLocation, locationCoords, userLocation]);

  // aktiiviset koordinaatit markerille (haettu paikka tai oma)
  const activeCoords = useMemo(() => {
  // 1️⃣ Haettu paikka tärkein
  if (
    searchLocation &&
    Number.isFinite(searchLocation.lat) &&
    Number.isFinite(searchLocation.lon)
  ) {
    return searchLocation;
  }

  // 2️⃣ Sitten käyttäjän oma sijainti (VirtavesiView:n userLocation)
  if (
    userLocation &&
    Number.isFinite(userLocation.lat) &&
    Number.isFinite(userLocation.lon)
  ) {
    return userLocation;
  }

  // 3️⃣ Viimeisenä fallbackina AppContextin koordinaatit
  if (
    locationCoords &&
    Number.isFinite(locationCoords.lat) &&
    Number.isFinite(locationCoords.lon)
  ) {
    return { lat: locationCoords.lat, lon: locationCoords.lon };
  }

  return null;
}, [userLocation, searchLocation, locationCoords]);


  // OH, sää ja kuunvaihe valitulle tunnille
  const { camel: moonCamel, kebab: moonKebab } =
    normalizeMoonKey(ctxMoonKey || "newMoon");

  const moonSymbol =
    EMOJI_BY_KEY[moonCamel] ||
    EMOJI_FALLBACK[moonCamel] ||
    "🌙";
  const moonLabel = t(
    `moonPhaseNames.${moonKebab}`,
    moonKebab
  );
  const moonPhaseDisplay = `${moonSymbol} ${moonLabel}`;

  // forecast -> selected date / hour
  useEffect(() => {
    if (!forecast || typeof forecast !== "object") return;

    const keys = Object.keys(forecast);
    if (!keys.length) return;

    setForecastDates((prev) => {
      if (prev && prev.length > 0) return prev;
      return keys;
    });

    setSelectedIndex((prev) => {
      if (prev >= 0 && prev < keys.length) return prev;
      return 0;
    });
  }, [forecast]);

  const selectedDate = forecastDates[selectedIndex];
  const selectedData = forecast?.[selectedDate] || {};

  const nowHour = new Date().getHours();
  const todayKeyLocal = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === todayKeyLocal;
  const currentHourKey = String(nowHour).padStart(2, "0");

  const compactHours = isToday
    ? Array.from(new Set([currentHourKey, "12", "18"]))
    : ["12", "18"];

  const availableHours = Object.keys(selectedData || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort(
      (a, b) =>
        Math.abs(a - nowHour) - Math.abs(b - nowHour)
    );

  const displayHourNum =
    availableHours.length > 0 ? availableHours[0] : nowHour;
  const displayHourKey = String(displayHourNum).padStart(2, "0");
  const selectedHourData =
    selectedData[displayHourKey] || null;


    const hourWindowEntries = useMemo(() => {
    if (!selectedData) return [];
    return Object.entries(selectedData)
      .map(([h, d]) => [Number(h), d])
      .filter(([h]) => Number.isFinite(h))
      .sort((a, b) => a[0] - b[0]);
  }, [selectedData]);

  const pastPressHeader = useMemo(() => {
    if (!forecast || !selectedDate || !Number.isFinite(displayHourNum)) return [];
    return collectPastPressures(forecast, selectedDate, displayHourNum, 6);
  }, [forecast, selectedDate, displayHourNum]);

  const futurePressHeader = useMemo(() => {
    if (!forecast || !selectedDate || !Number.isFinite(displayHourNum)) return [];
    return collectFuturePressures(forecast, selectedDate, displayHourNum, 6);
  }, [forecast, selectedDate, displayHourNum]);

  const headerPrecip = useMemo(() => {
    if (!selectedHourData) return null;
    return formatPrecip(selectedHourData, t);
  }, [selectedHourData, t]);

  // 🔁 Virtavesi-headerin OH – sama OH-logiikka (trendit mukaan) kuin järvi/meri-puolella
  const headerOH = useMemo(() => {
    const p = Number(selectedHourData?.Pressure);
    const w = Number(selectedHourData?.WindDirection);
    if (!Number.isFinite(p) || !Number.isFinite(w)) return null;

    const val = computeOH({
      pressure: p,
      windDirection: w,
      moonPhaseKey: moonCamel,        // käytetään samaa kuun avainta kuin listassa
      pastPressures: pastPressHeader,
      futurePressures: futurePressHeader,
    });

    if (!Number.isFinite(val)) return null;
    return Math.max(1, Math.min(8, Math.round(val)));
  }, [selectedHourData, pastPressHeader, futurePressHeader, computeOH, moonCamel]);

  const clampedHeaderOH = Number.isFinite(headerOH)
  ? Math.max(1, Math.min(8, Math.round(headerOH)))
  : null;

  useEffect(() => {
  if (Number.isFinite(clampedHeaderOH)) {
    updateRiverOH(clampedHeaderOH, "VirtavesiView:header");
  }
}, [clampedHeaderOH, updateRiverOH]);

  const totalDistanceKm = useMemo(() => {
    if (path.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < path.length; i++) {
      dist += getDistanceFromLatLonInKm(
        path[i - 1].lat,
        path[i - 1].lng,
        path[i].lat,
        path[i].lng
      );
    }
    return dist.toFixed(2);
  }, [path]);

  const getPressureBasedSpeed = (pressure) => {
    if (pressure <= 980) return 5.1;
    if (pressure <= 990) return 4.7;
    if (pressure <= 995) return 4.1;
    if (pressure <= 1000) return 3.6;
    if (pressure <= 1010) return 3.1;
    if (pressure <= 1015) return 2.9;
    if (pressure <= 1020) return 2.7;
    return 2.5;
  };

  const estimatedSpeed = getPressureBasedSpeed(
    selectedHourData?.Pressure ?? 1013
  );

  const estimatedHours = useMemo(
    () =>
      (
        (Number(totalDistanceKm) || 0) /
        (estimatedSpeed || 1)
      ).toFixed(1),
    [totalDistanceKm, estimatedSpeed]
  );

  const estimatedStrikeTime = useMemo(() => {
    const date = new Date();
    date.setHours(selectedTideHour);
    date.setMinutes(
      selectedTideMinute + parseFloat(estimatedHours || "0") * 60
    );
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [selectedTideHour, selectedTideMinute, estimatedHours]);


  useEffect(() => {
    if (Number.isFinite(selectedHourData?.Pressure)) {
      updatePressure(
        selectedHourData.Pressure,
        "VirtavesiView:selectedHour"
      );
    }
    if (Number.isFinite(selectedHourData?.WindDirection)) {
      updateWind(
        selectedHourData.WindDirection,
        selectedHourData?.WindSpeed,
        "VirtavesiView:selectedHour"
      );
    }
    if (moonCamel) setMoonPhaseKey(moonCamel);
  }, [
    selectedHourData,
    moonCamel,
    updatePressure,
    updateWind,
    setMoonPhaseKey,
  ]);

  useEffect(() => {
    const tryFetchTideFromStation = async () => {
      const stationId = tideStationMap[locationName];
      if (stationId) {
        const tideHour =
          await fetchTideHourFromSeHavniva(stationId);
        if (tideHour !== null) {
          const offset = tideHour - 6;
          if (offset >= -12 && offset <= 12) {
            setTideHourOffset(offset);
          }
        }
      }
    };
    if (window.location.pathname.includes("virtavedet")) {
      tryFetchTideFromStation();
    }
  }, [locationName]);

  const updateLocationName = (lat, lon) => {
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    )
      .then((res) => res.json())
      .then((data) => {
        const name = getShortPlaceName(
          data.address,
          data.display_name
        );
        setLocationName(name || "Tuntematon sijainti");
      })
      .catch((e) => {
        console.error("Reverse geocode error:", e);
        setLocationName("Tuntematon sijainti");
      });
  };

  const updateForecastForCoords = (lat, lon) => {
    fetchForecastData(lat, lon)
      .then((data) => {
        setForecast(data || {});
        const keys = Object.keys(data || {});
        setForecastDates(keys);
        setSelectedIndex(0);
      })
      .catch((err) => {
        console.error("Ennusteen haku epäonnistui:", err);
      });
  };

  useEffect(() => {
    if (
      !locationCoords ||
      !Number.isFinite(locationCoords.lat) ||
      !Number.isFinite(locationCoords.lon)
    ) {
      return;
    }

    // Jos ennuste on jo olemassa, ei tehdä turhaa hakua
    if (forecast && Object.keys(forecast).length > 0) return;

    console.log(
      "[Virtavesi] Automaattinen ennustehaku locationCoordsille:",
      locationCoords
    );
    updateForecastForCoords(locationCoords.lat, locationCoords.lon);
  }, [locationCoords, forecast]);
  const handleSearch = () => {
    if (!searchText.trim()) return;
    setUserLocation(null);
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchText
      )}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data[0]) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const coords = { lat, lon };
          setMapCenter(coords);
          setSearchLocation(coords);
          updateForecastForCoords(lat, lon);
          updateLocationName(lat, lon);
        }
      })
      .catch((e) =>
        console.error("Paikkahaku epäonnistui:", e)
      );
  };

  const handleReturnToUserLocation = () => {
    if (
      locationCoords &&
      Number.isFinite(locationCoords.lat) &&
      Number.isFinite(locationCoords.lon)
    ) {
      const { lat, lon } = locationCoords;
      const obj = { lat, lon };

      console.log("[Virtavesi] Oma paikka (AppContext):", obj);
      setUserLocation(obj);
      setSearchLocation(null);
      setMapCenter(obj);
      updateForecastForCoords(lat, lon);
      updateLocationName(lat, lon);

      try {
        localStorage.setItem(HOME_KEY, JSON.stringify(obj));
      } catch (e) {
        console.warn("[Virtavesi] Kotipaikan tallennus epäonnistui:", e);
      }

      return;
    }

    if (!navigator.geolocation) {
      alert("Geopaikannus ei ole käytettävissä tässä selaimessa.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const obj = { lat: latitude, lon: longitude };

        console.log("[Virtavesi] GPS OK (Oma paikka):", obj);
        setUserLocation(obj);
        setSearchLocation(null);
        setMapCenter(obj);
        updateForecastForCoords(latitude, longitude);
        updateLocationName(latitude, longitude);

        try {
          localStorage.setItem(HOME_KEY, JSON.stringify(obj));
        } catch (e) {
          console.warn(
            "[Virtavesi] Kotipaikan tallennus epäonnistui:",
            e
          );
        }
      },
      (error) => {
        console.error("Geopaikannus epäonnistui:", error.message);
        alert(
          "Geopaikannus epäonnistui. Tarkista, että selaimella on lupa käyttää sijaintiasi."
        );
      }
    );
  };

  const mapElement = useMemo(
    () => (
      <MapContainer
        center={[mapCenter.lat, mapCenter.lon]}
        zoom={10}
        style={{ height: "400px", marginTop: "1em" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapFocusUpdater center={mapCenter} />

        {activeCoords && (
          <Marker
            position={[activeCoords.lat, activeCoords.lon]}
            icon={searchLocation ? greenIcon : blueIcon}
          >
            <Popup>
              {searchLocation
                ? t("searchedLocation", "Haettu sijainti")
                : t("yourLocation", "Oma sijainti")}
            </Popup>
          </Marker>
        )}

        {path.map((pos, idx) => (
          <CircleMarker
            key={idx}
            center={pos}
            radius={6}
            pathOptions={{
              color: idx === 0 ? "blue" : "red",
              fillColor: idx === 0 ? "blue" : "red",
              fillOpacity: 1,
            }}
          >
            <Popup>
              {idx === 0
                ? t("yourLocation", "Oma sijainti")
                : `${t("point", "Piste")} ${idx}`}
            </Popup>
          </CircleMarker>
        ))}

        {path.length > 1 && (
          <Polyline
            positions={path.map((p) => [p.lat, p.lng])}
            color="red"
          />
        )}

        <ClickableMap
          addPoint={(latlng) => setPath((prev) => [...prev, latlng])}
          setTideHourOffset={setTideHourOffset}
        />
      </MapContainer>
    ),
    [mapCenter, activeCoords, searchLocation, path, t]
  );

  const tideHour = tideBaseHour + tideHourOffset;

  const visibleHourEntries = showHourly
    ? hourWindowEntries
    : hourWindowEntries.filter(([hourNum]) =>
        isToday
          ? compactHours.includes(
              String(hourNum).padStart(2, "0")
            )
          : ["12", "18"].includes(
              String(hourNum).padStart(2, "0")
            )
      );

  return (
    <div style={{ padding: "1em" }}>
      {/* 🔍 Haku + oma paikka + takaisin Järvi/Meri */}
      <div style={{ marginBottom: "1em" }}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={t("search", "Hae paikka...")}
        />
        <button onClick={handleSearch}>
          🔍 {t("search", "Hae")}
        </button>
        <button onClick={handleReturnToUserLocation}>
          📍 {t("myLocation", "Oma paikka")}
        </button>
        <button onClick={() => navigate("/")}>
          ↩️{" "}
          {t(
            "backToLakeSea",
            "Palaa Järvi-/Merivesiin"
          )}
        </button>
      </div>

      <h2>
        📍 {t("location", "Sijainti")}:{" "}
        {locationName || "Tuntematon sijainti"}
      </h2>

      {!activeCoords && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            borderRadius: "6px",
            padding: "0.5rem 0.75rem",
            marginTop: "0.5rem",
            maxWidth: "320px",
            fontSize: "0.9rem",
            lineHeight: 1.4,
            color: "#856404",
          }}
        >
          ⚠ {t("noCoords", "Paikan koordinaatteja ei saatu.")}
          <br />
          {t(
            "pleaseUseLocation",
            "Paina 'Oma paikka' tai anna selaimelle sijaintilupa."
          )}
        </div>
      )}

      {isToday &&
        activeCoords &&
        selectedHourData?.Pressure !== undefined && (
          <p>
            📈 {t("pressure", "Ilmanpaine")}:{" "}
            {selectedHourData.Pressure.toFixed(1)} hPa
          </p>
        )}

      {isToday &&
        activeCoords &&
        selectedHourData?.WindDirection !== undefined && (
          <p>
            💨 {t("windDirection", "Tuulen suunta")}:{" "}
            {getWindDirectionText(selectedHourData.WindDirection, t)}
            {Number.isFinite(selectedHourData?.WindSpeed)
              ? ` ${selectedHourData.WindSpeed.toFixed(1)} m/s`
              : ""}
            {headerPrecip && (
              <>
                {" "}
                | {headerPrecip.emoji}{" "}
                {headerPrecip.text ? `${headerPrecip.text}` : ""}
              </>
            )}
          </p>
        )}

      {(moonCamel || moonKebab) && (
        <p>
          🌙 {t("moonPhase", "Kuun vaihe")}:{" "}
          {moonPhaseDisplay}
        </p>
      )}

      {/* 🎣 OH + lohi-ikonit */}
<div
  style={{
    marginTop: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  }}
>
  <span>
    🎣 {t("catchLikelihood", "Ottihalukkuus")}:{" "}
    {clampedHeaderOH != null ? `${clampedHeaderOH} / 8` : "- / 8"}
  </span>
  {renderSalmonIcons(clampedHeaderOH)}
</div>


      {/* 7-päivän tuntiennuste + OH per tunti */}
      {selectedDate && (
        <div style={{ marginTop: "1em" }}>
          <h4>
            {t(
              "sevenDayFishForecast",
              "7-päivän kalasääennuste"
            )}
            : {formatDMY(forecastDates[0])} –{" "}
            {formatDMY(
              forecastDates[
                Math.min(
                  forecastDates.length - 1,
                  6
                )
              ]
            )}
          </h4>

          <div
            style={{
              margin: "0.25em 0 0.5em",
              opacity: 0.9,
            }}
          >
            <span>
              <strong>
                {t("today", "Tänään")}:
              </strong>{" "}
              {formatDMY(todayKeyLocal)}
            </span>
            {selectedDate && (
              <>
                {" "}
                &bull;{" "}
                <span>
                  <strong>
                    {t(
                      "selectedDay",
                      "Valittu päivä"
                    )}
                    :
                  </strong>{" "}
                  {formatDMY(selectedDate)}
                </span>
              </>
            )}
          </div>

          {(visibleHourEntries || []).map(([hourNum, d]) => {
            const hourKey = String(hourNum).padStart(
              2,
              "0"
            );

            const pastPressures = collectPastPressures(
              forecast,
              selectedDate,
              hourNum,
              6
            );
            const futurePressures = collectFuturePressures(
              forecast,
              selectedDate,
              hourNum,
              6
            );

            const ohHour =
              Number.isFinite(d?.Pressure) &&
              Number.isFinite(d?.WindDirection)
                ? computeOH({
                    pressure: Number(d.Pressure),
                    windDirection: Number(d.WindDirection),
                    moonPhaseKey: moonCamel,
                    pastPressures,
                    futurePressures,
                  })
                : null;

            const ohShown =
              Number.isFinite(ohHour) && ohHour > 0
                ? Math.max(1, Math.min(8, Math.round(ohHour)))
                : null;

            const { emoji: precipEmoji, text: precipText } = formatPrecip(d, t);

            return (
              <p key={hourKey}>
                🕒 {hourKey}:00 – 🌡{" "}
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
                  : "-"}
                {Number.isFinite(d?.WindSpeed)
                  ? ` ${d.WindSpeed.toFixed(1)} m/s`
                  : ""}
                {ohShown !== null && (
                  <>
                    {" | 🎣 "}
                    <span title={`Kuun vaihe: ${moonPhaseDisplay}`}>
                      OH {ohShown}/8
                    </span>
                  </>
                )}
                {" | "}
                {precipEmoji}
                {precipText ? ` ${precipText}` : ""}
              </p>
            );
          })}

          <div style={{ marginTop: "0.5em" }}>
            <button
              onClick={() =>
                setShowHourly((prev) => !prev)
              }
              style={{
                backgroundColor: "#17507c",
                color: "white",
                border: "none",
                borderRadius: "5px",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {showHourly
                ? t(
                    "hideHourlyForecast",
                    "Piilota tuntiennuste"
                  )
                : t(
                    "showHourlyForecast",
                    "Näytä tuntiennuste"
                  )}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: "1em",
              marginTop: "0.5em",
            }}
          >
            <button
              onClick={() =>
                setSelectedIndex((i) =>
                  Math.max(0, i - 1)
                )
              }
              disabled={selectedIndex === 0}
            >
              ⬅️
            </button>
            <button
              onClick={() =>
                setSelectedIndex((i) =>
                  Math.min(
                    forecastDates.length - 1,
                    i + 1
                  )
                )
              }
              disabled={
                selectedIndex >=
                forecastDates.length - 1
              }
            >
              ➡️
            </button>
            <button onClick={() => setPath([])}>
              🗑️{" "}
              {t("clearPath", "Tyhjennä reitti")}
            </button>
          </div>
        </div>
      )}

      {/* Vuoroveden huipun säätö */}
      <div style={{ marginTop: "1em" }}>
        <label>
          {t("tidePeak", "Nousuveden huippu")}:{" "}
        </label>
        <select
          value={selectedTideHour}
          onChange={(e) =>
            setSelectedTideHour(Number(e.target.value))
          }
        >
          {[...Array(24)].map((_, i) => (
            <option key={i} value={i}>
              {i.toString().padStart(2, "0")}
            </option>
          ))}
        </select>
        {" : "}
        <select
          value={selectedTideMinute}
          onChange={(e) =>
            setSelectedTideMinute(
              Number(e.target.value)
            )
          }
        >
          {[0, 10, 20, 30, 40, 50].map((m) => (
            <option key={m} value={m}>
              {m.toString().padStart(2, "0")}
            </option>
          ))}
        </select>
        <button onClick={setTideTimeConfirmed}>
          ✔️
        </button>
        {tideTimeConfirmed && (
          <span
            style={{
              color: "green",
              marginLeft: "1em",
            }}
          >
            ✔️{" "}
            {t("tideSet", "Huippuaika asetettu")}:{" "}
            {selectedTideHour
              .toString()
              .padStart(2, "0")}
            :
            {selectedTideMinute
              .toString()
              .padStart(2, "0")}
          </span>
        )}
      </div>

      {/* SeHavniva-nappi */}
     <button
  type="button"
  style={{
    background: "#17507c",
    color: "white",
    border: "none",
    borderRadius: "5px",
    padding: "6px 12px",
    cursor: "pointer",
    marginTop: "0.5em",
  }}
  onClick={() => {
    if (!navigator.geolocation) {
      alert("Sijainnin haku ei ole käytettävissä.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const url =
          `https://kartverket.no/en/at-sea/se-havniva/result` +
          `?latitude=${lat}&longitude=${lon}`;

        window.open(url, "_blank", "noopener,noreferrer");
      },
      (error) => {
        alert(
          "❌ Sijainnin haku epäonnistui: " +
            error.message
        );
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }}
>
  🌊 {t("openSehavniva", "Avaa SeHavniva-vuorovesisivu")}
</button>


      {/* Etäisyys + ottiaika jos polku piirretty */}
      {Number(totalDistanceKm) > 0 && (
        <div style={{ marginTop: "0.5em" }}>
          <p>
            {t(
              "distanceFromMouth",
              "Etäisyys jokisuusta"
            )}
            : {totalDistanceKm} km
          </p>
          <p>
            {t("strikeTime", "Ottiaika")}:{" "}
            {estimatedStrikeTime} (
            {estimatedHours} h @{" "}
            {estimatedSpeed.toFixed(2)} km/h)
          </p>
        </div>
      )}

      {/* 🗺 Kartta */}
      {mapElement}

      {/* 📂 Tabs: Saalisilmoitus / Historia / Yhteenveto / Tilastot */}
      <div style={{ marginTop: "0.75rem" }}>
        <VirtavesiTabs
  forecastOH={headerOH}
  pressure={selectedHourData?.Pressure}
/>
      </div>
    </div>
  );
}
