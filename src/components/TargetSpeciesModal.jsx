import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_OPTIONS = [
  "Taimen",
  "Lohi",
  "Ahven",
  "Hauki",
  "Made",
  "Harjus",
  "Siika",
  "Kuha",
  "Rautu",
  "Saimaannieriä",
  "Kyttyrälohi",
];

export default function TargetSpeciesModal({
  open,
  options = DEFAULT_OPTIONS,
  title,     // <- ei oletustekstiä tässä (käännetään sisällä)
  subtitle,  // <- ei oletustekstiä tässä (käännetään sisällä)
  onClose,   // ✅ uusi
  onCancel,  // ✅ pidetään taaksepäin yhteensopivana
  onSelect,
  speciesOptions, // jos annettu, käytetään tätä
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const list = useMemo(() => {
    const arr = Array.isArray(speciesOptions) && speciesOptions.length ? speciesOptions : options;
    return Array.isArray(arr) ? arr : [];
  }, [speciesOptions, options]);

  const resolvedTitle =
    title ?? t("session.chooseTarget", { defaultValue: "Valitse kohdekala!" });

  const resolvedSubtitle =
    subtitle ??
    t("session.chooseTargetHelp", {
      defaultValue: "Tämä auttaa oppivaa mallia (kg / effort).",
    });

  const close = () => {
    // ✅ kutsu molemmat jos joku käyttää vielä onCancelia
    onClose?.();
    onCancel?.();
  };

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]); // close on ok: viittaa stableihin propseihin käytännössä

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
        padding: 16,
      }}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #ddd",
          padding: 16,
          boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>
            {resolvedTitle}
          </div>
          <div style={{ fontSize: "0.95rem", opacity: 0.75 }}>
            {resolvedSubtitle}
          </div>
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: "0.9rem", opacity: 0.8, marginBottom: 6 }}>
            {t("session.targetSpeciesLabel", { defaultValue: "Kohdekala" })}
          </div>

          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          >
            <option value="">
              {t("session.selectPlaceholder", { defaultValue: "Valitse…" })}
            </option>

            {list.map((s) => (
              <option key={s} value={s}>
                {/* jos teillä on fish.* käännökset, tämä kääntää lajin */}
                {t(`fish.${s}`, { defaultValue: s })}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {t("session.cancel", { defaultValue: "Peruuta" })}
          </button>

          <button
            type="button"
            disabled={!value}
            onClick={() => onSelect?.(value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: !value ? "#eee" : "#fafafa",
              cursor: !value ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {t("session.start", { defaultValue: "Aloita" })}
          </button>
        </div>
      </div>
    </div>
  );
}
