import React, { useEffect } from "react";

export default function Toast({ open, message, onClose, duration = 2200 }) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(id);
  }, [open, duration, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.2rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.85)",
        color: "white",
        padding: "0.6rem 1rem",
        borderRadius: "999px",
        fontSize: "0.9rem",
        zIndex: 9999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      }}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
