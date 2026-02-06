// src/components/WeatherTabs.jsx
import React, { useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import SaalisYhteenveto from "./SaalisYhteenveto";
import Weather from "./Weather";
import StatsChart from "./StatsChart";
import LakeSeaCatchForm from "./LakeSeaCatchForm_fixed.jsx";
import SaalisHistoria from "./SaalisHistoria.jsx";
import { useFishingSession } from "../hooks/useFishingSession";
import StartFishingButton from "./StartFishingButton";
import SessionMenu from "./SessionMenu";
import { AppContext } from "./AppContext";
import Toast from "./Toast";
import { normalizeSpecies } from "../utils/species";
import { useEntitlement } from "./EntitlementContext";


function WeatherTabs() {
  const [activeTab, setActiveTab] = useState("weather");
  const { t, i18n } = useTranslation();
  const ctx = useContext(AppContext);
  const [historySpecies, setHistorySpecies] = useState("ALL");
  const { isPro } = useEntitlement();

React.useEffect(() => {
  if (!isPro && ["history", "summary", "stats"].includes(activeTab)) {
    setActiveTab("weather");
  }
}, [isPro, activeTab]);

const TARGET_SPECIES = [
  "Taimen",
  "Lohi",
  "Ahven",
  "Hauki",
  "Made",
  "Harjus",
  "Siika",
  "Kuha",
  "Rautu",
  "Saimaannieriä",
  "Kyttyrälohi",
];

const [targetOpen, setTargetOpen] = useState(false);
const [targetSpecies, setTargetSpecies] = useState("");

const [toastOpen, setToastOpen] = useState(false);
const [toastMsg, setToastMsg] = useState("");
const showToast = (msg) => {
  setToastMsg(msg);
  setToastOpen(true);
  window.setTimeout(() => setToastOpen(false), 2000);
};

const session = useFishingSession({
  mode: "lake",
  lang: i18n.language,
  getWeatherSnapshot: () => ({
    pressure: ctx.pressure,
    windDeg: ctx.windDirection,
    windSpeed: ctx.windSpeed,
    windDirectionText: ctx.windText || null,
    forecastOH: ctx.lakeSeaOH ?? null,
    moonPhaseKey: ctx.moonPhaseKey,
    moonEmoji: ctx.moonEmoji,
    moonPhaseLabel: ctx.moonPhaseLabel,
  }),
  getContextSnapshot: () => ({
    locationName: ctx.locationName,
    coords: ctx.coords || ctx.locationCoords || null, // jos löytyy
  }),
});
	
  const TabButton = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "8px",
        border: activeTab === id ? "2px solid #333" : "1px solid #999",
        fontWeight: activeTab === id ? "600" : "400",
        backgroundColor: activeTab === id ? "#eee" : "#fff",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="weather-tabs-container"
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        display: "grid",
        gap: "1rem",
      }}
    >

      {/* VÄLILEHTINAPIT */}
      <div
        className="tab-buttons"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <TabButton
          id="weather"
          label={t("weatherTab", "Sää / Ennuste")}
        />
        <TabButton
          id="catch"
          label={t("catchTab", "Tallenna saalis")}
        />

        {isPro && (
  <>
    <TabButton
      id="history"
      label={t("historyTab", "Saalishistoria")}
    />
    <TabButton
      id="summary"
      label={t("summaryTab", "Yhteenveto")}
    />
    <TabButton
      id="stats"
      label={t("statsTab", "Tilastot")}
    />
  </>
)}

      </div>
      
      {!isPro && (
	  <div style={{ fontSize: 12, opacity: 0.75 }}>
	    🔒 Pro-versiossa: Saalishistoria, Yhteenveto ja Tilastot. Avaa Pro testikoodilla tai ostamalla.
	  </div>
	)}

      {/* TAB-SISÄLTÖ */}
      <div
        className="tab-content"
        style={{
          border: "1px solid #ccc",
          borderRadius: "12px",
          padding: "1rem",
          backgroundColor: "#fff",
          minHeight: "320px",
        }}
      >
        {/* 1. SÄÄ / ENNUSTE */}
        {activeTab === "weather" && (
          <div>
            <Weather />
          </div>
        )}

        {/* 2. TILASTOT */}
        {activeTab === "stats" && (
          <div>
            <StatsChart source="lake" metric="realized" />
          </div>
        )}

        {/* 3. TALLENNA SAALIS */}
        {activeTab === "catch" && (
          <div style={{ padding: "0.5rem" }}>
           <LakeSeaCatchForm
  	sessionDraft={session.draftCatch}
 	 sessionActive={session.activeSession}
  	activeTargetSpecies={session.activeSession?.targetSpecies}
 	 sessionKey={session.activeSession?.startedAt || session.activeSession?.id || null}
 	 onTargetNone={() => {}}
 	 onAfterSave={() => {}}
	/>

          </div>
        )}
       
        {/* 4. SAALISHISTORIA */}
        {activeTab === "history" && (
	  <div style={{ padding: "0.5rem" }}>
	    <div
	      style={{
	        display: "flex",
	        alignItems: "center",
	        justifyContent: "space-between",
	        gap: "0.75rem",
	        flexWrap: "wrap",
	        marginBottom: "0.75rem",
	      }}
	    >
       
    </div>    


    <SaalisHistoria mode="lake" speciesFilter={historySpecies} />
  </div>
)}

