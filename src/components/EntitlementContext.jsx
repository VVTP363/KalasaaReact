// src/components/EntitlementContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const STORAGE_KEY = "kalasaa_entitlement_v1";
const DEVICE_KEY = "kalasaa_device_id_v1";

// ✅ Testikoodit (vaihda / lisää tarpeen mukaan)
const TEST_CODES = new Set([
  "KALASAA-PRO-TEST-001",
  "KALASAA-PRO-TEST-002",
  "KALASAA-PRO-TEST-003",
]);

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
      .toString(16)
      .slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function loadLocalEntitlement() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = safeJsonParse(raw);
  if (!obj) return { tier: "free" };

  if (obj.expiresAt) {
    const exp = Number(obj.expiresAt);
    if (Number.isFinite(exp) && Date.now() > exp) return { tier: "free" };
  }
  return obj;
}

function saveLocalEntitlement(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

const EntitlementContext = createContext(null);

export function EntitlementProvider({ children }) {
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [user, setUser] = useState(null);

  // ent = “lähin totuus”: kirjautuneella Firestore, muuten localStorage
  const [ent, setEnt] = useState(() => loadLocalEntitlement());

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    // Jos ei käyttäjää → localStorage ent
    if (!user?.uid) {
      setEnt(loadLocalEntitlement());

      const onStorage = (e) => {
        if (e.key === STORAGE_KEY) setEnt(loadLocalEntitlement());
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    // Käyttäjä sisällä → kuuntele Firestore entitlement
    const ref = doc(db, "entitlements", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          setEnt({
            tier: data.tier || "free",
            source: data.source || "firebase",
            unlockedAt: data.unlockedAt || null,
            expiresAt: data.expiresAt || null,
          });
        } else {
          setEnt({ tier: "free", source: "firebase" });
        }
      },
      () => {
        // jos Firestore ei tavoita → fallback local
        setEnt(loadLocalEntitlement());
      }
    );

    return () => unsub();
  }, [user?.uid]);

  const isPro = ent?.tier === "pro";

  // ✅ Testikoodi:
  // - jos kirjautunut: PRO käyttäjätilille Firestoreen
  // - jos ei kirjautunut: PRO laitteelle localStorageen (kuten ennen)
  async function unlockWithCode(codeRaw) {
    const code = String(codeRaw || "").trim().toUpperCase();
    const ok = TEST_CODES.has(code);
    if (!ok) return { ok: false, reason: "invalid_code" };

    // 7 päivää testiin:
    const expiresAt = Date.now() + 7 * 24 * 3600 * 1000;

    if (user?.uid) {
      const ref = doc(db, "entitlements", user.uid);
      await setDoc(
        ref,
        {
          tier: "pro",
          source: "manual_code",
          unlockedAt: Date.now(),
          expiresAt,
          codeUsed: code,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { ok: true };
    }

    const payload = {
      tier: "pro",
      source: "manual_code",
      deviceId,
      unlockedAt: Date.now(),
      expiresAt,
      codeUsed: code,
    };

    saveLocalEntitlement(payload);
    setEnt(payload);
    return { ok: true };
  }

  // Paluu free:
  async function lockToFree() {
    if (user?.uid) {
      const ref = doc(db, "entitlements", user.uid);
      await setDoc(
        ref,
        { tier: "free", source: "firebase", updatedAt: serverTimestamp() },
        { merge: true }
      );
      return;
    }
    saveLocalEntitlement({ tier: "free" });
    setEnt({ tier: "free" });
  }

  const value = useMemo(
    () => ({
      deviceId,
      user,
      entitlement: ent,
      isPro,
      unlockWithCode,
      lockToFree,
    }),
    [deviceId, user, ent, isPro]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}
