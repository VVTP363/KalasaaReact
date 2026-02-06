import React, { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

export default function SessionMenu(props) {
  const { t } = useTranslation();

  // Jos parent antaa open/setOpen, käytä niitä. Muuten käytä omaa statea.
  const hasExternal = typeof props.setOpen === "function";
  const [internalOpen, setInternalOpen] = useState(false);

  const open = hasExternal ? !!props.open : internalOpen;
  const setOpen = hasExternal ? props.setOpen : setInternalOpen;

  const close = useCallback(() => setOpen(false), [setOpen]);

  const {
    isActive,
    showStop,
    onStopFishing,
    // ... kaikki muut propsit jotka sinulla jo on
  } = props;

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "0.4rem 0.6rem",
          borderRadius: "8px",
          border: "1px solid #ccc",
          background: "#f8f8f8",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        ⚙️{" "}
        {open
          ? t("session.menuClose", { defaultValue: "Sulje" })
          : t("session.menuTitle", { defaultValue: "Sessio" })}
      </button>

      {open && (
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {isActive && showStop && (
            <button
              type="button"
              onClick={() => {
                onStopFishing?.();
                close();
              }}
            >
              {t("session.stop", { defaultValue: "Lopeta" })}
            </button>
          )}

          {/* muut napit tähän, ja lopuksi esim. */}
          {typeof props.onGoToCatchForm === "function" && (
  <button
    type="button"
    onClick={() => {
      props.onGoToCatchForm();
      close();
    }}
  >
    ✍️{t("session.continueCatch", { defaultValue: "Jatka saalisilmoitusta" })}
  </button>
)}
        </div>
      )}
    </div>
  );
}
