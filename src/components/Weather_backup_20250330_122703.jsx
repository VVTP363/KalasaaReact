import React, { useState, useEffect } from "react";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { useNavigate } from "react-router-dom";

const getCompassDirection = (deg) => {
  const directions = ["Pohjoinen", "Koillinen", "Itä", "Kaakko", "Etelä", "Lounas", "Länsi", "Luode"];
  return directions[Math.round(deg / 45) % 8];
};

const calculateFishingPrediction = (windDir, pressure, moon, isRiver = false) => {
  let windFactor = 1;
  if (windDir > 90 && windDir <= 135) windFactor = 1.5;
  else if (windDir > 135 && windDir <= 270) windFactor = 2;
  else if (windDir > 270 && windDir <= 315) windFactor = 1.5;

  let pressureFactor = 1;
  if (pressure > 980 && pressure <= 1003) pressureFactor = 1.3;
  else if (pressure > 1003 && pressure <= 1008) pressureFactor = 1.6;
  else if (pressure > 1008 && pressure <= 1013) pressureFactor = 1.8;
  else if (pressure > 1013 && pressure <= 1018) pressureFactor = 1.5;
  else if (pressure > 1018) pressureFactor = 1.2;

  let moonFactor = 1;
  if (moon.includes("Kasvava sirppi")) moonFactor = 1.2;
  else if (moon.includes("Kasvava puolikuu")) moonFactor = 1.5;
  else if (moon.includes("Täysikuu")) moonFactor = 2;
  else if (moon.includes("Pienenevä kuu 3/4")) moonFactor = 1.7;
  else if (moon.includes("Pienenevä kuu 4/4")) moonFactor = 1.1;

  let OH = windFactor * pressureFactor * moonFactor;
  if (isRiver) OH += 0.5;
  return Math.round(Math.max(1, Math.min(OH, 8)));
};

const ForecastItem = ({ date, hour, data }) => {
  if (!data || !data.Temperature || !data.FeelsLike || !data.WindSpeedMS || !data.WindDirection) return null;
  return (
    <p>
      ⏰ {hour}:00 🌡 {parseFloat(data.Temperature).toFixed(1)}°C (Tuntuu kuin {parseFloat(data.FeelsLike).toFixed(1)}°C)
      💨 {parseFloat(data.WindSpeedMS).toFixed(1)} m/s ({getCompassDirection(data.WindDirection)})
    </p>
  );
};

