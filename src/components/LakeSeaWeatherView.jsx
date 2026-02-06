import React from "react";
import { useTranslation } from "react-i18next";

const renderImageFishIcons = (count) => {
  const icons = [];
  for (let i = 0; i < count; i++) {
    icons.push(
      <img
        key={i}
        src="/icons/bluefish.png"
        alt="fish"
        style={{ width: "28px", height: "28px", marginRight: "4px" }}
      />
    );
  }
  return icons;
};

const getMoonSymbol = (phase) => {
  switch (phase) {
    case "new-moon": return "🌑";
    case "waxing-crescent": return "🌒";
    case "first-quarter": return "🌓";
    case "waxing-gibbous": return "🌔";
    case "full-moon": return "🌕";
    case "waning-gibbous": return "🌖";
    case "last-quarter": return "🌗";
    case "waning-crescent": return "🌘";
    default: return "🌙";
  }
};

const LakeSeaWeatherView = ({
  moonPhaseKey,
  fishingPrediction,
  locationName,
  latitude,
  longitude,
  currentPressure,
  compassDir,
  windDeg
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginTop: "1em" }}>
      <p>📍 {locationName} ({latitude?.toFixed(4)}, {longitude?.toFixed(4)})</p>
      <p>📈 {t("pressure")}: {currentPressure} hPa</p>
      <p>💨 {t("windDirection")}: {compassDir} ({windDeg}°)</p>
      <p>🌙 {getMoonSymbol(moonPhaseKey)} {t(`moonPhaseNames.${moonPhaseKey}`, moonPhaseKey)}</p>

      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ marginRight: "8px" }}>🌿 {t("fishingInterest")}:</span>
        {renderImageFishIcons(fishingPrediction)}
        <span style={{ marginLeft: "8px" }}>{fishingPrediction}/8</span>
      </div>
    </div>
  );
};

export default LakeSeaWeatherView;
