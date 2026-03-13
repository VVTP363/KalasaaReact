// src/components/ProInfoPage.jsx
import React from "react";
import { useTranslation } from "react-i18next";

export default function ProInfoPage({ onBuy, onContinueFree, isBuying = false }) {
  const { t } = useTranslation();

  const proFeatures = t("proPage.proFeatures", { returnObjects: true }) || [];
  const freeFeatures = t("proPage.freeFeatures", { returnObjects: true }) || [];

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "1.25rem",
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "1.25rem",
          background: "#fff",
          boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: "0.95rem", opacity: 0.8, marginBottom: 8 }}>
          {t("proPage.badge", "KalasääApp PRO")}
        </div>

        <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.9rem" }}>
          {t("proPage.title", "Kalasta oikeaan aikaan.")}
        </h1>

        <p style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", opacity: 0.9 }}>
          {t(
            "proPage.lead",
            "KalasääApp PRO yhdistää säädatan, ilmanpaineen, kuun vaiheen ja tuulensuunnan kalojen ottihalukkuusennusteeksi."
          )}
        </p>

        <div
          style={{
            padding: "0.9rem 1rem",
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            marginBottom: "1.25rem",
          }}
        >
          <strong>{t("proPage.trialTitle", "7 päivän täysi kokeilu")}</strong>
          <p style={{ margin: "0.35rem 0 0 0" }}>
            {t(
              "proPage.trialText",
              "Kokeile kaikkia PRO-ominaisuuksia 7 päivän ajan. Kokeilun jälkeen voit jatkaa FREE-versiona tai avata PRO-version käyttöösi."
            )}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: "1rem",
              background: "#fcfcfc",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
              {t("proPage.proHeading", "PRO sisältää")}
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {proFeatures.map((item, idx) => (
                <li key={idx} style={{ marginBottom: "0.45rem" }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: "1rem",
              background: "#fcfcfc",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
              {t("proPage.freeHeading", "FREE sisältää")}
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {freeFeatures.map((item, idx) => (
                <li key={idx} style={{ marginBottom: "0.45rem" }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          style={{
            padding: "1rem",
            borderRadius: 12,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            marginBottom: "1rem",
          }}
        >
          <strong>{t("proPage.valueTitle", "Kenelle PRO sopii?")}</strong>
          <p style={{ margin: "0.35rem 0 0 0" }}>
            {t(
              "proPage.valueText",
              "PRO sopii aktiiviselle kalastajalle, joka haluaa hyödyntää säätä, paikkatietoa ja saalishistoriaa kalastuksen suunnittelussa."
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onBuy}
            disabled={isBuying}
            style={{
              padding: "0.8rem 1.2rem",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {isBuying
              ? t("proPage.buyLoading", "Ohjataan maksamaan...")
              : t("proPage.buyButton", "Avaa PRO")}
          </button>

          <button
            type="button"
            onClick={onContinueFree}
            style={{
              padding: "0.8rem 1.2rem",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("proPage.continueFreeButton", "Jatka FREE-versiona")}
          </button>
        </div>
      </div>
    </div>
  );
}