const Weather = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isRiver, setIsRiver] = useState(false);
  const [forecastData, setForecastData] = useState({});
  const [locationName, setLocationName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [error, setError] = useState(null);
  const [moonPhase, setMoonPhase] = useState("");
  const [fishingPrediction, setFishingPrediction] = useState(1);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [readyToRender, setReadyToRender] = useState(false);
  const navigate = useNavigate();

  const calculateMoonPhase = () => {
    const today = new Date();
    const lastNewMoon = new Date("2025-02-28");
    const msPerDay = 1000 * 60 * 60 * 24;
    const moonCycle = 29.53;
    let diffDays = Math.floor((today - lastNewMoon) / msPerDay) % moonCycle;
    if (diffDays < 0) diffDays += moonCycle;
    let phase = "🌑 Uusikuu";
    if (diffDays < 1.5) phase = "🌑 Uusikuu";
    else if (diffDays < 7.5) phase = "🌒 Kasvava sirppi";
    else if (diffDays < 14.5) phase = "🌓 Kasvava puolikuu";
    else if (diffDays < 16.5) phase = "🌕 Täysikuu";
    else if (diffDays < 23) phase = "🌖 Pienenevä kuu 3/4";
    else phase = "🌗 Pienenevä kuu 4/4";
    setMoonPhase(phase);
  };

  const renderFishIcons = (OH) => {
    return Array.from({ length: 8 }, (_, i) =>
      i < OH - 1 ? "🔴" : i === OH - 1 ? "🟡" : "⚪"
    ).join(" ");
  };

  const openMapWindow = (url) => {
    window.open(url, "_blank");
  };

  const getUserLocation = () => {
    if (isLoading) return;
    setIsLoading(true);
    if (!navigator.geolocation) {
      setError("Selaimesi ei tue geopaikannusta.");
      setIsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          setReadyToRender(false);
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);
          setSelectedDateIndex(0);
          setError(null);
        } catch (err) {
          setError("Tietojen haku epäonnistui.");
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        console.error("Geopaikannusvirhe:", err);
        setError("Sijainnin haku epäonnistui. Salli sijainti selaimen asetuksista ja yritä uudelleen.");
        setIsLoading(false);
      }
    );
  };

  useEffect(() => {
    calculateMoonPhase();
    if (latitude === null && longitude === null) {
      getUserLocation();
    }
  }, []);

  useEffect(() => {
    const updateData = async () => {
      if (latitude !== null && longitude !== null) {
        setReadyToRender(false);
        const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&latlon=${latitude},${longitude}&parameters=Temperature,FeelsLike,WindSpeedMS,WindDirection,Pressure`;
        try {
          const response = await axios.get(url);
          const parsed = new XMLParser({ ignoreAttributes: false }).parse(response.data);
          const elements = parsed["wfs:FeatureCollection"]["wfs:member"] || [];
          const data = {};

          elements.forEach((el) => {
            const e = el["BsWfs:BsWfsElement"];
            const time = new Date(e["BsWfs:Time"]);
            const hour = time.getHours();
            if (![0, 8, 14, 20].includes(hour)) return;
            const date = time.toISOString().split("T")[0];
            const param = e["BsWfs:ParameterName"];
            const val = e["BsWfs:ParameterValue"];
            if (!data[date]) data[date] = {};
            if (!data[date][hour]) data[date][hour] = {};
            data[date][hour][param] = val;
          });

          setForecastData(data);

          const selectedDate = Object.keys(data)[selectedDateIndex];
          const forecastForDate = data[selectedDate] || {};
          const firstHourData = forecastForDate[Object.keys(forecastForDate)[0]];
          if (firstHourData) {
            const windDir = parseFloat(firstHourData.WindDirection);
            const pressure = parseFloat(firstHourData.Pressure);
            const oh = calculateFishingPrediction(windDir, pressure, moonPhase, isRiver);
            setFishingPrediction(oh);
          }
        } catch (error) {
          setError("Säätietojen haku epäonnistui.");
        } finally {
          setReadyToRender(true);
        }
      }
    };
    updateData();
  }, [latitude, longitude, selectedDateIndex, moonPhase, isRiver]);

  const dateKeys = Object.keys(forecastData);
  const selectedDate = dateKeys[selectedDateIndex];
  const forecastForDate = forecastData[selectedDate] || {};

  if (!readyToRender) return <div>⏳ Ladataan säätietoja...</div>;

  return (
    <div>
      <h2>🌦 Järvi / Meri SääKala-ennuste</h2>
      <p>📍 {locationName} ({latitude?.toFixed(4) || "-"}, {longitude?.toFixed(4) || "-"})</p>

      <input
        type="text"
        value={searchLocation}
        onChange={(e) => setSearchLocation(e.target.value)}
        placeholder="Hae paikka..."
      />
      <button onClick={getUserLocation}>📍 OMA PAIKKA</button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <p>🎣 Ottihalukkuus: {fishingPrediction}/8</p>
      <p>{renderFishIcons(fishingPrediction)}</p>

      <h3>{selectedDate}</h3>
      {Object.entries(forecastForDate)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([hour, data]) => (
          <ForecastItem key={`${selectedDate}-${hour}`} date={selectedDate} hour={hour} data={data} />
        ))}

      <div style={{ marginTop: "1em" }}>
        <button onClick={() => setSelectedDateIndex(Math.max(selectedDateIndex - 1, 0))}>⬅ Edellinen</button>
        <button onClick={() => setSelectedDateIndex(Math.min(selectedDateIndex + 1, dateKeys.length - 1))}>Seuraava ➡</button>
      </div>

      <div style={{ marginTop: "2em" }}>
        <button onClick={() => openMapWindow("https://julkinen.traficom.fi/oskari/")}>🗺️ Traficon Oskari (isot vedet)</button>
        <button onClick={() => openMapWindow("https://app.karttaselain.fi/")}>🗺️ Karttaselain (pienvedet)</button>
      </div>

      <button onClick={() => navigate("/virtavedet")} style={{ marginTop: "1em", padding: "0.5em" }}>
        ↪️ VAIHDA VIRTAVETEEN
      </button>

      <p style={{ marginTop: '2em', fontSize: '0.9em', color: '#555' }}>
        SÄÄTIEDOT: Ilmatieteen laitoksen avoin data (<a href="https://opendata.fmi.fi/wfs" target="_blank" rel="noopener noreferrer">https://opendata.fmi.fi/wfs</a>) (CC BY 4.0)
      </p>
    </div>
  );
};

export default Weather;
