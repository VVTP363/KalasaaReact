// src/components/VirtavesiIlmoitus.jsx
import React, { useState, useMemo, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppContext } from "./AppContext";
import { useRealizedOHActive } from "../hooks/useRealizedOHActive";
import { EMOJI_BY_KEY, normalizeMoonKey } from "../utils/moon";
import Toast from "./Toast";
import {
   computeEffortHours,
  getTargetRate,
  computeTargetKg,
  computeSessionFactor,
  classifySessionFactor,
} from "../utils/sessionTarget";
import { TARGET_KG_BY_SPECIES } from "../utils/sessionTarget";
import { normalizeSpecies } from "../utils/species";

const PROTECTED_SET = new Set(["Saimaannieriä"]);
const translateSpecies = (sp, t) => (sp ? t(`fish.${sp}`, sp) : "");

const speciesOptions = [
  "Lohi",
  "Taimen",
  "Rautu",
  "Saimaannieriä",
  "Harjus",
  "Siika",
  "Kyttyrälohi",
];

const lengthOptions = {
  Lohi: ["<50 cm", "50–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", "91–100 cm", ">100 cm", ">130 cm"],
  Taimen: ["<50 cm", "51–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", ">90 cm"],
  Rautu: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", ">50 cm"],
  Saimaannieriä: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", ">50 cm"],
  Harjus: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", ">50 cm"],
  Siika: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", ">50 cm"],
  Kyttyrälohi: ["<50 cm", "50–60 cm", "61–70 cm", ">70 cm"],
};

const getWindDirectionText = (deg) => {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
};

const parseWeight = (value) => {
  const num = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : 0;
};

