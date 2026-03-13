// src/utils/accessConfig.js
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase"; // <- muuta polku jos sun db tulee eri tiedostosta

export async function fetchAccessConfig() {
  const ref = doc(db, "sovellusKonfig", "paasy");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function computeAccess({ user }) {
  const cfg = await fetchAccessConfig();

  const host = window.location.hostname; // "localhost" tai "kalasaaapp.web.app"
  const email = (user?.email || "").toLowerCase();

  const authorizedDomains = cfg?.authorizedDomains || [];
  const allowlistEmails = (cfg?.allowlistEmails || []).map((e) =>
    String(e).toLowerCase()
  );

  const domainOk = authorizedDomains.includes(host);
  const emailOk = allowlistEmails.includes(email);
  const trialEnabled = cfg?.trialEnabled === true;

  return {
    cfg,
    host,
    domainOk,
    emailOk,
    trialEnabled,
    // pro-logiikka: allowlist + domain TAI trial päällä
    pro: (domainOk && emailOk) || trialEnabled,
  };
}
