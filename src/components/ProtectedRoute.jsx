// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useEntitlement } from "./EntitlementContext";

export default function ProtectedRoute({ children }) {
  const { isPro } = useEntitlement();
  if (!isPro) return <Navigate to="/" replace />;
  return children;
}
