// src/components/fetchForecast.js

// 1) Ennusteen haku ja rakenteen muodostus (yhteinen Järvi/Meri + Virtavesi)
export async function fetchForecastData(coordsOrLat, maybeLon, { signal } = {}) {
  let lat, lon;
  if (typeof coordsOrLat === "object" && coordsOrLat !== null && !Array.isArray(coordsOrLat)) {
    lat = Number(coordsOrLat.lat);
    lon = Number(coordsOrLat.lon);
  } else if (Array.isArray(coordsOrLat)) {
    lat = Number(coordsOrLat[0]);
    lon = Number(coordsOrLat[1]);
  } else {
    lat = Number(coordsOrLat);
    lon = Number(maybeLon);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn("fetchForecastData: missing/invalid coords", { lat, lon });
    return {};
  }


  const base = "https://api.open-meteo.com/v1/forecast";
  const hourly = [
    "temperature_2m",
    "pressure_msl",
    "winddirection_10m",
    "windspeed_10m",
    "precipitation",
    "precipitation_probability",
    "rain",
    "snowfall",
    "cloudcover",
    "weathercode",
  ].join(",");

  const url =
    `${base}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${hourly}` +
    `&timezone=UTC`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Open-Meteo ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();

  const out = {};
  const times = data?.hourly?.time || [];
  for (let i = 0; i < times.length; i++) {
    const iso = times[i];
    const [dayStr, hourStrFull] = iso.split("T");
    const hourOnly = hourStrFull.slice(0, 2);

    if (!out[dayStr]) out[dayStr] = {};
    const windMs = (data.hourly.windspeed_10m?.[i] ?? 0) / 3.6;

    out[dayStr][hourOnly] = {
      Temperature: data.hourly.temperature_2m?.[i],
      Pressure: data.hourly.pressure_msl?.[i],
      WindDirection: data.hourly.winddirection_10m?.[i],
      WindSpeed: windMs,
      PrecipMm: data.hourly.precipitation?.[i] ?? 0,
      PrecipProb: data.hourly.precipitation_probability?.[i] ?? null,
      RainMm: data.hourly.rain?.[i] ?? 0,
      SnowMm: data.hourly.snowfall?.[i] ?? 0,
      CloudCover: data.hourly.cloudcover?.[i] ?? null,
      WeatherCode: data.hourly.weathercode?.[i] ?? null,
    };
  }

  return out;
}

// 2) Sama formatPrecip, mutta viedään ulos muualle käytettäväksi
export function formatPrecip(d, t) {
  function skyFromWmoOrClouds(code, clouds) {
    if (Number.isFinite(code)) {
      if (code === 0) return "☀️";
      if (code === 1 || code === 2) return "🌤️";
      if (code === 3) return "☁️";
      if (code === 45 || code === 48) return "🌫️";
      return "☁️";
    }
    if (Number.isFinite(clouds)) {
      if (clouds <= 15) return "☀️";
      if (clouds <= 60) return "🌤️";
      return "☁️";
    }
    return "☁️";
  }

  if (!d || typeof d !== "object") {
    return { emoji: "☁️", text: "" };
  }

  const temp = Number.isFinite(d?.Temperature) ? Number(d.Temperature) : undefined;
  const cloudPct = Number.isFinite(d?.CloudCover) ? Number(d.CloudCover) : undefined;
  const wmo = Number.isFinite(d?.WeatherCode) ? Number(d.WeatherCode) : undefined;

  const rainMm = Number.isFinite(d?.RainMm) ? Number(d.RainMm) : undefined;
  const snowMm = Number.isFinite(d?.SnowMm) ? Number(d.SnowMm) : undefined;
  const totalMm = Number.isFinite(d?.PrecipMm)
    ? Number(d.PrecipMm)
    : (Number(rainMm || 0) + Number(snowMm || 0));

  const prob = Number.isFinite(d?.PrecipProb) ? Number(d.PrecipProb) : undefined;

  const isSnowCode = Number.isFinite(wmo) && (
    (wmo >= 71 && wmo <= 77) ||
    wmo === 85 || wmo === 86 ||
    wmo === 66 || wmo === 67
  );
  const isSnowTemp = Number.isFinite(temp) && temp <= 0;
  const isSnow =
    Number(totalMm) > 0 &&
    (Number(snowMm) > 0 || isSnowCode || isSnowTemp);

  if (Number.isFinite(totalMm)) {
    if (totalMm <= 0) {
      return { emoji: skyFromWmoOrClouds(wmo, cloudPct), text: "" };
    }
    return { emoji: isSnow ? "🌨️" : "🌧️", text: `${totalMm.toFixed(1)} mm/h` };
  }

  if (Number.isFinite(prob)) {
    return {
      emoji: "☔",
      text: `${Math.round(Math.max(0, Math.min(100, prob)))}%`,
    };
  }

  return { emoji: skyFromWmoOrClouds(wmo, cloudPct), text: "" };
}
