import React, { useEffect, useState, useMemo, useRef } from "react";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { MapContainer, TileLayer, useMapEvents, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import "proj4leaflet";
import { useNavigate } from "react-router-dom";

const OmaPaikkaKohdistus = ({ trigger }) => {
  const map = useMapEvents({});

  useEffect(() => {
    if (trigger && map) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 13);
            L.circleMarker([latitude, longitude], {
              radius: 8,
              color: "green",
              fillColor: "green",
              fillOpacity: 1,
            })
              .addTo(map)
              .bindPopup("Oma sijaintisi")
              .openPopup();
          },
          (error) => {
            console.error("Sijainnin haku epäonnistui:", error);
          }
        );
      } else {
        alert("Selaimesi ei tue paikkatietoa.");
      }
    }
  }, [trigger, map]);

  return null;
};

const ClickableMap = ({ addPathPoint }) => {
  useMapEvents({
    click(e) {
      addPathPoint(e.latlng);
      console.debug("Klikattu piste:", e.latlng);
    },
  });
  return null;
};

const MapZoomer = ({ center }) => {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && map && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, 13);
    }
  }, [center]);
  return null;
};

const DraggableMarker = ({ position, index, updatePosition }) => {
  if (!position || !position.lat || !position.lng) return null;
  return (
    <Marker
      position={[position.lat, position.lng]}
      draggable={true}
      icon={L.divIcon({ className: 'custom-marker', html: '<div style="background: red; width: 16px; height: 16px; border-radius: 50%;"></div>' })}
      eventHandlers={{
        dragend: (e) => {
          const newLatLng = e.target.getLatLng();
          updatePosition(index, newLatLng);
          console.debug("Marker siirretty:", newLatLng);
        },
      }}
    />
  );
};

