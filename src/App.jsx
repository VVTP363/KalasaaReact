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
import AdminGrantProButton from "./components/AdminGrantProButton";

// ✅ Lazy-load isot näkymät
const WeatherTabs = lazy(() => import("./components/WeatherTabs"));
const VirtavesiView = lazy(() => import("./components/VirtavesiView"));

// 🔹 AUTOMAATTINEN GEOPAIKANNUSTUS
function BootstrapGeolocation() {
  const { setLocationCoords } = useContext(AppContext);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationCoords({ lat: 60.1699, lon: 24.9384 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocationCoords({ lat: latitude, lon: longitude });
      },
      () => {
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

// ✅ Stripe-paluu: synkkaa PRO-oikeus
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
      } catch {
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        await computeAccess({ user });
      } catch {
        // hiljainen fail productionissa
      }
    });

    return () => unsub();
  }, []);

  return (
    <AppProvider>
      <EntitlementProvider>
        <CheckoutSync />

        <div className="app-container">
          <LanguageSelector />
          <AuthBar />
          <ProUnlockBar />
          <AdminGrantProButton />
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