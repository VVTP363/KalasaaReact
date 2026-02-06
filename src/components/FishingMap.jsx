// src/components/FishingMap.jsx
import { useState } from "react";

export default function FishingMap() {
  const [location, setLocation] = useState(null);
  const [mapProvider, setMapProvider] = useState("karttaselain");
  const [weather, setWeather] = useState(null);
  const [showWeather, setShowWeather] = useState(false);

  // Vite: ympäristömuuttujat luetaan import.meta.env kautta
  const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      console.error("Sijaintia ei tueta tässä selaimessa.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setLocation(userLocation);

        // 📌 Lisätään aikaleima estämään välimuistin käyttö
        const timestamp = Date.now();

        let url;
        if (mapProvider === "karttaselain") {
          url = `https://app.karttaselain.fi/?lat=${userLocation.lat}&lon=${userLocation.lon}&zoom=12&t=${timestamp}`;
        } else if (mapProvider === "oskari") {
          url = `https://julkinen.traficom.fi/oskari/?lon=${userLocation.lon}&lat=${userLocation.lat}&zoomLevel=10&t=${timestamp}`;
        }

        if (url) {
          window.open(url, "_blank"); // 🔗 Avataan uusi välilehti
        }

        fetchWeather(userLocation.lat, userLocation.lon);
      },
      (error) => {
        console.error("GPS-virhe:", error);
      }
    );
  };

  const fetchWeather = async (lat, lon) => {
    if (!API_KEY) {
      console.warn("VITE_WEATHER_API_KEY puuttuu .env-tiedostosta");
      return;
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
      );
      if (!response.ok) {
        console.error("OpenWeather-virhe:", response.status, response.statusText);
        return;
      }
      const data = await response.json();
      setWeather(data);
    } catch (error) {
      console.error("Säädatan hakemisessa tapahtui virhe:", error);
    }
  };

  return (
    <div>
      <h1>KalastusApp - Karttanäkymä</h1>

      <label>
        Valitse karttapohja:{" "}
        <select
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value)}
        >
          <option value="karttaselain">Karttaselain</option>
          <option value="oskari">Traficomin Oskari</option>
        </select>
      </label>

      <button onClick={getUserLocation}>📍 Avaa kartta</button>

      {location && (
        <p>
          🌍 Kartta avattu sijaintiin: {location.lat}, {location.lon}
        </p>
      )}

      {weather && (
        <div
          style={{
            marginTop: "20px",
            background: "#f8f9fa",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <h2>🌦 Sääennuste</h2>
          <p>📍 {weather.name}</p>
          <p>🌡 Lämpötila: {weather.main?.temp}°C</p>
          <p>💨 Tuulen nopeus: {weather.wind?.speed} m/s</p>
          <p>🧭 Tuulen suunta: {weather.wind?.deg}°</p>

          <button onClick={() => setShowWeather(true)}>Näytä sää</button>
          {showWeather && (
            <div
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "rgba(255,255,255,0.9)",
                padding: "10px",
                borderRadius: "5px",
              }}
            >
              <p>🌦 {weather.weather?.[0]?.description}</p>
              <button onClick={() => setShowWeather(false)}>Sulje</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