const PathOverlay = ({ pathPoints, updatePosition }) => {
  return (
    <>
      {pathPoints.map((pt, idx) => (
        <DraggableMarker key={`marker-${idx}`} position={pt} index={idx} updatePosition={updatePosition} />
      ))}
      {pathPoints.length > 1 && pathPoints.every(p => p?.lat && p?.lng) && (
        <Polyline key={`line-${pathPoints.length}`} positions={pathPoints.map(p => [p.lat, p.lng])} color="blue" />
      )}
    </>
  );
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getPressureMultiplier = (hPa) => {
  if (hPa < 998) return 1.2;
  if (hPa <= 1005) return 1.1;
  if (hPa <= 1013) return 1.0;
  if (hPa <= 1018) return 0.9;
  return 0.8;
};

const calculateOttiennuste = (pressure, distanceKm, moonPhase) => {
  const pressureFactor = getPressureMultiplier(pressure);
  const distanceFactor = Math.min(1 + distanceKm / 20, 2);
  const moonFactor = moonPhase.includes("Täysikuu") ? 1.2 : moonPhase.includes("Kasvava") ? 1.1 : 1.0;
  const ennuste = pressureFactor * distanceFactor * moonFactor;
  return Math.round(Math.max(1, Math.min(ennuste * 2, 8)));
};

const renderFishIcons = (OH) => {
  return Array.from({ length: 8 }, (_, i) =>
    i < OH - 1 ? "🔴" : i === OH - 1 ? "🟡" : "⚪"
  ).join(" ");
};

const calculateMoonPhase = () => {
  const today = new Date();
  const lastNewMoon = new Date("2025-02-28");
  const msPerDay = 1000 * 60 * 60 * 24;
  const moonCycle = 29.53;
  let diffDays = Math.floor((today - lastNewMoon) / msPerDay) % moonCycle;
  if (diffDays < 0) diffDays += moonCycle;
  if (diffDays < 1.5) return "🌑 Uusikuu";
  else if (diffDays < 7.5) return "🌒 Kasvava sirppi";
  else if (diffDays < 14.5) return "🌓 Kasvava puolikuu";
  else if (diffDays < 16.5) return "🌕 Täysikuu";
  else if (diffDays < 23) return "🌖 Pienenevä kuu 3/4";
  else return "🌗 Pienenevä kuu 4/4";
};

const VirtavesiView = ({ tideHour = 6 }) => {
  const [pathPoints, setPathPoints] = useState([]);
  const [mapCenter, setMapCenter] = useState([69.0, 25.0]);
  const [tideAdjust, setTideAdjust] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [haeOmaPaikka, setHaeOmaPaikka] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [pressure, setPressure] = useState(1013);
  const [moonPhase, setMoonPhase] = useState(calculateMoonPhase());
  const [searchError, setSearchError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setHaeOmaPaikka(true);
    const timer = setTimeout(() => setHaeOmaPaikka(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pathPoints.length > 1) {
      let total = 0;
      for (let i = 1; i < pathPoints.length; i++) {
        const prev = pathPoints[i - 1];
        const curr = pathPoints[i];
        if (prev && curr) {
          total += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        }
      }
      setDistanceKm(Number.isFinite(total) ? total : 0);
    } else {
      setDistanceKm(0);
    }
  }, [pathPoints]);

  useEffect(() => {
    const fetchPressure = async () => {
      try {
        const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&latlon=${mapCenter[0]},${mapCenter[1]}&parameters=Pressure`;
        const response = await axios.get(url);
        const parsed = new XMLParser({ ignoreAttributes: false }).parse(response.data);
        const elements = parsed["wfs:FeatureCollection"]["wfs:member"] || [];
        const pressureValue = elements.find(el => el["BsWfs:BsWfsElement"]["BsWfs:ParameterName"] === "Pressure")?.["BsWfs:BsWfsElement"]["BsWfs:ParameterValue"];
        if (pressureValue) setPressure(parseFloat(pressureValue));
      } catch (error) {
        console.error("Ilmanpaineen haku epäonnistui:", error);
      }
    };
    fetchPressure();
  }, [mapCenter]);

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json`);
      const data = await response.json();
      if (data.length > 0) {
        const result = data[0];
        const latlng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
        if (!isNaN(latlng.lat) && !isNaN(latlng.lng)) {
          setMapCenter([latlng.lat, latlng.lng]);
          setSearchError(null);
        }
      } else {
        setSearchError("Paikkaa ei löydy");
      }
    } catch (error) {
      console.error("Paikkahaku epäonnistui:", error);
      setSearchError("Paikkaa ei löydy");
    }
  };

  const adjustedTideHour = useMemo(() => (24 + tideHour + tideAdjust) % 24, [tideHour, tideAdjust]);
  const ottiaika = useMemo(() => (adjustedTideHour + Math.round(distanceKm / 2)) % 24, [adjustedTideHour, distanceKm]);
  const ottiennuste = calculateOttiennuste(pressure, distanceKm, moonPhase);

  return (
    <div>
      <h2>🎣 Virtavesien ottiaikaikkuna</h2>

      <div style={{ marginBottom: '1em' }}>
        <input
          type="text"
          placeholder="Hae paikka (esim. Näätämö)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.5em', width: '60%' }}
        />
        <button onClick={handleSearch} style={{ padding: '0.5em', marginLeft: '0.5em' }}>🔍 HAE</button>
        <button onClick={() => setHaeOmaPaikka(true)} style={{ padding: '0.5em', marginLeft: '0.5em' }}>📍 OMA PAIKKA</button>
        <button onClick={() => navigate("/")} style={{ padding: '0.5em', marginLeft: '0.5em' }}>↩️ VAIHDA JÄRVI-/MERIVETEEN</button>
        {searchError && <p style={{ color: 'red' }}>{searchError}</p>}
      </div>

      <div style={{ border: '2px solid #ccc', borderRadius: '12px', padding: '1em', backgroundColor: '#f9f9f9', maxWidth: '500px', marginBottom: '1em' }}>
        <p>📈 Ilmanpaine: {pressure} hPa</p>
        <p>🌕 Kuun vaihe: {moonPhase}</p>
        <p>📊 Ottiennuste: {ottiennuste} / 8</p>
        <p style={{ fontSize: '1.5em' }}>{renderFishIcons(ottiennuste)}</p>
        <p style={{ textAlign: 'center', fontWeight: 'bold' }}>🌊 Nousuveden huippu: klo {tideHour}:00</p>
        <label>
          ⏱ Säädä nousuveden huippua: {tideAdjust >= 0 ? "+" : ""}{tideAdjust} h
          <input
            type="range"
            min="-4"
            max="4"
            step="1"
            value={tideAdjust}
            onChange={(e) => setTideAdjust(parseInt(e.target.value))}
          />
        </label>
        <p>📍 Valittu etäisyys jokisuusta: {distanceKm.toFixed(2)} km</p>
        <p>🎯 Ennustettu ottiaika: klo {ottiaika}:00</p>
      </div>

      <div style={{ height: "400px", width: "100%" }}>
        <MapContainer center={mapCenter} zoom={8} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <MapZoomer center={mapCenter} />
          <OmaPaikkaKohdistus trigger={haeOmaPaikka} />
          <ClickableMap addPathPoint={(latlng) => setPathPoints((prev) => [...prev, latlng])} />
          <PathOverlay pathPoints={pathPoints} updatePosition={(index, newLatLng) => {
            const updated = [...pathPoints];
            updated[index] = newLatLng;
            setPathPoints(updated);
          }} />
        </MapContainer>
      </div>
    </div>
  );
};

export default VirtavesiView;
