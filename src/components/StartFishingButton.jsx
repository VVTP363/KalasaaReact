import React from "react";
import { useTranslation } from "react-i18next";

function StartFishingButton({ isActive, durationText, onStart, onStop }) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      {!isActive ? (
        <button
          type="button"
          onClick={onStart}
          style={{
            padding: "0.5rem 0.9rem",
            borderRadius: "10px",
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          ▶️ {t("session.startFishing", { defaultValue: "Aloita kalastus" })}
        </button>
      ) : (
        <button
          type="button"
          onClick={onStop}
          style={{
            padding: "0.5rem 0.9rem",
            borderRadius: "10px",
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          ⏹ {t("session.stopFishing", { defaultValue: "Lopeta kalastus" })}
        </button>
      )}

      {isActive ? (
        <span style={{ fontSize: "0.95rem", opacity: 0.85 }}>
          ⏱ {durationText || ""}
        </span>
      ) : null}
    </div>
  );
}

export default StartFishingButton;
