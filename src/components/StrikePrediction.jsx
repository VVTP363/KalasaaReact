// src/components/StrikePrediction.jsx
import React, { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { AppContext } from "./AppContext";

// Poimitaan (paine, OH) -pisteet yhdestä localStorage-avaimesta,
// optional: vain tietylle lajille (speciesFilter)
function extractPressureOhPoints(key, speciesFilter) {
  let arr = [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(raw)) arr = raw;
  } catch {
    arr = [];
  }

  const out = [];

  for (const d of arr) {
    // Laji tekstimuotoon
    const sp = (d.species || d.laji || "").toString().trim();
    if (speciesFilter && sp && sp !== speciesFilter) {
      continue;
    }

    // Paine: hyväksy sekä pressure_hPa että pressure
    const p =
      d.pressure_hPa != null
        ? Number(d.pressure_hPa)
        : d.pressure != null
        ? Number(d.pressure)
        : NaN;

    if (!Number.isFinite(p)) continue;

    // OH: suositaan toteutunutta OH:ta, muuten ennusteita
    let ohRaw =
      Number.isFinite(d.realizedOH) && d.realizedOH > 0
        ? d.realizedOH
        : null;

    if (!Number.isFinite(ohRaw)) {
      ohRaw =
        d.fishingInterest ??
        d.forecastOH ??
        d.hourlyOH ??
        d.riverOH ??
        d.oh ??
        d.OH;
    }

    const oh = Number(ohRaw);
    if (!Number.isFinite(oh) || oh <= 0) continue;

    out.push({ pressure: p, oh });
  }

  return out;
}

// Kerää lajilistat historiasta (kaikki lajit, joita on oikeasti tallennettu)
function collectSpeciesFromHistory() {
  const keys = ["jarvisaaliit", "virtavesisaaliit"];
  const set = new Set();

  for (const key of keys) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(raw)) continue;
      for (const d of raw) {
        const sp = (d.species || d.laji || "").toString().trim();
        if (sp) set.add(sp);
      }
    } catch {
      // ignore
    }
  }

  return Array.from(set);
}

