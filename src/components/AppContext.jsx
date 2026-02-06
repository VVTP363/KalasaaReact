// src/components/AppContext.jsx
import React, {
  createContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import { computeOHBidirectional } from "../utils/fishingOH";
import { EMOJI_BY_KEY, normalizeMoonKey } from "../utils/moon";


const HOME_KEY = "kalasaa:homeCoords";

export const AppContext = createContext({
  forecast: null,
  pressure: null,
  windDirection: null,
  windSpeed: null,
  moonPhaseKey: "newMoon",
  moonEmoji: "🌙",
  locationCoords: null, // { lat, lon } tai null
  locationName: "",
  riverOH: null,
  lakeSeaOH: null,

  // raw setters (back-compat)
  setForecast: () => {},
  setPressure: () => {},
  setWindDirection: () => {},
  setWindSpeed: () => {},
  setMoonPhaseKey: () => {},
  setMoonEmoji: () => {},
  setLocationCoords: () => {},
  setLocationName: () => {},
  setRiverOH: () => {},
  setLakeSeaOH: () => {},

  // safe updaters + helpers
  updatePressure: () => {},
  updateWind: () => {},
  updateRiverOH: () => {},
  updateLakeSeaOH: () => {},
  computeOH: () => null, // YKSI TOTUUS: käyttää utils/fishingOH
});

// Sama tarkempi kuunvaihefunktio kuin Weather.jsx:ssä
function getMoonPhaseKeyFromDate(date = new Date()) {
  const lp = 2551443; // sekuntia / synodinen kuukausi
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

export function AppProvider({ children }) {
  // --- STATE ---
  const [forecast, setForecast] = useState(null);
  const [pressure, setPressure] = useState(null);
  const [windDirection, setWindDirection] = useState(null);
  const [windSpeed, setWindSpeed] = useState(null);
  const [moonPhaseKey, setMoonPhaseKey] = useState("newMoon");
  const [moonEmoji, setMoonEmoji] = useState("🌙");
  const [locationCoords, setLocationCoords] = useState(null); // { lat, lon }
  const [locationName, setLocationName] = useState("");
  const [riverOH, setRiverOH] = useState(null);
  const [lakeSeaOH, setLakeSeaOH] = useState(null);

  // --- STAMPIT (ettei vanha data yliaja uutta) ---
  const [pressureTS, setPressureTS] = useState(0);
  const [windTS, setWindTS] = useState(0);

  // --- Kuun vaiheen päivitys 6h välein (yhteinen logiikka) ---
  useEffect(() => {
    const apply = () => {
      const rawKey = getMoonPhaseKeyFromDate(new Date());
      const { camel } = normalizeMoonKey(rawKey);
      const emoji = EMOJI_BY_KEY[camel] || "🌙";

      if (camel && camel !== moonPhaseKey) setMoonPhaseKey(camel);
      if (emoji !== moonEmoji) setMoonEmoji(emoji);
    };

    apply();
    const timer = setInterval(apply, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [moonPhaseKey, moonEmoji]);

  // GPS / HOME_KEY (luetaan vain kerran mountissa)
  useEffect(() => {
    // 1) Yritä ensin lukea tallennettu koti
    try {
      const raw = localStorage.getItem(HOME_KEY); // ✅ oikea avain
      if (raw) {
        const home = JSON.parse(raw);

        const lat = Number(home?.lat);
        const lon = Number(home?.lon ?? home?.lng);

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setLocationCoords({ lat, lon });

          // nimi vain jos on järkevä
          if (home?.name && String(home.name).trim()) {
            setLocationName(String(home.name));
          }
          return; // ✅ koti löytyi -> ei pakko-GPS:ää tässä
        }
      }
    } catch (e) {
      console.warn("[CTX] HOME_KEY parse fail:", e);
    }

    // 2) Jos kotia ei ole → kokeile GPS:ää
    if (!navigator.geolocation) {
      console.warn("[CTX] navigator.geolocation puuttuu – ei aseteta fallbackia");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        console.log("[CTX] GPS OK:", coords);
        setLocationCoords(coords);
        // setLocationName jätetään tyhjäksi -> reverse-geocode täyttää
      },
      (err) => {
        console.warn("[CTX] GPS-virhe, jätetään locationCoords nulliksi:", err);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, [])

  // 🔁 Hae paikannimi automaattisesti aina kun locationCoords päivittyy
  useEffect(() => {
    if (!locationCoords) return;

    // Jos nimi on jo järkevä, ei väkisin kirjoiteta yli
    if (locationName && locationName !== "Tuntematon sijainti") return;

    const { lat, lon } = locationCoords;

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

        // päivitetään myös HOME_KEY:n nimi talteen
        try {
          const raw = localStorage.getItem(HOME_KEY);
          const prev = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            HOME_KEY,
            JSON.stringify({ ...prev, lat, lon, name: shortName })
          );
        } catch (e) {
          console.warn("[CTX] HOME_KEY-päivitys epäonnistui:", e);
        }
      })
      .catch((err) => {
        console.warn("[CTX] Reverse geocode fail:", err);
        setLocationName("Tuntematon sijainti");
      });
  }, [locationCoords, locationName]);

  // --- SAFE UPDATERS ---
  const updatePressure = (val, source = "unknown") => {
    const num = Number(val);
    if (!Number.isFinite(num)) return;

    const now = Date.now();
    if (now >= pressureTS && num !== pressure) {
      setPressure(num);
      setPressureTS(now);
      console.log(`[CTX] pressure <- ${num} (from ${source})`);
    }
  };

  const updateWind = (dirDeg, speed = null, source = "unknown") => {
    const dir = Number(dirDeg);
    if (!Number.isFinite(dir)) return;

    const speedNum = Number(speed);
    const speedIsNum = Number.isFinite(speedNum);

    const now = Date.now();
    const changed =
      dir !== windDirection || (speedIsNum && speedNum !== windSpeed);

    if (now >= windTS && changed) {
      setWindDirection(dir);
      if (speedIsNum) setWindSpeed(speedNum);
      setWindTS(now);
      console.log(
        `[CTX] wind <- ${dir}°${
          speedIsNum ? ` ${speedNum} m/s` : ""
        } (from ${source})`
      );
    }
  };

  const updateRiverOH = (val, source = "unknown") => {
    if (!Number.isFinite(val)) return;
    const clipped = Math.max(1, Math.min(8, Math.round(val)));
    setRiverOH((prev) => {
      if (prev === clipped) return prev;
      console.log(`[CTX] riverOH <- ${clipped} (from ${source})`);
      return clipped;
    });
  };

  const updateLakeSeaOH = (val, source = "unknown") => {
    if (!Number.isFinite(val)) return;
    const clipped = Math.max(1, Math.min(8, Math.round(val)));
    setLakeSeaOH((prev) => {
      if (prev === clipped) return prev;
      console.log(`[CTX] lakeSeaOH <- ${clipped} (from ${source})`);
      return clipped;
    });
  };

  // --- YKSI TOTUUS OH-LASKENTAAN ---
  const computeOH = ({
    pressure: p,
    windDirection: deg,
    moonPhaseKey: overrideMoonKey,
    pastPressures,
    futurePressures,
  }) => {
    const pressureNum = Number(p);
    const degNum = Number(deg);
    if (!Number.isFinite(pressureNum) || !Number.isFinite(degNum)) return null;

    return computeOHBidirectional({
      pressure: pressureNum,
      windDirection: degNum,
      // jos kutsuja ei anna erillistä avainta, käytetään Contextin omaa
      moonPhaseKey: overrideMoonKey || moonPhaseKey,
      pastPressures,
      futurePressures,
    });
  };

  // Päivitä riverOH automaattisesti kun syötteet muuttuvat
  useEffect(() => {
    if (!Number.isFinite(pressure) || !Number.isFinite(windDirection))
      return;
    const next = computeOH({ pressure, windDirection, moonPhaseKey });
    if (Number.isFinite(next)) updateRiverOH(next, "AppContext:auto");
  }, [pressure, windDirection, moonPhaseKey]);

  // --- Bootstrap: jos forecast.hourly olemassa, täytetään paine/tuuli kerran ---
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!forecast || bootstrappedRef.current) return;
    if (Number.isFinite(pressure) && Number.isFinite(windDirection)) {
      bootstrappedRef.current = true;
      return;
    }
    const hourly = forecast?.hourly;
    if (!Array.isArray(hourly) || hourly.length === 0) return;

    const now = Date.now();
    let best = null;
    let diff = Infinity;
    for (const h of hourly) {
      const tMs = h?.dt ? Date.parse(h.dt) : NaN;
      if (!Number.isFinite(tMs)) continue;
      const d = Math.abs(tMs - now);
      if (d < diff) {
        diff = d;
        best = h;
      }
    }
    if (!best) return;

    const p = Number(best?.pressure);
    const dir = Number(best?.windDirection);
    const spd = Number(best?.windSpeed);

    if (!Number.isFinite(pressure) && Number.isFinite(p))
      updatePressure(p, "AppContext:bootstrap");
    if (!Number.isFinite(windDirection) && Number.isFinite(dir))
      updateWind(
        dir,
        Number.isFinite(spd) ? spd : null,
        "AppContext:bootstrap"
      );

    if (
      (!Number.isFinite(pressure) && Number.isFinite(p)) ||
      (!Number.isFinite(windDirection) && Number.isFinite(dir))
    ) {
      bootstrappedRef.current = true;
    }
  }, [forecast, pressure, windDirection]);

  // --- Provider value ---
  const value = useMemo(
    () => ({
      // state
      forecast,
      pressure,
      windDirection,
      windSpeed,
      moonPhaseKey,
      moonEmoji,
      locationCoords,
      locationName,
      riverOH,
      lakeSeaOH,

      // raw setters
      setForecast,
      setPressure,
      setWindDirection,
      setWindSpeed,
      setMoonPhaseKey,
      setMoonEmoji,
      setLocationCoords,
      setLocationName,
      setRiverOH,
      setLakeSeaOH,

      // helpers
      updatePressure,
      updateWind,
      updateRiverOH,
      updateLakeSeaOH,
      computeOH,
    }),
    [
      forecast,
      pressure,
      windDirection,
      windSpeed,
      moonPhaseKey,
      moonEmoji,
      locationCoords,
      locationName,
      riverOH,
      lakeSeaOH,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
