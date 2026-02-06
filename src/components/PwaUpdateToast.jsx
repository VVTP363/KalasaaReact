// src/components/PwaUpdateToast.jsx
import React, { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

export default function PwaUpdateToast() {
  const [show, setShow] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

  useEffect(() => {
    const sw = registerSW({
      immediate: true,
      onNeedRefresh() {
        setShow(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisterError(e) {
        console.warn("[PWA] register error", e);
      },
    });

    setUpdateSW(() => sw);

    // 🔥 tarkista päivitys 60s välein
    const interval = setInterval(() => {
      try {
        sw?.(); // check update
      } catch {}
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // ✅ ÄLÄ renderöi mitään jos ei näytetä
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 999999,
        display: "flex",
        justifyContent: "center",
        // ❌ POISTETTU pointerEvents: "none" (voi blokata mobiilissa)
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "#0b5cff",
          color: "white",
          borderRadius: 14,
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          padding: "12px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontWeight: 700 }}>Uusi versio saatavilla</div>
          <div style={{ opacity: 0.92, fontSize: 13 }}>
            Päivitä saadaksesi uusimmat muutokset.
            {offlineReady ? " (Offline-valmius päivitetty.)" : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShow(false)}
            style={{
              background: "rgba(255,255,255,0.18)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              fontWeight: 600,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Myöhemmin
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                if (typeof updateSW === "function") {
                  // true = skipWaiting + reload
                  await updateSW(true);
                  return;
                }
              } catch (e) {
                console.warn("[PWA] updateSW(true) failed", e);
              }

              // ✅ fallback: unregister + reload
              try {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              } catch (e) {
                console.warn("[PWA] unregister fallback failed", e);
              }
              window.location.reload();
            }}
            style={{
              background: "white",
              color: "#0b5cff",
              border: "none",
              borderRadius: 10,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 800,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Päivitä
          </button>
        </div>
      </div>
    </div>
  );
}
