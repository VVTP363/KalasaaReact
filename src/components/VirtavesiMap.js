// VirtavesiMap.js
import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import axios from "axios";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const LocationMarker = ({ addPoint }) => {
  useMapEvents({
    click(e) {
      addPoint(e.latlng);
    },
  });
  return null;
};

const VirtavesiMap = () => {
  const [coords, setCoords] = useState([66.0, 25.0]);
  const [points, setPoints] = useState([]);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(6);
  const [totalDistance, setTotalDistance] = useState(null);

  useEffect(() => {
    if (points.length >= 2) {
      let dist = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const R = 6371;
        const dLat = ((b.lat - a.lat) * Math.PI) / 180;
        const dLon = ((b.lng - a.lng) * Math.PI) / 180;
        const lat1 = (a.lat * Math.PI) / 180;
        const lat2 = (b.lat * Math.PI) / 180;
        const x = dLon * Math.cos((lat1 + lat2) / 2);
        const y = dLat;
        dist += Math.sqrt(x * x + y * y) * R;
      }
      setTotalDistance(dist.toFixed(2));
    } else {
      setTotalDistance(null);
    }
  }, [points]);

  const handleSearch = async () => {
    if (!search) return;
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}`);
      if (res.data.length > 0) {
        const place = res.data[0];
        setCoords([parseFloat(place.lat), parseFloat(place.lon)]);
        setZoom(11);
      }
    } catch (err) {
      console.error("Hakuvirhe:", err);
    }
  };

  const handleOmaPaikka = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setCoords([pos.coords.latitude, pos.coords.longitude]);
      setZoom(12);
    });
  };

  const handleClear = () => {
    setPoints([]);
    setTotalDistance(null);
  };

  return (
    <div>
      <div style={{ marginBottom: "0.5em" }}>
        <input
          type="text"
          placeholder="Hae paikka..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginRight: "0.5em", width: "200px" }}
        />
        <button onClick={handleSearch}>🔍 HAE</button>
        <button onClick={handleOmaPaikka}>📍 OMA PAIKKA</button>
        <button onClick={() => window.location.href = "/"}>↩️ Järvi / Meri</button>
        <button onClick={handleClear}>🗑️ Tyhjennä mittaus</button>
      </div>

      {totalDistance && <p>📏 Etäisyys mittapisteiden välillä: <strong>{totalDistance} km</strong></p>}

      <MapContainer center={coords} zoom={zoom} style={{ height: "500px", width: "100%" }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <LocationMarker addPoint={(point) => setPoints([...points, point])} />
        {points.map((pos, i) => (
          <Marker key={i} position={pos} icon={markerIcon} />
        ))}
        {points.length >= 2 && <Polyline positions={points} color="blue" />}
      </MapContainer>
    </div>
  );
};

export default VirtavesiMap;
