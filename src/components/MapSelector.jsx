import React from "react";
import { useTranslation } from "react-i18next";

const MapSelector = () => {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", gap: "1em", marginBottom: "1em" }}>
      <button>
        🗺️ {t("openOskari")} <span>({t("openOskariNote")})</span>
      </button>
      <button>
        🗺️ {t("openKarttaselain")} <span>({t("openKarttaselainNote")})</span>
      </button>
    </div>
  );
};

export default MapSelector;
