import React, { useEffect } from "react";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) {
  // Esc sulkee
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 12,
      }}
      onMouseDown={(e) => {
        // klikkaus taustaan sulkee
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          padding: 16,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
        ) : null}

        <div style={{ marginBottom: 14, lineHeight: 1.35 }}>{message}</div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "1px solid #ccc",
              background: "white",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            {cancelText || "Cancel"}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              border: "1px solid #2a6db0",
              background: "#2a6db0",
              color: "white",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            {confirmText || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
