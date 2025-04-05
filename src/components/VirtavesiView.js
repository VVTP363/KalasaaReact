// VirtavesiView.js
import React, { useEffect, useState, useMemo, useContext } from "react";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { MapContainer, TileLayer, useMapEvents, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import "proj4leaflet";
import { useNavigate } from "react-router-dom";
import VirtavesiTabs from "./VirtavesiTabs";
import { AppContext } from "./AppContext";

const blueIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png"
});

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png"
});

const MapZoomer = ({ center }) => {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && map && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, 13);
    }
  }, [center]);
  return null;
};

const PathOverlay = ({ pathPoints, updatePosition }) => (
  <>
    {pathPoints.map((pt, idx) => (
      <Marker
        key={`marker-${idx}`}
        position={[pt.lat, pt.lng]}
        draggable={true}
        eventHandlers={{
          dragend: (e) => {
            const newLatLng = e.target.getLatLng();
            updatePosition(idx, newLatLng);
          }
        }}
        icon={redIcon}
      />
    ))}
    {pathPoints.length > 1 && <Polyline positions={pathPoints.map(p => [p.lat, p.lng])} color="blue" />}
  </>
);

const ClickableMap = ({ addPathPoint }) => {
  useMapEvents({
    click(e) {
      addPathPoint(e.latlng);
    }
  });
  return null;
};

const OmaPaikkaKohdistus = ({ trigger, setMapCenter }) => {
  const map = useMapEvents({});
  useEffect(() => {
    if (trigger && map && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = [position.coords.latitude, position.coords.longitude];
          map.setView(coords, 13);
          setMapCenter(coords);
          L.marker(coords, { icon: blueIcon })
            .addTo(map)
            .bindPopup("Oma sijaintisi")
            .openPopup();
        },
        (error) => console.error("Sijainnin haku epäonnistui:", error)
      );
    }
  }, [trigger]);
  return null;
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function VirtavesiView({ tideHour = 6 }) {
  const { pressure } = useContext(AppContext);
  const [pathPoints, setPathPoints] = useState([]);
  const [mapCenter, setMapCenter] = useState([69.0, 25.0]);
  const [tideAdjust, setTideAdjust] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [mapKey, setMapKey] = useState(Date.now());
  const [haeOmaPaikka, setHaeOmaPaikka] = useState(true);
  const [tideBaseHour, setTideBaseHour] = useState(tideHour);
  const [fetchedTideTime, setFetchedTideTime] = useState(null);
  const [tideError, setTideError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setHaeOmaPaikka(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pathPoints.length > 0) {
      const first = pathPoints[0];
      const fetchTideTime = async () => {
        try {
          const res = await axios.get(
            `https://api.met.no/weatherapi/tideforecast/2.0/.json?lat=${first.lat}&lon=${first.lng}`,
            {
              headers: {
                "User-Agent": "KalasääApp/1.0 teemu@kalastaja.fi"
              }
            }
          );
          const events = res.data?.tides?.data?.extremes || [];
          const now = new Date();
          const nextHigh = events.find(e => e.type === "high" && new Date(e.time) > now);
          if (nextHigh) {
            const time = new Date(nextHigh.time);
            setTideBaseHour(time.getHours());
            setFetchedTideTime(time.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }));
            setTideError(null);
          } else {
            throw new Error("Ei löytynyt sopivaa huippua");
          }
        } catch (err) {
          console.error("Nousuveden haku (Met.no) epäonnistui:", err);
          setTideError("❗ Nousuveden huipun haku epäonnistui. Käytetään oletusaikaa klo 6:00.");
        }
      };
      fetchTideTime();
    }
  }, [pathPoints]);