const VirtavesiIlmoitus = ({
  explicitForecastOH,
  onSaved,
  sessionDraft,
  onResolveTargetNone,
  onMarkTargetCaught,
}) => {
const targetGateOn =
  !!sessionDraft?.targetSpecies &&
  sessionDraft?.targetResolved === false;

const lockedTargetSpecies =
  sessionDraft?.targetSpecies?.trim?.() || null;

  const { t, i18n } = useTranslation("translation");

  const {
    riverOH,
    pressure,
    windDirection,
    windSpeed,
    moonEmoji,
    locationName,
    moonPhaseKey,
  } = useContext(AppContext);

  // Ennuste-OH: prop > context
  const forecastBase = Number.isFinite(Number(explicitForecastOH))
    ? Number(explicitForecastOH)
    : Number.isFinite(Number(riverOH))
    ? Number(riverOH)
    : null;

  const effectiveOH = useMemo(() => {
    if (!Number.isFinite(forecastBase)) return null;
    return Math.max(1, Math.min(8, Math.round(forecastBase)));
  }, [forecastBase]);

  const presNum = Number.isFinite(pressure) ? Number(pressure) : null;
  const windDeg = Number.isFinite(windDirection) ? Math.round(Number(windDirection)) : null;

  // Kuun vaihe
  const { camel: moonCamel, kebab: moonKebab } = normalizeMoonKey(moonPhaseKey || "newMoon");
  const moonSymbol = EMOJI_BY_KEY[moonCamel] || moonEmoji || "🌙";
  const moonLabel = t(`moonPhaseNames.${moonKebab}`, moonKebab || "");
  const moonPhaseDisplay = `${moonSymbol} ${moonLabel}`;

  // Lomakkeen state
 const [form, setForm] = useState({
  date: new Date().toISOString().split("T")[0],
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  species: "",
  length: "",
  amount: "",
  weight: "",
  cr: "",
  feedback: "",
  gearUnits: 1,
});


  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

 const safeWeight = parseWeight(form.weight);
const readArr = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const appendToStorage = (key, row) => {
  const arr = readArr(key);
  localStorage.setItem(key, JSON.stringify([...arr, row]));
};

const emitCatchesUpdated = () => {
  try {
    window.dispatchEvent(new Event("catchesUpdated"));
  } catch {}
};

// pyydysyksiköt aina >= 0
const gearUnits = Math.max(0, Number(form.gearUnits) || 0);

// ✅ sessio minuutteina (draftista)
const sessionDurMin = useMemo(() => {
  const n = Number(sessionDraft?.durationMinutes);
  return Number.isFinite(n) && n > 0 ? n : 0;
}, [sessionDraft?.durationMinutes]);

// ✅ tunnit sessiosta
const fishingHours = useMemo(() => {
  return sessionDurMin > 0 ? sessionDurMin / 60 : 0;
}, [sessionDurMin]);

// ✅ effortHours = pyydysyksiköt × sessiotunnit
const effortHours = useMemo(() => {
  if (gearUnits <= 0 || fishingHours <= 0) return 0;
  return Number((gearUnits * fishingHours).toFixed(2));
}, [gearUnits, fishingHours]);

const fishingTimeText = useMemo(() => {
  if (fishingHours <= 0) return "-";
  return `~${fishingHours.toFixed(2)} h`;
}, [fishingHours]);

const sessionTimeText = useMemo(() => {
  if (sessionDurMin <= 0) return "-";
  return `${Math.round(sessionDurMin)} min`;
}, [sessionDurMin]);

  // Toteutunut OH aktiivipyynnille
  const { realizedOH, matchFactor } = useRealizedOHActive({
    species: form.species,
    catchKg: safeWeight,
    fishingHours,
    gearUnits,
    forecastOH: effectiveOH ?? undefined,
    enabled: safeWeight > 0 && gearUnits > 0 && fishingHours > 0,
  });

  const handleResolveTargetNone = () => {
  try {
    // Gate pitää olla päällä, muuten ei tehdä mitään
    if (!targetGateOn || !lockedTargetSpecies) return;

    const target = sessionDraft?.targetSpecies?.trim?.() || lockedTargetSpecies;
    if (!target) {
      setToastMsg(
        t("session.noTargetSelected", {
          defaultValue: "Kohdekalaa ei ole valittu tälle sessiolle.",
        })
      );
      setToastOpen(true);
      return;
    }

    // sessiominuutit draftista (sama lähde kuin tallennuksessa)
    const minsFromSession =
      Number(sessionDraft?.durationMinutes) ||
      Number(sessionDraft?.pyyntiaikaMin) ||
      Number(sessionDraft?.fishingDurationMin) ||
      null;

    // jos sessiota ei ole, ei kirjata “ei tavoitesaalista”
    if (!Number.isFinite(minsFromSession) || minsFromSession <= 0) {
      setToastMsg(
        t("session.noSessionTime", {
          defaultValue: "Sessioaikaa ei löydy. Lopeta sessio ensin.",
        })
      );
      setToastOpen(true);
      return;
    }

    const gearUnitsSafe = Math.max(1, Number(form.gearUnits || 1));
    const effortHoursSafe = (minsFromSession / 60) * gearUnitsSafe;

    const locationFinal = (locationName || "").trim() || "-";
    const ohForSave = Number.isFinite(effectiveOH) ? effectiveOH : null;

    // ✅ “sessiorivi” statsia varten (EI saalisriviä)
    const sessionRow = {
      kind: "session",
      isSession: true,
      isTargetNone: true,
      source: "river",
      createdAt: Date.now(),
      species: "__none__",
      length: "",
      cr: 0,
      amount: 0,
      weight: 0,
      date: form.date || new Date().toISOString().slice(0, 10),
      time:
        form.time ||
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),

      locationName: locationFinal,
      location: locationFinal,

      // kohdekala
      targetSpecies: target,
      targetResolved: true,
      targetOutcome: "none",
      targetCatchKg: 0,
      targetCatchCount: 0,
      speciesKey: "__none__",
      targetSpeciesKey: target ? normalizeSpecies(String(target).trim()) : null,

      // effort/sessio
      durationMinutes: minsFromSession,
      fishingDurationMin: minsFromSession,
      gearUnits: gearUnitsSafe,
      effortHours: Number.isFinite(effortHoursSafe)
        ? Number(effortHoursSafe.toFixed(2))
        : null,

      // ennuste & sää (tilastoihin)
      pressure: presNum,
      windDeg: windDeg,
      // ✅ Molemmat, jotta historia löytää varmasti
      windDirectionText:
	  windDeg != null ? `${getWindDirectionText(windDeg)} (${windDeg}°)` : "-",
	windDirection:
	  windDeg != null ? `${getWindDirectionText(windDeg)} (${windDeg}°)` : "-",

	windSpeed: Number.isFinite(windSpeed) ? Number(windSpeed) : null,

      realizedOH: 0,
      ohMatchFactor: 0,
      forecastOH: ohForSave,
      hourlyOH: ohForSave,
      fishingInterest: ohForSave,

      moonPhaseKey: moonCamel || moonPhaseKey,
      moonEmoji: moonSymbol,
      moonPhaseLabel: moonLabel,
      moonPhase: moonPhaseDisplay,

      lang: i18n.language,
      kieli: i18n.language,
    };

    // talteen vain “saaliit” -> stats päivittyy (virtavesisaaliit ei sotkeennu)
    appendToStorage("saaliit", sessionRow);

    console.log("[SAVE] sessionRow keys:", Object.keys(sessionRow));
    console.log("[SAVE] sessionRow.targetSpeciesKey:", sessionRow.targetSpeciesKey);
  
// ✅ jos Virtavesi-historia listaa virtavesisaaliit-avaimesta, tallenna myös sinne:
    appendToStorage("virtavesisaaliit", sessionRow);

    emitCatchesUpdated();

    // avaa lukko hookissa
    if (typeof onResolveTargetNone === "function") onResolveTargetNone();

    setToastMsg(
      t("session.targetNoneSaved", {
        defaultValue: "Ei tavoitesaalista kirjattu — voit tallentaa muun saaliin.",
      })
    );
    setToastOpen(true);
    resetFormNormal();
   
  } catch (err) {
  console.error("Save error:", err);
  setToastMsg(String(err?.message || err || "Tallennus epäonnistui."));
  setToastOpen(true);
}
   finally {
    try { onResolveTargetNone?.(); } catch {}
   }
};

  const realizedRounded = Number.isFinite(realizedOH) ? Math.round(realizedOH) : null;
  const matchSafe = Number.isFinite(matchFactor) ? Number(matchFactor) : null;

  const resetFormNormal = () => {
  setForm({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    species: "",
    length: "",
    amount: "",
    weight: "",
    cr: "",
    feedback: "",
    gearUnits: 1,
  });
};

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

	useEffect(() => {
	  if (targetGateOn && lockedTargetSpecies) {
	    setForm((prev) => ({
	      ...prev,
	      species: lockedTargetSpecies, // 🎯 pakotus
	    }));
	  }
	}, [targetGateOn, lockedTargetSpecies]);

 const handleSubmit = () => {
  // ✅ 0) EI TAVOITESAALISTA ei ole saalistallennus (se tehdään omalla napilla)
  if ((form.species || "").trim() === "__none__") {
    setToastMsg(
      t("session.noTargetCatch", {
        defaultValue: "Ei tavoitesaalista kirjataan erillisellä napilla.",
      })
    );
    setToastOpen(true);
    return;
  }

  // 1) estä tallennus väärälle lajille kun target on lukittu
  if (targetGateOn && lockedTargetSpecies) {
    const chosen = (form.species || "").trim();
    if (chosen !== lockedTargetSpecies) {
      setToastMsg(
        t("session.targetMismatch", {
          defaultValue: `Kohdekala on ${translateSpecies(
            lockedTargetSpecies,
            t
          )}. Tallenna kohdesaalis tai valitse "Ei tavoitesaalista".`,
        })
      );
      setToastOpen(true);
      return;
    }
  }

  // 2) perusvalidointi
  const chosenSpecies = (form.species || "").trim();
  const isTargetCatchLocal =
    !!(targetGateOn && lockedTargetSpecies && chosenSpecies === lockedTargetSpecies);

  const targetSpeciesForRow = isTargetCatchLocal ? lockedTargetSpecies : null;

  const amountParsed = parseInt(form.amount || "0", 10) || 0;
  const weightParsed = parseWeight(form.weight);
  const hasCatch = !!chosenSpecies && amountParsed > 0 && Number.isFinite(weightParsed) && weightParsed > 0;

  if (!hasCatch) {
  console.log("lng:", i18n.language);
  console.log(
    "exists:",
    i18n.exists("toast.missingCatchKgAndCount", { ns: "translation" })
  );

  setToastMsg(
    t("toast.missingCatchKgAndCount", {
      ns: "translation",
      defaultValue: "Valitse kalalaji ja anna kpl sekä paino ennen tallennusta.",
    })
  );
  setToastOpen(true);
  return;
}

  try {
    const ratingValue = parseInt(form.feedback, 10);
    const locationFinal = (locationName || "").trim() || "-";

    const windDegNum = windDeg;
    const windText =
      windDegNum != null
        ? `${getWindDirectionText(windDegNum)} (${windDegNum}°)`
        : "-";

    const realizedRoundedLocal = Number.isFinite(realizedOH) ? Math.round(realizedOH) : null;
    const matchSafeLocal = Number.isFinite(matchFactor) ? Number(matchFactor) : null;

    const ohForSave = Number.isFinite(effectiveOH)
      ? effectiveOH
      : Number.isFinite(realizedRoundedLocal)
      ? realizedRoundedLocal
      : null;

    const realizedForSave =
      hasCatch && Number.isFinite(realizedRoundedLocal) && realizedRoundedLocal > 0
        ? realizedRoundedLocal
        : null;

    const matchForSave =
      hasCatch &&
      Number.isFinite(matchSafeLocal) &&
      matchSafeLocal > 0 &&
      Number.isFinite(realizedForSave)
        ? Number(matchSafeLocal)
        : null;

    // kanoniset sessiokentät
    const minsFromSession =
      Number(sessionDraft?.durationMinutes) ||
      Number(sessionDraft?.pyyntiaikaMin) ||
      Number(sessionDraft?.fishingDurationMin) ||
      Number(sessionDurMin) ||
      null;

    const gearUnitsSafe = Math.max(1, Number(form.gearUnits) || 1);
    const effortHoursSafe =
      minsFromSession != null ? (minsFromSession / 60) * gearUnitsSafe : null;

    const targetSpecies = isTargetCatchLocal ? lockedTargetSpecies : null;

    const targetKg = computeTargetKg({
      targetSpecies,
      effortHours: Number.isFinite(effortHoursSafe) ? effortHoursSafe : effortHours,
    });

    const sessionFactor = computeSessionFactor({
      actualKg: safeWeight,
      targetKg,
    });

    const sessionClass = classifySessionFactor(sessionFactor);
    
  const speciesRaw = String(form.species || "").trim();
  const speciesKey = speciesRaw && speciesRaw !== "__none__" ? normalizeSpecies(speciesRaw) : null;
  console.log("[SAVE] speciesRaw/speciesKey:", speciesRaw, speciesKey);

    const saalis = {
      ...form,
      species: speciesRaw,
      speciesKey: speciesKey,
      source: "river",
      location: locationFinal,
      locationName: locationFinal,
      createdAt: Date.now(),
      isSession: false,
      amount: amountParsed,
      weight: safeWeight,
      cr: parseInt(form.cr, 10) || 0,

      pressure: Number.isFinite(presNum) ? presNum : null,

      hourlyOH: ohForSave,
      forecastOH: ohForSave,
      fishingInterest: ohForSave,

      realizedOH: realizedForSave,
      ohMatchFactor: matchForSave,

      windDeg: windDegNum,
      windDirectionText: windText,
      windDirection: windText,
      windSpeed: Number.isFinite(windSpeed) ? Number(windSpeed) : null,

      moonPhase: moonPhaseDisplay,
      moonPhaseKey: moonCamel || moonPhaseKey,
      moonEmoji: moonSymbol,
      moonPhaseLabel: moonLabel,

      // ✅ kohderivi vain kohdekalalle
      targetSpecies: targetSpeciesForRow,
      isTargetCatch: isTargetCatchLocal,
      targetOutcome: isTargetCatchLocal ? "caught" : null,
      targetResolved: isTargetCatchLocal ? true : null,

      durationMinutes: minsFromSession,
      fishingDurationMin: minsFromSession,
      fishingHours: Number.isFinite(fishingHours) ? Number(fishingHours) : 0,
      gearUnits: gearUnitsSafe,
      effortHours: effortHoursSafe != null ? Number(effortHoursSafe.toFixed(2)) : null,

      targetKg: Number.isFinite(targetKg) ? Number(targetKg.toFixed(2)) : null,
      sessionFactor: Number.isFinite(sessionFactor) ? Number(sessionFactor.toFixed(2)) : null,
      sessionClass: sessionClass || null,

      pyyntiaika: fishingTimeText,

      lang: i18n.language,
      kieli: i18n.language,
      rating: Number.isFinite(ratingValue) ? ratingValue : null,
    };

    appendToStorage("virtavesisaaliit", saalis);
    appendToStorage("saaliit", saalis);
    emitCatchesUpdated();

    setToastMsg(t("saveSuccess", { defaultValue: "Tallennettu!" }));
    setToastOpen(true);

    resetFormNormal(); // ✅ tämä riittää

    if (targetGateOn && typeof onMarkTargetCaught === "function") {
      onMarkTargetCaught({
        addKg: Number.isFinite(safeWeight) ? safeWeight : 0,
        addCount: Number.isFinite(amountParsed) ? amountParsed : 0,
      });
    }
  } catch (err) {
    console.error("Save error:", err);
    setToastMsg(t("toast.saveError", { defaultValue: "Tallennus epäonnistui." }));
    setToastOpen(true);
  }
};


  return (
    <div>
      <h4>
        🎣 {t("ohForecastTitle")}:
        {effectiveOH != null ? ` ${effectiveOH}/8` : " -/8"}
      </h4>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5em",
          maxWidth: 300,
        }}
      >
        <label>
	  {t("fishSpecies")}:
	  <select
	    name="species"
	    value={form.species}
	    onChange={handleChange}
	    disabled={targetGateOn}   // 🔒 lukitus kohdekalassa
	  >
	    <option value="">{t("select")}</option>
	    {speciesOptions.map((s) => (
	      <option key={s} value={s}>
	        {translateSpecies(s, t)}
	        {PROTECTED_SET.has(s) ? ` (${t("protected")})` : ""}
	      </option>
	    ))}
	  </select>

	  {targetGateOn && lockedTargetSpecies ? (
  <div style={{ marginTop: 6, fontSize: "0.9rem", opacity: 0.85 }}>
    🎯 {t("session.targetLocked", { defaultValue: "Kohdekala lukittu" })}:{" "}
    <strong>{translateSpecies(lockedTargetSpecies, t)}</strong>
    <br />
    {t("session.mustResolveTarget", {
      defaultValue: 'Tallenna kohdesaalis tai valitse "Ei tavoitesaalista".',
    })}
  </div>
) : null}
</label>

        <label>
          {t("length")}:
          <select
            name="length"
            value={form.length}
            onChange={handleChange}
            disabled={!form.species}
          >
            <option value="">{t("select")}</option>
            {lengthOptions[form.species]?.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("amount")}:
          <input name="amount" type="number" min="0" value={form.amount} onChange={handleChange} />
        </label>

        <label>
          {t("weight")} (kg):
          <input name="weight" type="text" value={form.weight} onChange={handleChange} />
        </label>

        <label>
          {t("crAmount")}:
          <input name="cr" type="number" min="0" value={form.cr} onChange={handleChange} />
        </label>

        <label>
          {t("rating.label")}:
          <select name="feedback" value={form.feedback} onChange={handleChange}>
            <option value="">{t("rating.select")}</option>
            <option value="1">{t("rating.1")}</option>
            <option value="2">{t("rating.2")}</option>
            <option value="3">{t("rating.3")}</option>
            <option value="4">{t("rating.4")}</option>
          </select>
        </label>

        <label>
          {t("gearUnits", "Pyydysyksiköt")}:
          <input
            type="number"
            min="1"
            value={form.gearUnits}
            name="gearUnits"
            onChange={(e) =>
              setForm((prev) => ({ ...prev, gearUnits: Number(e.target.value) || 1 }))
            }
          />
        </label>

        <label>
  {t("fishingTime", "Pyyntiaika")}:
  <strong style={{ marginLeft: "0.5em" }}>
    {fishingTimeText}
  </strong>
