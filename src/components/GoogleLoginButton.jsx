import React, { useEffect, useMemo, useState } from "react";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useTranslation } from "react-i18next";

function mapAuthErrorToMessage(err, t) {
  const code = String(err?.code || "");

  if (code === "auth/popup-closed-by-user") {
    return t("auth.popupClosed", {
      defaultValue: "Kirjautumisikkuna suljettiin ennen kirjautumista.",
    });
  }

  if (code === "auth/popup-blocked") {
    return t("auth.popupBlocked", {
      defaultValue: "Selain esti kirjautumisikkunan. Yritetään uudelleenohjausta.",
    });
  }

  if (code === "auth/cancelled-popup-request") {
    return t("auth.popupCancelled", {
      defaultValue: "Kirjautumisyritys keskeytyi.",
    });
  }

  if (code === "auth/network-request-failed") {
    return t("auth.networkFailed", {
      defaultValue: "Verkkovirhe kirjautumisessa.",
    });
  }

  if (code === "auth/unauthorized-domain") {
    return t("auth.unauthorizedDomain", {
      defaultValue: "Tätä verkkotunnusta ei ole sallittu kirjautumiseen.",
    });
  }

  if (code === "auth/operation-not-allowed") {
    return t("auth.operationNotAllowed", {
      defaultValue: "Google-kirjautuminen ei ole käytössä Firebase-asetuksissa.",
    });
  }

  return t("auth.loginFailed", {
    defaultValue: "Google-kirjautuminen epäonnistui.",
  });
}

export default function GoogleLoginButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const isMobileLike = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth < 900;
  }, []);

  useEffect(() => {
    let mounted = true;

    getRedirectResult(auth)
      .then((result) => {
        if (!mounted) return;

        if (result?.user) {
          console.log("[AUTH] redirect ok:", result.user.email);
          setInfo(
            t("auth.loginSuccess", {
              defaultValue: "Kirjautuminen onnistui.",
            })
          );
          setError("");
        } else {
          console.log("[AUTH] no redirect result");
        }
      })
      .catch((err) => {
        if (!mounted) return;

        console.error("[AUTH] redirect result failed:", err);
        console.error("[AUTH] code:", err?.code);
        console.error("[AUTH] message:", err?.message);

        setError(mapAuthErrorToMessage(err, t));
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });

    return () => {
      mounted = false;
    };
  }, [t]);

  const loginWithRedirectOnly = async () => {
    setBusy(true);
    setError("");
    setInfo(
      t("auth.redirecting", {
        defaultValue: "Ohjataan Google-kirjautumiseen...",
      })
    );

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("[AUTH] signInWithRedirect failed:", err);
      console.error("[AUTH] code:", err?.code);
      console.error("[AUTH] message:", err?.message);

      setInfo("");
      setError(mapAuthErrorToMessage(err, t));
      setBusy(false);
    }
  };

  const loginWithPopupThenRedirectFallback = async () => {
    setBusy(true);
    setError("");
    setInfo("");

    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("[AUTH] popup ok:", result?.user?.email || null);

      setInfo(
        t("auth.loginSuccess", {
          defaultValue: "Kirjautuminen onnistui.",
        })
      );
      setBusy(false);
      return;
    } catch (err) {
      console.error("[AUTH] signInWithPopup failed:", err);
      console.error("[AUTH] code:", err?.code);
      console.error("[AUTH] message:", err?.message);

      const code = String(err?.code || "");

      const shouldFallbackToRedirect =
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/internal-error";

      if (shouldFallbackToRedirect || isMobileLike) {
        setInfo(
          t("auth.redirecting", {
            defaultValue: "Ohjataan Google-kirjautumiseen...",
          })
        );

        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.error("[AUTH] redirect fallback failed:", redirectErr);
          console.error("[AUTH] code:", redirectErr?.code);
          console.error("[AUTH] message:", redirectErr?.message);

          setInfo("");
          setError(mapAuthErrorToMessage(redirectErr, t));
          setBusy(false);
          return;
        }
      }

      setError(mapAuthErrorToMessage(err, t));
      setBusy(false);
    }
  };

  const onLoginClick = async () => {
    if (busy) return;

    if (isMobileLike) {
      await loginWithRedirectOnly();
      return;
    }

    await loginWithPopupThenRedirectFallback();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={onLoginClick}
        disabled={busy}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #ccc",
          cursor: busy ? "default" : "pointer",
          background: "#fff",
        }}
      >
        {busy
          ? t("auth.loggingIn", { defaultValue: "Kirjaudutaan..." })
          : t("auth.loginGoogle", { defaultValue: "Kirjaudu (Google)" })}
      </button>

      {info ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {info}
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 12, color: "#b00020" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}