// src/components/ProUnlockBar.jsx
import React, { useState } from "react";
import { useEntitlement } from "./EntitlementContext";
import { useTranslation } from "react-i18next";

export default function ProUnlockBar() {
  const { isPro, unlockWithCode, lockToFree, entitlement } = useEntitlement();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const { t } = useTranslation();

  if (isPro) {
    return (
      <div style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, marginBottom: 10 }}>
        <div className="row">
          <strong>{t("proUnlock.activeTitle", { defaultValue: "✅ PRO käytössä" })}</strong>

          <span style={{ opacity: 0.7, fontSize: 12 }}>
	  {entitlement?.source
	    ? t("proUnlock.activeSource", {
	        source: t(`proSource.${entitlement.source}`, {
	          defaultValue: entitlement.source,
	        }),
	        defaultValue: `(${entitlement.source})`,
	      })
	    : ""}
	</span>

          <button
            onClick={() => {
              lockToFree();
              setMsg(t("proUnlock.backToFreeMsg", { defaultValue: "Palautettu Free-tilaan." }));
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {t("proUnlock.backToFree", { defaultValue: "Palauta Free" })}
          </button>

          {msg ? <span style={{ fontSize: 12, opacity: 0.8 }}>{msg}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{t("proUnlock.lockedTitle", { defaultValue: "🔒 PRO-ominaisuudet lukittu" })}</strong>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("proUnlock.codePlaceholder", { defaultValue: "Syötä testikoodi" })}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}
        />

        <button
	  onClick={async () => {
	    const r = await unlockWithCode(code);
	    if (r.ok) setMsg(t("proUnlock.unlocked", { defaultValue: "PRO avattu tälle laitteelle." }));
	    else setMsg(t("proUnlock.invalidCode", { defaultValue: "Väärä testikoodi." }));
	  }}
	>
  {t("proUnlock.unlockBtn", { defaultValue: "Avaa PRO" })}
</button>


        {/* myöhemmin tähän Stripe-nappi */}
        {/* <button>{t("proUnlock.buyBtn", { defaultValue: "Osta PRO" })}</button> */}

        {msg ? <span style={{ fontSize: 12, opacity: 0.8 }}>{msg}</span> : null}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {t("proUnlock.freeInfo", {
          defaultValue:
            "Free-versiossa näkyy vain Sää/Ennuste + Saalisilmoitus. Pro avaa Virtavedet ja muut sivut.",
        })}
      </div>
    </div>
  );
}
