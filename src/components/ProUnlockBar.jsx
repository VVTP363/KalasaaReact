// src/components/ProUnlockBar.jsx
import React, { useMemo, useState } from "react";
import { useEntitlement } from "./EntitlementContext";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "../firebase";

export default function ProUnlockBar() {
  const { isPro, unlockWithCode, lockToFree, entitlement, user } = useEntitlement();
  const isLoggedIn = !!user?.uid;
  const [code, setCode] = useState("");
  const [msgKey, setMsgKey] = useState("");
  const [buying, setBuying] = useState(false);
  const { t, i18n } = useTranslation();

  const SHOW_BUY_BUTTON = true; // julkaisu: trial-only

  const createCheckoutSession = useMemo(() => {
    return httpsCallable(functions, "createCheckoutSession");
  }, []);

  const onBuy = async () => {
    try {
      setBuying(true);
      setMsgKey("proUnlock.redirectingToCheckout");

      if (!auth.currentUser) {
        setMsgKey("proUnlock.loginRequired");
        return;
      }

      // varmista että callable saa tuoreen tokenin
      await auth.currentUser.getIdToken(true);

      const res = await createCheckoutSession({
        locale: i18n.resolvedLanguage || i18n.language || "fi",
      });

      console.log("checkout response:", res?.data);

      if (res?.data?.alreadyPro) {
        setMsgKey("proUnlock.alreadyPro");
        return;
      }

      const url = res?.data?.url;
      if (!url) {
        setMsgKey("proUnlock.buyFailed");
        return;
      }

      window.location.assign(url);
    } catch (e) {
      console.error("createCheckoutSession failed", e);
      setMsgKey("proUnlock.buyFailed");
    } finally {
      setBuying(false);
    }
  };

  if (isPro) {
    return (
      <div
        style={{
          padding: "8px 12px",
          border: "1px solid #eee",
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        <div className="row">
          <strong>{t("proUnlock.activeTitle", { defaultValue: "✅ PRO käytössä" })}</strong>

          <span style={{ fontSize: 12, opacity: 0.75 }}>
            user: <b>{user?.email || "—"}</b>
          </span>

          <span style={{ opacity: 0.7, fontSize: 12 }}>
            {entitlement?.source
              ? (() => {
                  const lng = i18n.resolvedLanguage || i18n.language || "fi";
                  const tt = i18n.getFixedT(lng);

                  const srcRaw = String(entitlement.source || "").trim();
                  const srcKey = srcRaw.toLowerCase().replace(/[-\s]/g, "_");
                  const srcLabel = tt(`proSource.${srcKey}`, { defaultValue: srcRaw });

                  return tt("proUnlock.activeSource", {
                    source: srcLabel,
                    defaultValue: `(${srcLabel})`,
                  });
                })()
              : ""}
          </span>

          <button
            type="button"
            onClick={() => {
              lockToFree();
              setMsgKey("proUnlock.backToFreeMsg");
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            {t("proUnlock.backToFree", { defaultValue: "Palauta Free" })}
          </button>

          {msgKey ? <span style={{ fontSize: 12, opacity: 0.8 }}>{t(msgKey)}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        border: "1px solid #eee",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong>
          {t("proUnlock.lockedTitle", { defaultValue: "🔒 PRO-ominaisuudet lukittu" })}
        </strong>

        <span style={{ fontSize: 12, opacity: 0.75 }}>
          user: <b>{user?.email || "—"}</b>
        </span>

        {!isLoggedIn ? (
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {t("proUnlock.loginRequired", {
              defaultValue: "Kirjaudu sisään aloittaaksesi 7 päivän kokeilun.",
            })}
          </span>
        ) : (
          <>
            <input
              id="proCode"
              name="proCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("proUnlock.codePlaceholder", { defaultValue: "Syötä testikoodi" })}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}
            />

            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await unlockWithCode(code);
                  if (r.ok) setMsgKey("proUnlock.unlocked");
                  else if (r?.reason === "login_required") setMsgKey("proUnlock.loginRequired");
                  else setMsgKey("proUnlock.invalidCode");
                } catch (e) {
                  console.error("unlock failed", e);
                  setMsgKey("proUnlock.unlockFailed");
                }
              }}
              disabled={buying || !isLoggedIn || !code.trim()}
            >
              {t("proUnlock.unlockBtn", { defaultValue: "Avaa PRO" })}
            </button>

            {SHOW_BUY_BUTTON && isLoggedIn && (
              <button type="button" onClick={onBuy} disabled={buying}>
                {buying
                  ? t("proUnlock.buying", { defaultValue: "Ohjataan..." })
                  : t("proUnlock.buyBtn", { defaultValue: "Osta PRO" })}
              </button>
            )}
          </>
        )}

        {msgKey ? <span style={{ fontSize: 12, opacity: 0.8 }}>{t(msgKey)}</span> : null}
      </div>

      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
        <div style={{ fontWeight: 600 }}>
          {t("proBanner.trialEnded", { defaultValue: "🔒 PRO-ominaisuudet lukittu" })}
        </div>

        <div style={{ marginTop: 6 }}>
          {t("proBanner.missingFeatures", { defaultValue: "Ilman PRO:ta et näe:" })}
        </div>

        <div style={{ marginTop: 4, opacity: 0.85 }}>
          • {t("tabs.history", { defaultValue: "Saalishistoria" })}<br />
          • {t("tabs.summary", { defaultValue: "Yhteenveto" })}<br />
          • {t("tabs.stats", { defaultValue: "Tilastot" })}
        </div>

        <div style={{ marginTop: 8, opacity: 0.9 }}>
          {t("proBanner.benefit", { defaultValue: "⭐ PRO auttaa löytämään parhaat ottiajat" })}
        </div>
      </div>
    </div>
  );
}