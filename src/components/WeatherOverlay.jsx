import { useState, useEffect } from "react";

const WEATHER_API_KEY = process.env.REACT_APP_WEATHER_API_KEY;
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";

function WeatherOverlay({ lat, lon }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lat || !lon) return;

    setLoading(true);
    fetch(`${WEATHER_API_URL}?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`)
      .then((response) => response.json())
      .then((data) => {
        if (data.cod !== 200) {
          throw new Error(data.message || "Virhe säätiedon hakemisessa");
        }
        setWeather(data);
      })
      .catch((error) => {
        console.error("Sään lataaminen epäonnistui:", error);
        setError(error.message);
      })
      .finally(() => setLoading(false));
  }, [lat, lon]);

  // ✅ 1. Näytetään latausviesti, jos data ei ole vielä tullut
  if (loading) {
    return <div className="weather-overlay">Ladataan säädataa...</div>;
  }

  // ✅ 2. Jos API:sta tuli virhe, näytetään virheviesti
  if (error) {
    return <div className="weather-overlay">Virhe: {error}</div>;
  }

  // ✅ 3. Tarkistetaan, että weather-, weather.weather ja weather.main ovat olemassa ennen käyttöä
  if (!weather || !weather.weather || !weather.weather[0] || !weather.main) {
    return <div className="weather-overlay">Säätiedot eivät ole saatavilla</div>;
  }

  return (
    <div className="weather-overlay">
      <h3>{weather.name}</h3>
      <p>{weather.weather[0].description}</p>
      <p>{weather.main.temp}°C</p>
    </div>
  );
}

export default WeatherOverlay;

