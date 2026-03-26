import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function AdminGrantProButton() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
          if (mounted) {
            setIsAdmin(false);
            setCheckingAdmin(false);
          }
          return;
        }

        const tokenResult = await user.getIdTokenResult(true);
        const adminClaim = !!tokenResult.claims.admin;

        if (mounted) {
          setIsAdmin(adminClaim);
          setCheckingAdmin(false);
        }
      } catch (err) {
        console.error("[AdminGrantProButton] admin check failed:", err);
        if (mounted) {
          setIsAdmin(false);
          setCheckingAdmin(false);
        }
      }
    }

    checkAdmin();

    return () => {
      mounted = false;
    };
  }, []);

    async function handleRevokePro() {
    const trimmedEmail = String(email || "").trim();

    if (!trimmedEmail) {
      setStatus("Anna käyttäjän sähköposti.");
      return;
    }

    setBusy(true);
    setStatus("Poistetaan PRO-oikeus...");

    try {
      const functions = getFunctions(undefined, "europe-west1");
      const revokeProByEmail = httpsCallable(functions, "revokeProByEmail");

      const result = await revokeProByEmail({ email: trimmedEmail });

      setStatus(`PRO poistettu: ${result?.data?.email || trimmedEmail}`);
    } catch (err) {
      console.error("[AdminGrantProButton] revokeProByEmail failed:", err);
      setStatus(err?.message || "PRO-oikeuden poisto epäonnistui.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokePro() {
    const trimmedEmail = String(email || "").trim();

    if (!trimmedEmail) {
      setStatus("Anna käyttäjän sähköposti.");
      return;
    }

    setBusy(true);
    setStatus("Poistetaan PRO-oikeus...");

    try {
      const functions = getFunctions();
      const revokeProByEmail = httpsCallable(functions, "revokeProByEmail");

      const result = await revokeProByEmail({ email: trimmedEmail });

      setStatus(`PRO poistettu: ${result?.data?.email || trimmedEmail}`);
    } catch (err) {
      console.error("[AdminGrantProButton] revokeProByEmail failed:", err);
      setStatus(err?.message || "PRO-oikeuden poisto epäonnistui.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingAdmin) return null;
  if (!isAdmin) return null;

  return (
    <div
      style={{
        margin: "1rem 0",
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "12px",
        background: "#fff8e1"
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
        Admin – PRO hallinta
      </h3>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <input
          type="email"
          placeholder="käyttäjän sähköposti"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: "1 1 260px",
            minWidth: "260px",
            padding: "0.65rem",
            borderRadius: "8px",
            border: "1px solid #bbb"
          }}
        />

        <button
          type="button"
          onClick={handleGrantPro}
          disabled={busy}
          style={{
            padding: "0.65rem 1rem",
            borderRadius: "8px",
            border: "1px solid #999",
            cursor: busy ? "default" : "pointer"
          }}
        >
          Anna PRO
        </button>

        <button
          type="button"
          onClick={handleRevokePro}
          disabled={busy}
          style={{
            padding: "0.65rem 1rem",
            borderRadius: "8px",
            border: "1px solid #999",
            cursor: busy ? "default" : "pointer"
          }}
        >
          Poista PRO
        </button>
      </div>

      {status ? (
        <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>{status}</p>
      ) : null}
    </div>
  );
}