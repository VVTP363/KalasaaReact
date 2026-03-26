import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useTranslation } from "react-i18next";
import AdminProGrantPanel from "./AdminProGrantPanel";

export default function AuthBar() {
  const [user, setUser] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      console.log("[AUTH] state changed:", nextUser ? nextUser.email : "no user");
      setUser(nextUser);
    });

    return () => unsub();
  }, []);

  const login = async () => {
    if (busy) return;

    setBusy(true);
    setErr("");

    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("[AUTH] popup ok:", result?.user?.email || null);
    } catch (e) {
      console.error("[AUTH] signInWithPopup error:", e);
      console.error("[AUTH] code:", e?.code);
      console.error("[AUTH] message:", e?.message);
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (busy) return;

    setBusy(true);
    setErr("");

    try {
      await signOut(auth);
      console.log("[AUTH] signed out");
    } catch (e) {
      console.error("[AUTH] signOut error:", e);
      setErr(e?.message || "Logout failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div
        className="row"
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
      >
        <button
          type="button"
          onClick={login}
          disabled={busy}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            cursor: busy ? "default" : "pointer",
            background: "#fff",
          }}
        >
          {busy
            ? t("auth.loggingIn", { defaultValue: "Kirjaudutaan..." })
            : t("auth.loginGoogle", { defaultValue: "Kirjaudu Googlella" })}
        </button>

        {err ? (
          <span style={{ fontSize: 12, color: "#b00020" }}>{err}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          ✅ {user.displayName || user.email}
        </span>

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            cursor: busy ? "default" : "pointer",
            background: "#fff",
          }}
        >
          {busy
            ? t("auth.loggingOut", { defaultValue: "Kirjaudutaan ulos..." })
            : t("auth.logout", { defaultValue: "Kirjaudu ulos" })}
        </button>

        {err ? (
          <span style={{ fontSize: 12, color: "#b00020" }}>{err}</span>
        ) : null}
      </div>

      <AdminProGrantPanel />
    </div>
  );
}