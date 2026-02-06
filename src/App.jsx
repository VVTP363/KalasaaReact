import PwaUpdateToast from "./components/PwaUpdateToast";
// src/App.jsx
import WeatherTabs from "./components/WeatherTabs";
import VirtavesiView from "./components/VirtavesiView";
import LanguageSelector from "./components/LanguageSelector";
import { AppProvider, AppContext } from "./components/AppContext";
import { Toaster } from "sonner";
import { Routes, Route } from "react-router-dom";
import { useContext, useEffect } from "react";
import { EntitlementProvider } from "./components/EntitlementContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthBar from "./components/AuthBar";
import ProUnlockBar from "./components/ProUnlockBar";

// 🔹 AUTOMAATTINEN GEOPAIKANNUSTUS KERRAN SOVELLUKSEN KÄYNNISTYESSÄ
function BootstrapGeolocation() {
  const { setLocationCoords } = useContext(AppContext);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("[Bootstrap] Selaimesi ei tue geopaikannusta.");
      setLocationCoords({ lat: 60.1699, lon: 24.9384 }); // Helsinki fallback
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log("[Bootstrap] GPS OK:", latitude, longitude);
        setLocationCoords({ lat: latitude, lon: longitude });
      },
      (err) => {
        console.error("[Bootstrap] GPS VIRHE:", err);
        setLocationCoords({ lat: 60.1699, lon: 24.9384 });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [setLocationCoords]);

  return null;
}

export default function App() {
  return (
    <AppProvider>
      <EntitlementProvider>
        <div className="app-container">
	  <LanguageSelector />
	  <AuthBar />
	  <ProUnlockBar />
	  <Toaster />
	  <BootstrapGeolocation />
          <PwaUpdateToast />
          <Routes>
            <Route path="/" element={<WeatherTabs />} />
            <Route path="/virtavedet" element={
                <ProtectedRoute>
                  <VirtavesiView />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </EntitlementProvider>
    </AppProvider>
  );
}