</label>

<label>
  {t("session.duration", { defaultValue: "Kalastusaika (sessio)" })}
  <strong style={{ marginLeft: "0.5em" }}>
    {sessionTimeText}
  </strong>
</label> 

{effortHours > 0 && (
  <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
    ⏱ Effort: <strong>{effortHours.toFixed(2)} eh</strong> (
    {gearUnits} {t("gearUnits", "pyydystä")} × {fishingHours.toFixed(2)} h)
  </div>
)}

        {Number(fishingHours) > 0 &&
	  Number(form.gearUnits) > 0 &&
	  Number.isFinite(realizedRounded) &&
	  realizedRounded > 0 && (
            <p style={{ marginTop: "0.25rem" }}>
              {t("oh.realizedActiveBase", {
                realized: realizedRounded,
                defaultValue: "🎣 OH-toteuma (aktiivipyynti): {{realized}}/8",
              })}
              {Number.isFinite(matchSafe) && matchSafe > 0 && (
                <>
                  {" "}
                  {t("oh.realizedActiveFactor", {
                    factor: matchSafe.toFixed(2),
                    defaultValue: "– ennusteeseen verrattuna {{factor}}×",
                  })}
                </>
              )}
            </p>
          )}

        <button type="button" onClick={handleSubmit}>
	  {t("saveCatch")}
	</button>

	{targetGateOn ? (
	  <button
	    type="button"
	    onClick={handleResolveTargetNone}
	    style={{ marginLeft: 8 }}
	  >
	    🚫 {t("session.noTargetCatch", "Ei tavoitesaalista")}
	  </button>
	) : null}


        <Toast open={toastOpen} onClose={() => setToastOpen(false)} message={toastMsg} />
      </div>
    </div>
  );
};

export default VirtavesiIlmoitus;
