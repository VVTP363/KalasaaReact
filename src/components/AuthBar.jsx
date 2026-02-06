import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useTranslation } from "react-i18next";

export default function AuthBar() {
  const [user, setUser] = useState(null);
  const [err, setErr] = useState("");
  const { t } = useTranslation();

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const login = async () => {
    setErr("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("[Auth] signIn error:", e);
      setErr(e?.message || "Login failed");
    }
  };

  const logout = async () => {
    setErr("");
    try {
      await signOut(auth);
    } catch (e) {
      console.error("[Auth] signOut error:", e);
      setErr(e?.message || "Logout failed");
    }
  };

  if (!user) {
    return (
      <div className="row">
        <button
          onClick={login}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          {t("auth.loginGoogle")}
        </button>
        {err ? <span style={{ fontSize: 12, color: "#b00020" }}>{err}</span> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        ✅ {user.displayName || user.email}
      </span>
      <button
        onClick={logout}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #ddd",
          cursor: "pointer",
          background: "#fff",
        }}
      >
        {t("auth.logout")}
      </button>
      {err ? <span style={{ fontSize: 12, color: "#b00020" }}>{err}</span> : null}
    </div>
  );
}
