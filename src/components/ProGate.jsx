import React from "react";
import { useEntitlement } from "./EntitlementContext";
import { useTranslation } from "react-i18next";
import ProUnlockBar from "./ProUnlockBar";

function isProTier(ent) {
  const tier = ent?.tier || "free";
  const expired = ent?.expired === true;
  if (expired) return false;
  return ["pro", "pro_paid", "pro_permanent", "pro_trial"].includes(tier);
}

export default function ProGate({
  children,
  fallback = null,
  showUnlockBar = true,
  infoKey = "proUnlock.proInfo",
  titleKey = "proUnlock.proTitle",
  lockedPreview = null,     // esim. <StatsChart .../> tai placeholder
  blur = true,             // blurraako preview
  boxed = true,            // korttimainen wrapper
}) {
  const entCtx = useEntitlement();
  const { t } = useTranslation();

  const pro = entCtx?.isPro ?? isProTier(entCtx?.entitlement); // tukee molempia tapoja

  if (pro) return <>{children}</>;

  const content = (
    <>
      {showUnlockBar ? (
        <div id="pro-unlock">
          <ProUnlockBar />
        </div>
      ) : null}

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {/* title vapaaehtoinen */}
        {t(titleKey, { defaultValue: "Pro-ominaisuus" })}
        {" — "}
        {t(infoKey, { defaultValue: "Avaa Pro käyttääksesi tämän sisällön." })}
      </div>

      {/* Optional preview */}
      {lockedPreview ? (
        <div
          style={{
            marginTop: 10,
            border: "1px dashed #ddd",
            borderRadius: 12,
            padding: 10,
            opacity: 0.9,
            filter: blur ? "blur(6px)" : "none",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {lockedPreview}
        </div>
      ) : null}

      {fallback}
    </>
  );

  if (!boxed) return content;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      {content}
    </div>
  );
}
