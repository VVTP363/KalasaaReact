import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { useNavigate } from "react-router-dom";
import { AppContext } from "./AppContext"; // 🔗 Kytketään kontekstiin

const getCompassDirection = (deg) => {
  const directions = ["Pohjoinen", "Koillinen", "Itä", "Kaakko", "Etelä", "Lounas", "Länsi", "Luode"];
  return directions[Math.round(deg / 45) % 8];
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
  const { setPressure, setWindDirection, setMoonPhase } = useContext(AppContext); // 🔄 Context-arvojen asettajat
  const [locationName, setLocationName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [forecastData, setForecastData] = useState({});
  const [moon, setMoon] = useState("");
  const [currentPressure, setCurrentPressure] = useState(null);
  const [currentWindDirection, setCurrentWindDirection] = useState(null);
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
    setMoon(phase);
    setMoonPhase(phase);
  };

  const renderFishIcons = (OH) => {
    return Array.from({ length: 8 }, (_, i) =>
      i < OH - 1 ? "🔴" : i === OH - 1 ? "🟡" : "⚪"
    ).join(" ");
  };

  const getUserLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setLatitude(lat);
      setLongitude(lon);
      const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const addr = res.data.address;
      const locality = addr.village || addr.town || addr.hamlet || addr.municipality || "";
      const region = addr.city || addr.county || addr.state || "";
      setLocationName(`${locality}, ${region}`.replace(/^, /, "").replace(/, $/, ""));
    });
  };

  const handleLocationSearch = async () => {
    if (!searchLocation) return;
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchLocation)}`);
      if (res.data && res.data.length > 0) {
        const place = res.data[0];
        setLatitude(parseFloat(place.lat));
        setLongitude(parseFloat(place.lon));
        const addr = place.display_name.split(",");
        setLocationName(`${addr[0].trim()}, ${addr[1]?.trim() || ""}`);
        setSelectedDateIndex(0);
      }
    } catch (error) {
      console.error("Paikkahaun virhe:", error);
    }
  };

  useEffect(() => {
    calculateMoonPhase();
    getUserLocation();
  }, []);

  useEffect(() => {
    const updateData = async () => {
      if (latitude && longitude) {
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
            const OH = Math.round(Math.max(1, Math.min(8, 1.5 * pressure / 1013)));
            setFishingPrediction(OH);
            setCurrentPressure(pressure);
            setCurrentWindDirection(getCompassDirection(windDir));
            setPressure(pressure);
            setWindDirection(getCompassDirection(windDir));
          }
        } catch (err) {
          console.error("Säätietojen haku epäonnistui", err);
        } finally {
          setReadyToRender(true);
        }
      }
    };
    updateData();
  }, [latitude, longitude, selectedDateIndex, moon]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const laji = e.target.laji.value;
    const maara = parseInt(e.target.maara.value);
    const paino = parseFloat(e.target.paino.value);
    const cr = parseInt(e.target.cr.value);

    const uusiSaalis = {
      aika: new Date().toISOString(),
      paikka: locationName,
      laji,
      maara,
      paino,
      cr,
      ilmanpaine: currentPressure,
      tuulensuunta: currentWindDirection,
      kuu: moon
    };

    const vanhat = JSON.parse(localStorage.getItem("saalisdata") || "[]");
    const paivitetyt = [...vanhat, uusiSaalis];
    localStorage.setItem("saalisdata", JSON.stringify(paivitetyt));

    alert("Saalisilmoitus tallennettu!");
    e.target.reset();
  };

  const dateKeys = Object.keys(forecastData);
  const selectedDate = dateKeys[selectedDateIndex];
  const forecastForDate = forecastData[selectedDate] || {};

  return (
    <div>
      <h2>🌦 Kalasääennuste</h2>

      <input
        type="text"
        value={searchLocation}
        onChange={(e) => setSearchLocation(e.target.value)}
        placeholder="Hae paikka..."
        style={{ marginRight: "0.5em", width: "180px" }}
      />
      <button onClick={handleLocationSearch}>🔍 HAE</button>
      <button onClick={getUserLocation}>📍 OMA PAIKKA</button>

      <p>📍 {locationName} ({latitude?.toFixed(4)}, {longitude?.toFixed(4)})</p>
      <p>📈 Ilmanpaine: {currentPressure} hPa</p>
      <p>🌙 Kuun vaihe: {moon}</p>
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

      <form onSubmit={handleSubmit} style={{ marginTop: "2em" }}>
        <h3>🎣 Saalisilmoitus</h3>
        <select name="laji" required style={{ marginRight: "0.5em" }}>
          <option value="">Valitse kalalaji</option>
          <option value="Hauki">Hauki</option>
          <option value="Ahven">Ahven</option>
          <option value="Kuha">Kuha</option>
          <option value="Lohi">Lohi</option>
          <option value="Rautu">Rautu</option>
          <option value="Taimen">Taimen</option>
          <option value="Harjus">Harjus</option>
          <option value="Siika">Siika</option>
          <option value="Muikku">Muikku</option>
          <option value="Made">Made</option>
          <option value="Särkikalat">Särkikalat</option>
        </select>
        <input name="maara" type="number" min="0" placeholder="Kpl" required style={{ width: "4em", marginRight: "0.5em" }} />
        <input name="paino" type="number" min="0" placeholder="kg" step="0.1" style={{ width: "5em", marginRight: "0.5em" }} />
        <input name="cr" type="number" min="0" placeholder="C&R" style={{ width: "4em", marginRight: "0.5em" }} />
        <button type="submit">💾 Tallenna</button>
      </form>

      <button onClick={() => navigate("/saaliit")} style={{ marginTop: "2em" }}>📑 Näytä saalistiedot</button>
      <button onClick={() => navigate("/virtavedet")} style={{ marginTop: "1em" }}>↪️ VAIHDA VIRTAVETEEN</button>

      <div style={{ marginTop: "2em" }}>
        <button onClick={() => window.open("https://julkinen.traficom.fi/oskari/", "_blank")}>🗺️ Traficon Oskari (isot vedet)</button>
        <button onClick={() => window.open("https://app.karttaselain.fi/", "_blank")}>🗺️ Karttaselain (pienvedet)</button>
      </div>
    </div>
  );
};

export default Weather;
