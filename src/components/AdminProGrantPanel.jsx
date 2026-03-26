import React, { useMemo, useState } from "react";
import { auth, db } from "../firebase";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const ADMIN_EMAILS = ["masa.mainio@vilunki.com"];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export default function AdminProGrantPanel() {
  const currentUser = auth.currentUser;
  const currentEmail = normalizeEmail(currentUser?.email);

  const isAdmin = useMemo(() => {
    return ADMIN_EMAILS.includes(currentEmail);
  }, [currentEmail]);

  const [targetEmail, setTargetEmail] = useState("");
  const [tier, setTier] = useState("pro");
  const [source, setSource] = useState("promo");
  const [note, setNote] = useState("markkinointi");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lookupInfo, setLookupInfo] = useState(null);

  if (!isAdmin) return null;

  async function handleGrant() {
    const email = normalizeEmail(targetEmail);

    if (!isValidEmail(email)) {
      setStatus("Anna kelvollinen sähköpostiosoite.");
      return;
    }

    try {
      setBusy(true);
      setStatus("");
      setLookupInfo(null);

      await setDoc(
        doc(db, "pro_allowlist", email),
        {
          email,
          tier,
          source,
          note: String(note || "").trim(),
          grantedBy: currentEmail,
          active: true,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStatus(`PRO-oikeus myönnetty: ${email}`);
    } catch (error) {
      console.error("[AdminProGrantPanel] handleGrant failed:", error);
      setStatus(`Myöntäminen epäonnistui: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    const email = normalizeEmail(targetEmail);

    if (!isValidEmail(email)) {
      setStatus("Anna kelvollinen sähköpostiosoite.");
      return;
    }

    try {
      setBusy(true);
      setStatus("");
      setLookupInfo(null);

      await deleteDoc(doc(db, "pro_allowlist", email));

      setStatus(`PRO-oikeus poistettu: ${email}`);
    } catch (error) {
      console.error("[AdminProGrantPanel] handleRevoke failed:", error);
      setStatus(`Poistaminen epäonnistui: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheck() {
    const email = normalizeEmail(targetEmail);

    if (!isValidEmail(email)) {
      setStatus("Anna kelvollinen sähköpostiosoite.");
      return;
    }

    try {
      setBusy(true);
      setStatus("");

      const ref = doc(db, "pro_allowlist", email);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setLookupInfo(null);
        setStatus(`Osoitteella ${email} ei ole pro_allowlist-riviä.`);
        return;
      }

      const data = snap.data() || {};
      setLookupInfo(data);
      setStatus(`Allowlist-rivi löytyi: ${email}`);
    } catch (error) {
      console.error("[AdminProGrantPanel] handleCheck failed:", error);
      setStatus(`Tarkistus epäonnistui: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #d0d7de",
        borderRadius: 12,
        background: "#f8fafc",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>
        Admin: PRO-oikeus sähköpostille
      </div>

      <input
        type="email"
        placeholder="asiakas@esimerkki.fi"
        value={targetEmail}
        onChange={(e) => setTargetEmail(e.target.value)}
        disabled={busy}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span>Taso</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            disabled={busy}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          >
            <option value="pro">pro</option>
            <option value="pro_trial">pro_trial</option>
            <option value="pro_permanent">pro_permanent</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Lähde</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          >
            <option value="promo">promo</option>
            <option value="admin">admin</option>
            <option value="manual_code">manual_code</option>
          </select>
        </label>
      </div>

      <input
        type="text"
        placeholder="Huomio, esim. markkinointi / yhteistyö / testikäyttö"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={handleGrant}
          disabled={busy}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #16a34a",
            background: "#16a34a",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Myönnä PRO
        </button>

        <button
          type="button"
          onClick={handleRevoke}
          disabled={busy}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #dc2626",
            background: "#dc2626",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Poista PRO
        </button>

        <button
          type="button"
          onClick={handleCheck}
          disabled={busy}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #475569",
            background: "#475569",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Tarkista
        </button>
      </div>

      {status ? (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "#eef2ff",
            fontSize: 14,
          }}
        >
          {status}
        </div>
      ) : null}

      {lookupInfo ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div><strong>Email:</strong> {lookupInfo.email || "-"}</div>
          <div><strong>Tier:</strong> {lookupInfo.tier || "-"}</div>
          <div><strong>Source:</strong> {lookupInfo.source || "-"}</div>
          <div><strong>Note:</strong> {lookupInfo.note || "-"}</div>
          <div><strong>Granted by:</strong> {lookupInfo.grantedBy || "-"}</div>
          <div><strong>Active:</strong> {String(lookupInfo.active)}</div>
        </div>
      ) : null}
    </div>
  );
}