useEffect(() => {
  if (pathPoints.length > 1) {
    let total = 0;
    for (let i = 1; i < pathPoints.length; i++) {
      total += calculateDistance(
        pathPoints[i - 1].lat,
        pathPoints[i - 1].lng,
        pathPoints[i].lat,
        pathPoints[i].lng
      );
    }
    setDistanceKm(total);
  } else if (pathPoints.length === 1) {
    // Yksi täppä asetettu — nollataan etäisyys mutta ei kadoteta
    setDistanceKm(0);
  } else {
    setDistanceKm(0);
  }
}, [pathPoints]);


  const getPressureFactor = (p) => {
    if (!p || isNaN(p)) return 1.0;
    if (p > 1010) return 1.0;
    if (p > 1000) return 1.2;
    if (p > 992) return 1.4;
    return 1.1;
  };

  const adjustedTideHour = useMemo(() => (24 + tideBaseHour + tideAdjust) % 24, [tideBaseHour, tideAdjust]);

  const ottiaika = useMemo(() => {
    const factor = getPressureFactor(pressure);
    const speed = 0.5 * factor;
    if (!distanceKm || !speed) return adjustedTideHour;
    const hours = distanceKm / speed;
    return Math.round((adjustedTideHour + hours) % 24);
  }, [adjustedTideHour, distanceKm, pressure]);

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json`);
      const data = await response.json();
      if (data.length > 0) {
        const result = data[0];
        setMapCenter([parseFloat(result.lat), parseFloat(result.lon)]);
        setMapKey(Date.now());
        setSearchError("");
      } else {
        setSearchError("❗ Paikkaa ei löydy");
      }
    } catch (error) {
      console.error("Paikkahaku epäonnistui:", error);
      setSearchError("❗ Paikkahaku epäonnistui");
    }
  };

  const clearPath = () => {
    setPathPoints([]);
    setDistanceKm(0);
  };

  return (
    <div>
      <h2>🎣 Virtavesien ottiaikaikkuna</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3em', marginBottom: '0.8em', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Hae paikka (esim. Näätämö)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.1em', fontSize: '0.75em', height: '1.6em', flex: '1' }}
        />
        <div style={{ display: 'flex', gap: '0.3em' }}>
          <button onClick={handleSearch} style={{ padding: '0.2em 0.4em', fontSize: '0.75em', height: '1.8em' }}>🔍 HAE</button>
          <button onClick={() => setHaeOmaPaikka(true)} style={{ padding: '0.2em 0.4em', fontSize: '0.75em', height: '1.8em' }}>📍 OMA PAIKKA</button>
          <button onClick={() => navigate("/")} style={{ padding: '0.2em 0.4em', fontSize: '0.75em', height: '1.8em' }}>↩️ JÄRVI-/MERIVETEEN</button>
          <button onClick={clearPath} style={{ padding: '0.2em 0.4em', fontSize: '0.75em', height: '1.8em', backgroundColor: '#eee', border: '1px solid #aaa' }}>🗑️ Tyhjennä mittaus</button>
        </div>
      </div>
      {searchError && <p style={{ color: 'red' }}>{searchError}</p>}
      {/*tideError && <p style={{ color: 'red' }}>{tideError}</p>*/}
      {fetchedTideTime && <p>🌊 Seuraava nousuvesihuippu (Met.no): {fetchedTideTime}</p>}
      <p>Nousuveden huippu (kellotettuna): klo {adjustedTideHour}:00</p>
      <p>🎯 Ennustettu ottiaika: klo {ottiaika}:00</p>
      <label>
        ⏱ Säädä huippua: {tideAdjust >= 0 ? "+" : ""}{tideAdjust} h
        <input
          type="range"
          min="-3"
          max="3"
          step="1"
          value={tideAdjust}
          onChange={(e) => setTideAdjust(parseInt(e.target.value))}
        />
      </label>
      <p>📍 Valittu etäisyys jokisuusta: {distanceKm.toFixed(2)} km</p>

      <div style={{ height: "300px", marginTop: "1em" }}>
        <MapContainer
          key={mapKey}
          center={mapCenter}
          zoom={8}
          style={{ height: "100%" }}
          className="leaflet-container"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <MapZoomer center={mapCenter} />
          <OmaPaikkaKohdistus trigger={haeOmaPaikka} setMapCenter={setMapCenter} />
          <ClickableMap addPathPoint={(latlng) => setPathPoints([...pathPoints, latlng])} />
          <PathOverlay pathPoints={pathPoints} updatePosition={(i, newLatLng) => {
            const updated = [...pathPoints];
            updated[i] = newLatLng;
            setPathPoints(updated);
          }} />
        </MapContainer>
      </div>

      <div style={{ marginTop: "2em" }}>
        <VirtavesiTabs ottiaika={ottiaika} />
      </div>
    </div>
  );
}
