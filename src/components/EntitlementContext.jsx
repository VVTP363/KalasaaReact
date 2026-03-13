// src/components/EntitlementContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";

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

function toMsMaybe(v) {
  if (v == null) return null;

  // Firestore Timestamp
  if (typeof v === "object") {
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isProTier(tier) {
  const t = String(tier || "free").toLowerCase();
  return ["pro_trial", "pro", "pro_paid", "pro_permanent"].includes(t);
}

function normalizeEntitlement(raw, fallbackSource = "firebase") {
  const tier =
    raw?.tier ||
    raw?.taso ||
    "free";

  const source =
    raw?.source ||
    raw?.lähde ||
    fallbackSource;

  const expiresAtMs =
    toMsMaybe(raw?.expiresAtMs) ??
    toMsMaybe(raw?.expiresAt) ??
    toMsMaybe(raw?.vanheneeKlo);

  const expired = expiresAtMs != null && Date.now() > expiresAtMs;

  if (expired) {
    return {
      ...raw,
      tier: "free",
      source,
      unlockedAt: raw?.unlockedAt || raw?.lukitsematon || null,
      expiresAtMs,
      expired: true,
    };
  }

  return {
    ...raw,
    tier,
    source,
    unlockedAt: raw?.unlockedAt || raw?.lukitsematon || null,
    expiresAtMs: expiresAtMs ?? null,
    expired: false,
  };
}

function loadLocalEntitlement() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = safeJsonParse(raw);
  if (!obj) return { tier: "free", source: "local", expired: false };

  const normalized = normalizeEntitlement(obj, "local");

  // ✅ JULKAISU: ei local PRO:ta ilman kirjautumista
  if (isProTier(normalized?.tier)) {
    return { tier: "free", source: "local_blocked", expired: false, expiresAtMs: null };
  }

  return normalized;
}

function saveLocalEntitlement(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function dbRunTransactionSafe(fn) {
  return runTransaction(db, fn);
}

const EntitlementContext = createContext(null);

export function EntitlementProvider({ children }) {
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [user, setUser] = useState(null);

  // ent = “lähin totuus”: kirjautuneella Firestore, muuten localStorage
  const [ent, setEnt] = useState(() => loadLocalEntitlement());

  const syncEntitlement = useMemo(
    () => httpsCallable(functions, "syncEntitlement"),
    []
  );

  // Auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsubAuth();
  }, []);

  // 🔒 Pyydetään serveriltä “totuus” kirjautumisen jälkeen
  useEffect(() => {
    if (!user?.uid) return;

    (async () => {
      try {
        console.log("Calling syncEntitlement...");
        const res = await syncEntitlement({});
        console.log("syncEntitlement OK:", res?.data);

        if (res?.data?.ok) {
          const normalized = normalizeEntitlement(res.data, "firebase");
          setEnt(normalized);
          saveLocalEntitlement(normalized);
        }
      } catch (e) {
        console.log("syncEntitlement FAILED:", e?.code, e?.message, e);
      }
    })();
  }, [user?.uid, syncEntitlement]);

  // ✅ UUSI: jos laitteella on local PRO ja käyttäjä kirjautuu sisään,
  // siirretään PRO käyttäjätilille (Pro = käyttäjätili kaikilla laitteilla)
  useEffect(() => {
    if (!user?.uid) return;

    const local = loadLocalEntitlement();
    const localIsPro = isProTier(local?.tier) && !local?.expired;
    if (!localIsPro) return;

    (async () => {
      try {
        const ref = doc(db, "entitlements", user.uid);

        await dbRunTransactionSafe(async (tx) => {
          const snap = await tx.get(ref);
          const cur = snap.exists() ? snap.data() || {} : {};

          // 1) Älä yliaja ostettua/pysyvää
          const curTier = String(cur.tier || "free").toLowerCase();
          if (curTier === "pro_paid" || curTier === "pro_permanent") return;

          const hasExpiry = local.expiresAtMs != null;
          const nextTier = hasExpiry ? "pro_trial" : "pro_permanent";

          tx.set(
            ref,
            {
              tier: nextTier,
              source: "local_migrate",
              unlockedAt: local.unlockedAt || Date.now(),
              ...(hasExpiry
                ? { expiresAt: Timestamp.fromMillis(Number(local.expiresAtMs)) }
                : {}),
              updatedAt: serverTimestamp(),
              meta: { migratedFromDevice: true, deviceId },
            },
            { merge: true }
          );
        });

        // Tyhjennä local, ettei jää kummittelemaan
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.log("local->account migrate FAILED:", e?.code, e?.message, e);
      }
    })();
  }, [user?.uid, deviceId]);

  // Entitlement data source: localStorage (logged out) / Firestore (logged in)
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
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          const normalized = normalizeEntitlement(data, "firebase");
          setEnt(normalized);

          // ✅ Jos tier on pro* ja se on vanhentunut → siivoa
          if (isProTier(data?.tier) && normalized.expired) {
            try {
              await setDoc(
                ref,
                { tier: "free", source: "firebase", updatedAt: serverTimestamp() },
                { merge: true }
              );
            } catch {
              // ignore
            }
          }
        } else {
          setEnt({ tier: "free", source: "firebase", expired: false, expiresAtMs: null });
        }
      },
      () => {
        // jos Firestore ei tavoita → fallback local
        setEnt(loadLocalEntitlement());
      }
    );

    return () => unsub();
  }, [user?.uid]);

  const isPro = !!user?.uid && isProTier(ent?.tier) && !ent?.expired;

  // ✅ grantPro (permanent by default)
  // opts: { expiresAtMs?: number|null, meta?: object }
  async function grantPro(source = "manual_code", opts = {}) {
    const expiresAtMs = opts?.expiresAtMs == null ? null : Number(opts.expiresAtMs);
    const hasExpiry = Number.isFinite(expiresAtMs);

    const payload = {
      tier: hasExpiry ? "pro_trial" : "pro_permanent",
      source,
      unlockedAt: Date.now(),
      ...(hasExpiry ? { expiresAt: Timestamp.fromMillis(expiresAtMs) } : {}),
      updatedAt: serverTimestamp(),
      ...(opts?.meta ? { meta: opts.meta } : {}),
    };

    if (user?.uid) {
      const ref = doc(db, "entitlements", user.uid);
      await setDoc(ref, payload, { merge: true });
      return { ok: true };
    }

    const localPayload = {
      tier: hasExpiry ? "pro_trial" : "pro_permanent",
      source,
      deviceId,
      unlockedAt: Date.now(),
      ...(hasExpiry ? { expiresAtMs } : {}),
      ...(opts?.meta ? { meta: opts.meta } : {}),
    };

    const normalized = normalizeEntitlement(localPayload, "local");
    saveLocalEntitlement(normalized);
    setEnt(normalized);
    return { ok: true };
  }

  // ✅ Testikoodi (PERMANENT)
  async function unlockWithCode(codeRaw) {
    if (!user?.uid) return { ok: false, reason: "login_required" };

    const code = String(codeRaw || "").trim().toUpperCase();
    const ok = TEST_CODES.has(code);
    if (!ok) return { ok: false, reason: "invalid_code" };

    await grantPro("manual_code", { meta: { codeUsed: code } });
    return { ok: true };
  }

  async function forceSyncEntitlement() {
    if (!user?.uid) return { ok: false, reason: "not_logged_in" };

    const res = await syncEntitlement({});
    if (res?.data?.ok) {
      const normalized = normalizeEntitlement(res.data, "firebase");
      setEnt(normalized);
      saveLocalEntitlement(normalized);
      return { ok: true, entitlement: normalized };
    }

    return { ok: false, reason: "sync_failed", data: res?.data };
  }

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

    saveLocalEntitlement({ tier: "free", source: "local", expired: false, expiresAtMs: null });
    setEnt({ tier: "free", source: "local", expired: false, expiresAtMs: null });
  }

  const value = useMemo(
    () => ({
      deviceId,
      user,
      entitlement: ent,
      isPro,
      forceSyncEntitlement,
      unlockWithCode,
      grantPro,
      lockToFree,
    }),
    [deviceId, user, ent, isPro]
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}