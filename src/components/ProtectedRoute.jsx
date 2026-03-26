// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useEntitlement } from "./EntitlementContext";

export default function ProtectedRoute({ children }) {
  const state = useEntitlement();
  console.log("[ProtectedRoute] entitlement state:", state);

  const { loading, access, pro, isAdmin } = state;

  if (loading) return <div style={{ padding: 12 }}>Ladataan…</div>;

  const allowed = !!access?.pro || !!pro || !!isAdmin;

  if (!allowed) return <Navigate to="/" replace />;
  return children;
}