{targetOpen && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "1rem",
    }}
    onClick={() => setTargetOpen(false)}
  >
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: "1rem",
        width: "min(420px, 95vw)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
     <h3 style={{ marginTop: 0 }}>
  🎯 {t("session.chooseTarget", { defaultValue: "Valitse kohdekala!" })}
</h3>

<select
  value={targetSpecies}
  onChange={(e) => setTargetSpecies(e.target.value)}
  style={{ width: "100%", padding: "0.5rem", borderRadius: 8 }}
>
  <option value="">
    {t("common.select", { defaultValue: "Valitse" })}
  </option>
  {TARGET_SPECIES.map((s) => {
  const key = normalizeSpecies(s); // "Hauki" -> "pike"
  return (
    <option key={s} value={s}>
      {key ? t(`fish.${key}`, { defaultValue: s }) : s}
    </option>
  );
})}

</select>

<div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
  <button type="button" onClick={() => setTargetOpen(false)} style={{ flex: 1 }}>
    {t("common.cancel", { defaultValue: "Peru" })}
  </button>

  <button
    type="button"
    disabled={!targetSpecies}
    onClick={() => {
      setTargetOpen(false);
      session.start({ locationName: ctx.locationName, targetSpecies });
      showToast(
        t("session.targetSaved", {
          defaultValue: "Tavoitesaalis tallennettu — voit tallentaa muita saaliita.",
        })
      );
      setActiveTab("catch");
    }}
    style={{ flex: 1, fontWeight: 700 }}
  >
    {t("common.start", { defaultValue: "Aloita" })}
  </button>
</div>

<div style={{ marginTop: "0.5rem", opacity: 0.8, fontSize: "0.9rem" }}>
  {t("session.targetLocksSpecies", {
    defaultValue:
      "Kohdekala lukitaan kalalaji-valikkoon kunnes tallennat saaliin tai painat “Ei tavoitesaalista”.",
  })}
</div>

    </div>
  </div>
)}

{session.isActive && session.activeSession?.targetSpecies ? (
  <div style={{ marginTop: "0.35rem", opacity: 0.9 }}>
    🎯 {t("session.targetFish")}:{" "}
    <strong>
      {(() => {
        const key = normalizeSpecies(session.activeSession.targetSpecies);
        const fallback = session.activeSession.targetSpecies;
        return key ? t(`fish.${key}`, { defaultValue: fallback }) : fallback;
      })()}
    </strong>
  </div>
) : null}

        <StartFishingButton
	  isActive={session.isActive}
	  durationText={session.durationText}
	  onStart={() => {
	    setTargetSpecies("");      // optional: nollaa aina
	    setTargetOpen(true);       // ✅ avaa valinta
	  }}
	  onStop={() => session.stopToDraft()}
	/>

	<SessionMenu
  isActive={session.isActive}
  hasDraft={!!session.draftCatch}
  onStopFishing={() => {
    session.stopToDraft();
    setActiveTab("catch");
  }}
  onGoToCatchForm={() => setActiveTab("catch")}
  onRequestExit={() => {
    const res = session.requestExit();
    if (res.action !== "no_pending") setActiveTab("catch");
  }}
/>

        {/* 5. YHTEENVETO */}
        {activeTab === "summary" && (
          <div style={{ padding: "0.5rem" }}>
            <SaalisYhteenveto />
          </div>
        )}
      </div>
    </div>
  );
}

export default WeatherTabs;
