// src/App.jsx
import React, { Suspense, lazy, useContext, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { computeAccess } from "./utils/accessConfig";
import PwaUpdateToast from "./components/PwaUpdateToast";
import LanguageSelector from "./components/LanguageSelector";
import { AppProvider, AppContext } from "./components/AppContext";
import {
  EntitlementProvider,
  useEntitlement,
} from "./components/EntitlementContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthBar from "./components/AuthBar";
import ProUnlockBar from "./components/ProUnlockBar";
import { Toaster } from "sonner";
import ProSuccess from "./components/ProSuccess";
import ProInfoPage from "./components/ProInfoPage";
console.log("[APP] render");



// ✅ Lazy-load isot näkymät
const WeatherTabs = lazy(() => import("./components/WeatherTabs"));
const VirtavesiView = lazy(() => import("./components/VirtavesiView"));

// 🔹 AUTOMAATTINEN GEOPAIKANNUSTUS KERRAN SOVELLUKSEN KÄYNNISTYESSÄ
function BootstrapGeolocation() {
  const { setLocationCoords } = useContext(AppContext);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("[Bootstrap] Selaimesi ei tue geopaikannusta.");
      setLocationCoords({ lat: 60.1699, lon: 24.9384 });
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

function RouteFallback() {
  return <div style={{ padding: 12 }}>Ladataan…</div>;
}

// ✅ Stripe-paluu: synkkaa PRO-oikeus heti maksun jälkeen
function CheckoutSync() {
  const { forceSyncEntitlement } = useEntitlement();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    let tries = 0;

    const t = setInterval(async () => {
      try {
        const r = await forceSyncEntitlement();

        if (r?.entitlement?.tier?.startsWith("pro") || ++tries > 6) {
          clearInterval(t);
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch (e) {
        console.error("[CHECKOUT SYNC] failed:", e);

        if (++tries > 6) {
          clearInterval(t);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    }, 2000);

    return () => clearInterval(t);
  }, [forceSyncEntitlement]);

  return null;
}

export default function App() {
  useEffect(() => {
    console.log("[AUTH] useEffect mounted");
    console.log("[APP] loaded", new Date().toISOString());

    const timer = setTimeout(() => {
      console.log("[APP] timeout tick");
    }, 1000);

    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log("[AUTH] state changed:", user ? user.email : "no user");

      if (!user) return;

      try {
        console.log("[ACCESS] reading config...");
        const access = await computeAccess({ user });
        console.log("[ACCESS] result:", access);
      } catch (e) {
        console.error("[ACCESS] failed:", e);
      }
    });

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  return (
    <AppProvider>
      <EntitlementProvider>
        <CheckoutSync />
  
        <div className="app-container">
          <LanguageSelector />
          <AuthBar />
          <ProUnlockBar />
          <Toaster />
          <BootstrapGeolocation />
          <PwaUpdateToast />

          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<WeatherTabs />} />
              <Route path="/pro-success" element={<ProSuccess />} />
              <Route path="/pro" element={<ProInfoPage />} />
              <Route
                path="/virtavedet"
                element={
                  <ProtectedRoute>
                    <VirtavesiView />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </EntitlementProvider>
    </AppProvider>
  );
}