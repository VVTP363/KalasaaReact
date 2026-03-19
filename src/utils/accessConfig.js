// src/utils/accessConfig.js
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

function toLowerTrim(v) {
  return String(v || "").trim().toLowerCase();
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

export async function fetchAccessConfig() {
  const ref = doc(db, "sovellusKonfig", "paasy");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function fetchEntitlement(uid) {
  if (!uid) return null;

  const ref = doc(db, "entitlements", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  return {
    ...data,
    expiresAtMs: tsToMs(data.expiresAt),
  };
}

export async function computeAccess({ user }) {
  const [cfg, ent] = await Promise.all([
    fetchAccessConfig(),
    user?.uid ? fetchEntitlement(user.uid) : Promise.resolve(null),
  ]);

  const host = window.location.hostname;
  const email = toLowerTrim(user?.email);

  const authorizedDomains = Array.isArray(cfg?.authorizedDomains)
    ? cfg.authorizedDomains.map((x) => String(x || "").trim())
    : [];

  const allowlistEmails = Array.isArray(cfg?.allowlistEmails)
    ? cfg.allowlistEmails.map(toLowerTrim)
    : [];

  const domainOk = authorizedDomains.includes(host);
  const emailOk = allowlistEmails.includes(email);
  const trialEnabled = cfg?.trialEnabled === true;

  const tier = String(ent?.tier || "free").toLowerCase();
  const expiresAtMs = ent?.expiresAtMs ?? null;
  const expired = isExpiredMs(expiresAtMs);
  const entitlementPro = isProTier(tier) && !expired;

  return {
    cfg,
    ent,
    host,
    email,
    domainOk,
    emailOk,
    trialEnabled,
    entitlementTier: tier,
    entitlementExpired: expired,
    entitlementPro,
    pro: entitlementPro || ((domainOk && emailOk) || trialEnabled),
  };
}