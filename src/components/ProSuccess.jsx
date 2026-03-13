// src/components/ProSuccess.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useEntitlement } from "./EntitlementContext";

export default function ProSuccess() {
  const navigate = useNavigate();
  const { forceSyncEntitlement, isPro } = useEntitlement();

  useEffect(() => {
    (async () => {
      await forceSyncEntitlement();
    })();
  }, [forceSyncEntitlement]);

  useEffect(() => {
    if (isPro) {
      // pieni viive UX:n takia
      setTimeout(() => {
        navigate("/");
      }, 1500);
    }
  }, [isPro, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>✅ Osto onnistui</h2>
      <p>Päivitetään Pro-oikeudet...</p>
    </div>
  );
}