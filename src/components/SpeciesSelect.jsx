// src/components/SpeciesSelect.jsx
import React from "react";
import { useTranslation } from "react-i18next";

// Yleinen lajilista (kaikille näkymille)
// TÄRKEÄÄ: mukana nyt myös Rautu, Saimaannieriä ja Kyttyrälohi
const ALL_SPECIES = [
  "Hauki",
  "Kuha",
  "Ahven",
  "Lohi",
  "Taimen",
  "Rautu",
  "Saimaannieriä",
  "Harjus",
  "Siika",
  "Kyttyrälohi",
];

export default function SpeciesSelect({
  value,
  onChange,
  allowedSpecies,      // ⬅️ uusi prop: rajaa listaa
  includeEmpty = true, // ⬅️ tyhjä "Valitse" -rivi
}) {
  const { t } = useTranslation();

  // Jos allowedSpecies annettu → suodatetaan sen mukaan
  const list =
    Array.isArray(allowedSpecies) && allowedSpecies.length
      ? ALL_SPECIES.filter((sp) => allowedSpecies.includes(sp))
      : ALL_SPECIES;

  const handleChange = (e) => {
    const v = e.target.value;
    onChange && onChange(v);
  };

  return (
    <select value={value} onChange={handleChange}>
      {includeEmpty && <option value="">{t("select", "Valitse")}</option>}
      {list.map((sp) => (
        <option key={sp} value={sp}>
          {t(`fish.${sp}`, sp)}
        </option>
      ))}
    </select>
  );
}
