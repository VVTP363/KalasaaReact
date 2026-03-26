// src/components/EntitlementContext.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import { computeAccess } from "../utils/accessConfig";

const EntitlementContext = createContext(null);

const LOCAL_KEY = "kalasaa_entitlement_v1";
const DEVICE_KEY = "kalasaa_device_id_v1";

function makeDeviceId() {
  return `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const next = makeDeviceId();
    localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return makeDeviceId();
  }
}

function tsToMs(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}

function isProTier(tier) {
  const t = String(tier || "free").toLowerCase();
  return (
    t === "pro" ||
    t === "pro_trial" ||
    t === "pro_paid" ||
    t === "pro_permanent"
  );
}

function isExpiredMs(expiresAtMs) {
  if (!expiresAtMs) return false;
  return Date.now() > Number(expiresAtMs);
}

function normalizeEntitlement(raw, fallbackSource = "local") {
  const tier = String(raw?.tier || "free").toLowerCase();
  const expiresAtMs = raw?.expiresAtMs ?? tsToMs(raw?.expiresAt) ?? null;
  const expired = isExpiredMs(expiresAtMs);

  return {
    ok: raw?.ok !== false,
    tier,
    source: raw?.source || fallbackSource,
    expiresAtMs,
    expired,
    unlockedAt:
      typeof raw?.unlockedAt === "number"
        ? raw.unlockedAt
        : tsToMs(raw?.unlockedAt) ?? Date.now(),
    updatedAtMs:
      tsToMs(raw?.updatedAt) ??
      (typeof raw?.updatedAtMs === "number" ? raw.updatedAtMs : Date.now()),
    meta: raw?.meta || {},
  };
}

function loadLocalEntitlement() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return normalizeEntitlement(JSON.parse(raw), "local");
  } catch {
    return null;
  }
}

function saveLocalEntitlement(ent) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ent));
  } catch {
    // ignore
  }
}

function clearLocalEntitlement() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}

function freeEntitlement(source = "local") {
  return {
    ok: true,
    tier: "free",
    source,
    expiresAtMs: null,
    expired: false,
    unlockedAt: Date.now(),
    updatedAtMs: Date.now(),
    meta: {},
  };
}

export function EntitlementProvider({ children }) {
  const [deviceId] = useState(() => getDeviceId());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [entitlementLoading, setEntitlementLoading] = useState(true);

  const [ent, setEnt] = useState(() => {
    return loadLocalEntitlement() || freeEntitlement("local");
  });

  const [access, setAccess] = useState({
    pro: false,
    isAdmin: false,
    claims: {},
    ent: null,
  });

  const lastSyncedUidRef = useRef(null);
  const syncInFlightRef = useRef(false);

  const isPro = useMemo(() => {
    const entitlementPro = isProTier(ent?.tier) && !ent?.expired;
    return !!access?.pro || entitlementPro;
  }, [ent, access]);

  const refreshFromFirestore = useCallback(async (currentUser) => {
    if (!currentUser?.uid) {
      const localEnt = loadLocalEntitlement() || freeEntitlement("local");
      setEnt(localEnt);
      setAccess({
        pro: false,
        isAdmin: false,
        claims: {},
        ent: null,
      });
      setEntitlementLoading(false);
      return {
        ok: true,
        entitlement: localEnt,
        access: { pro: false, isAdmin: false, claims: {}, ent: null },
      };
    }

    try {
      setEntitlementLoading(true);

      const nextAccess = await computeAccess({ user: currentUser });
      setAccess(nextAccess || { pro: false, isAdmin: false, claims: {}, ent: null });

      const rawEnt = nextAccess?.ent || null;

      if (rawEnt) {
        const normalized = normalizeEntitlement(rawEnt, "firebase");
        setEnt(normalized);
        saveLocalEntitlement(normalized);
        lastSyncedUidRef.current = currentUser.uid;
        return { ok: true, entitlement: normalized, access: nextAccess };
      }

      const freeEnt = normalizeEntitlement(
        { tier: "free", source: "firebase", expiresAtMs: null },
        "firebase"
      );
      setEnt(freeEnt);
      saveLocalEntitlement(freeEnt);
      lastSyncedUidRef.current = currentUser.uid;
      return { ok: true, entitlement: freeEnt, access: nextAccess };
    } catch (err) {
      console.error("[EntitlementContext] refreshFromFirestore failed", err);

      const fallback = loadLocalEntitlement() || freeEntitlement("local");
      setEnt(fallback);
      setAccess({
        pro: false,
        isAdmin: false,
        claims: {},
        ent: null,
      });
      return { ok: false, error: err, entitlement: fallback };
    } finally {
      setEntitlementLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubEnt = null;

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser || null);
      setAuthReady(true);

      if (!nextUser?.uid) {
        if (unsubEnt) unsubEnt();
        unsubEnt = null;

        const localEnt = loadLocalEntitlement() || freeEntitlement("local");
        setEnt(localEnt);
        setAccess({
          pro: false,
          isAdmin: false,
          claims: {},
          ent: null,
        });
        setEntitlementLoading(false);
        return;
      }

      await refreshFromFirestore(nextUser);

      const ref = doc(db, "entitlements", nextUser.uid);
      if (unsubEnt) unsubEnt();

      unsubEnt = onSnapshot(
        ref,
        async (snap) => {
          try {
            const nextAccess = await computeAccess({ user: nextUser });
            setAccess(nextAccess || { pro: false, isAdmin: false, claims: {}, ent: null });

            if (!snap.exists()) {
              const freeEnt = normalizeEntitlement(
                { tier: "free", source: "firebase", expiresAtMs: null },
                "firebase"
              );
              console.log("[ENT] snapshot -> no doc, using free entitlement but access may still be pro/admin");
              setEnt(freeEnt);
              saveLocalEntitlement(freeEnt);
              return;
            }

            const raw = snap.data() || {};
            const normalized = normalizeEntitlement(raw, "firebase");

            console.log("[ENT] snapshot raw:", raw);
            console.log("[ENT] snapshot normalized:", normalized);
            console.log("[ENT] snapshot access:", nextAccess);

            setEnt(normalized);
            saveLocalEntitlement(normalized);
          } catch (err) {
            console.error("[EntitlementContext] snapshot access refresh failed", err);
          }
        },
        (err) => {
          console.error("[EntitlementContext] entitlement snapshot failed", err);
        }
      );
    });

    return () => {
      if (unsubEnt) unsubEnt();
      unsubAuth();
    };
  }, [refreshFromFirestore]);

  const forceSyncEntitlement = useCallback(async () => {
    if (!user?.uid) return { ok: false, reason: "not_logged_in" };
    if (syncInFlightRef.current) return { ok: false, reason: "sync_in_flight" };

    syncInFlightRef.current = true;

    try {
      const syncEntitlement = httpsCallable(functions, "syncEntitlement");
      const res = await syncEntitlement({});

      if (res?.data?.ok) {
        const normalized = normalizeEntitlement(res.data, "firebase");
        setEnt(normalized);
        saveLocalEntitlement(normalized);
        lastSyncedUidRef.current = user.uid;

        const nextAccess = await computeAccess({ user });
        setAccess(nextAccess || { pro: false, isAdmin: false, claims: {}, ent: null });

        return { ok: true, entitlement: normalized, access: nextAccess };
      }

      return await refreshFromFirestore(user);
    } catch (err) {
      console.error("[EntitlementContext] forceSyncEntitlement failed", err);
      return { ok: false, reason: "sync_failed", error: err };
    } finally {
      syncInFlightRef.current = false;
    }
  }, [user, refreshFromFirestore]);

  async function unlockWithCode(codeRaw) {
    if (!user?.uid) return { ok: false, reason: "login_required" };

    const code = String(codeRaw || "").trim().toUpperCase();
    if (!code) return { ok: false, reason: "invalid_code" };

    try {
      const fn = httpsCallable(functions, "unlockWithTestCode");
      const res = await fn({ code });

      const normalized = normalizeEntitlement(res?.data || {}, "manual_code");
      setEnt(normalized);
      saveLocalEntitlement(normalized);

      const nextAccess = await computeAccess({ user });
      setAccess(nextAccess || { pro: false, isAdmin: false, claims: {}, ent: null });

      return { ok: true, data: res?.data || null };
    } catch (err) {
      console.error("[EntitlementContext] unlockWithCode failed", err);
      return { ok: false, reason: "unlock_failed", error: err };
    }
  }

  async function grantPro(source = "manual_code", opts = {}) {
    const expiresAtMs =
      opts?.expiresAtMs == null ? null : Number(opts.expiresAtMs);
    const hasExpiry = Number.isFinite(expiresAtMs);

    if (user?.uid) {
      if (source === "manual_code") {
        const code = String(opts?.meta?.codeUsed || "").trim().toUpperCase();
        return unlockWithCode(code);
      }

      return { ok: false, reason: "unsupported_remote_source" };
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
    setAccess({
      pro: true,
      isAdmin: false,
      claims: {},
      ent: normalized,
    });
    return { ok: true };
  }

  async function lockToFree() {
    const source = String(ent?.source || "").toLowerCase();

    const canDowngradeLocally =
      source === "manual_code" || source === "local";

    if (!canDowngradeLocally) {
      return { ok: false, reason: "not_allowed" };
    }

    const freeEnt = freeEntitlement("local");

    saveLocalEntitlement(freeEnt);
    setEnt(freeEnt);

    const nextAccess = user
      ? await computeAccess({ user })
      : { pro: false, isAdmin: false, claims: {}, ent: null };

    setAccess(nextAccess);

    return { ok: true };
  }

  const value = useMemo(
    () => ({
      deviceId,
      user,
      entitlement: ent,
      access,
      isPro,
      pro: !!isPro,
      isAdmin: !!access?.isAdmin,
      authReady,
      entitlementLoading,
      loading: !authReady || entitlementLoading,
      forceSyncEntitlement,
      unlockWithCode,
      grantPro,
      lockToFree,
      refreshFromFirestore,
      clearLocalEntitlement,
    }),
    [
      deviceId,
      user,
      ent,
      access,
      isPro,
      authReady,
      entitlementLoading,
      forceSyncEntitlement,
      refreshFromFirestore,
    ]
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error("useEntitlement must be used inside EntitlementProvider");
  }
  return ctx;
}