// Yksinkertainen lineaarinen regressio: OH ≈ a + b * paine
function computeLinearRegression(points) {
  if (!points || points.length < 2) return null;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;

  for (const { pressure, oh } of points) {
    sumX += pressure;
    sumY += oh;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;

  for (const { pressure, oh } of points) {
    const dx = pressure - meanX;
    num += dx * (oh - meanY);
    den += dx * dx;
  }

  if (den === 0) return null;

  const b = num / den; // kulmakerroin
  const a = meanY - b * meanX; // vakiotermi

  return { a, b };
}

function predictOhFromPressure(reg, pressure) {
  if (!reg || !Number.isFinite(pressure)) return null;
  const y = reg.a + reg.b * pressure;
  // rajataan KalasääAppin asteikolle 1–8
  return Math.max(1, Math.min(8, y));
}

// Muutetaan numeerinen OH tekstiksi
function ohToLabel(oh, t) {
  if (!Number.isFinite(oh)) return t("noData", "Ei tietoa");
  if (oh < 2.5) return t("rating.Heikko", "Heikko");
  if (oh < 4.5) return t("rating.Kohtalainen", "Kohtalainen");
  if (oh < 6.5) return t("rating.Hyvä", "Hyvä");
  return t("rating.Erinomainen", "Erinomainen");
}

export default function StrikePrediction() {
  const { t } = useTranslation();
  const { pressure } = useContext(AppContext) || {};

  const [state, setState] = useState({
    lakeOH: null,
    riverOH: null,
    lakeCount: 0,
    riverCount: 0,
    speciesOH: null,
    speciesCount: 0,
  });

  const [speciesOptions, setSpeciesOptions] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState("");

  // Haetaan lajilistat historiasta kerran komponentin mountissa
  useEffect(() => {
    const list = collectSpeciesFromHistory();
    setSpeciesOptions(list);
  }, []);

  useEffect(() => {
    const currentPressure = Number(pressure);
    // Jos nykyinen paine ei ole järkevä, ei tehdä ennustetta
    if (!Number.isFinite(currentPressure)) {
      setState({
        lakeOH: null,
        riverOH: null,
        lakeCount: 0,
        riverCount: 0,
        speciesOH: null,
        speciesCount: 0,
      });
      return;
    }

    // Poimi pisteet molemmista vesityypeistä (kaikki lajit)
    const lakePoints = extractPressureOhPoints("jarvisaaliit");
    const riverPoints = extractPressureOhPoints("virtavesisaaliit");

    const lakeReg = computeLinearRegression(lakePoints);
    const riverReg = computeLinearRegression(riverPoints);

    const lakePred = predictOhFromPressure(lakeReg, currentPressure);
    const riverPred = predictOhFromPressure(riverReg, currentPressure);

    // Jos valittu laji, kerätään vain sen pisteet molemmista
    let speciesPred = null;
    let speciesCount = 0;

    if (selectedSpecies) {
      const lakeSpeciesPoints = extractPressureOhPoints(
        "jarvisaaliit",
        selectedSpecies
      );
      const riverSpeciesPoints = extractPressureOhPoints(
        "virtavesisaaliit",
        selectedSpecies
      );
      const allSpeciesPoints = [
        ...lakeSpeciesPoints,
        ...riverSpeciesPoints,
      ];

      const speciesReg = computeLinearRegression(allSpeciesPoints);
      speciesPred = predictOhFromPressure(speciesReg, currentPressure);
      speciesCount = allSpeciesPoints.length;
    }

    setState({
      lakeOH: lakePred,
      riverOH: riverPred,
      lakeCount: lakePoints.length,
      riverCount: riverPoints.length,
      speciesOH: speciesPred,
      speciesCount,
    });
  }, [pressure, selectedSpecies]);

  const {
    lakeOH,
    riverOH,
    lakeCount,
    riverCount,
    speciesOH,
    speciesCount,
  } = state;

  const currentPressureDisplay = Number.isFinite(Number(pressure))
    ? `${Number(pressure).toFixed(1)} hPa`
    : "-";

  const hasAnyData = lakeCount > 1 || riverCount > 1;

  return (
    <div style={{ marginTop: "2em" }}>
      <h3>
        🎯{" "}
        {t(
          "strikePredictionTitle",
          "Historiapohjainen ottiennuste"
        )}{" "}
        <span
          style={{ cursor: "help", fontSize: "0.9em" }}
          title={t(
            "strikePredictionTooltip",
            "Ennuste käyttää omia saalistietojasi ja arvioi ottihalukkuuden nykyiselle ilmanpaineelle. Järvi-/merivesille ja virtavesille lasketaan omat käyränsä, ja valitulle lajille voidaan laskea oma ennuste."
          )}
        >
          ℹ️
        </span>
      </h3>

      <p>
        {t("currentPressure", "Nykyinen ilmanpaine")}:{" "}
        <strong>{currentPressureDisplay}</strong>
      </p>

      {/* Lajin valinta – valinnainen lajikohtainen ennuste */}
      {speciesOptions.length > 0 && (
        <div style={{ marginBottom: "0.5em" }}>
          <label>
            {t(
              "predictionSpeciesLabel",
              "Valitse laji ennusteelle"
            )}
            :{" "}
            <select
              value={selectedSpecies}
              onChange={(e) => setSelectedSpecies(e.target.value)}
            >
              <option value="">
                {t(
                  "noSpeciesFilter",
                  "Ei lajisuodatusta (kaikki lajit)"
                )}
              </option>
              {speciesOptions.map((sp) => (
                <option key={sp} value={sp}>
                  {t(`fish.${sp}`, sp)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!hasAnyData ? (
        <p>
          {t(
            "noHistoryForPrediction",
            "Ei riittävästi saalistietoja ennusteen tekemiseen."
          )}
        </p>
      ) : (
        <ul style={{ paddingLeft: "1.2em" }}>
          <li>
            🌅{" "}
            <strong>
              {t("lakeSea", "Järvi / Merivesi")}
              {":"}
            </strong>{" "}
            {lakeCount < 2 || !Number.isFinite(lakeOH) ? (
              <span>
                {t(
                  "noLakeData",
                  "Ei riittävästi havaintoja järvi/merivesistä."
                )}
              </span>
            ) : (
              <span>
                {lakeOH.toFixed(1)}/8 – {ohToLabel(lakeOH, t)}{" "}
                <span style={{ opacity: 0.7 }}>
                  {t("basedOnN", `perustuu ${lakeCount} havaintoon`)
                    .replace("{{n}}", lakeCount)}
                </span>
              </span>
            )}
          </li>

          <li>
            🌊{" "}
            <strong>
              {t("river", "Virtavesi")}
              {":"}
            </strong>{" "}
            {riverCount < 2 || !Number.isFinite(riverOH) ? (
              <span>
                {t(
                  "noRiverData",
                  "Ei riittävästi havaintoja virtavesistä."
                )}
              </span>
            ) : (
              <span>
                {riverOH.toFixed(1)}/8 – {ohToLabel(riverOH, t)}{" "}
                <span style={{ opacity: 0.7 }}>
                  {t("basedOnN", `perustuu ${riverCount} havaintoon`)
                    .replace("{{n}}", riverCount)}
                </span>
              </span>
            )}
          </li>

          {selectedSpecies && (
            <li>
              🎣{" "}
              <strong>
                {t("selectedSpeciesPrediction", "Valittu laji")}
                {": "}
                {t(`fish.${selectedSpecies}`, selectedSpecies)}
              </strong>{" "}
              {speciesCount < 2 || !Number.isFinite(speciesOH) ? (
                <span>
                  {t(
                    "noSpeciesData",
                    "Ei riittävästi havaintoja valitusta lajista."
                  )}
                </span>
              ) : (
                <span>
                  {speciesOH.toFixed(1)}/8 –{" "}
                  {ohToLabel(speciesOH, t)}{" "}
                  <span style={{ opacity: 0.7 }}>
                    {t(
                      "basedOnN",
                      `perustuu ${speciesCount} havaintoon`
                    ).replace("{{n}}", speciesCount)}
                  </span>
                </span>
              )}
            </li>
          )}
        </ul>
      )}

      <p
        style={{
          fontSize: "0.9em",
          opacity: 0.75,
          marginTop: "0.5em",
        }}
      >
        {t(
          "strikePredictionNote",
          "Ennuste perustuu omiin saalistietoihisi: ilmanpaineen ja ottihalukkuuden väliseen yhteyteen."
        )}
      </p>
    </div>
  );
}
