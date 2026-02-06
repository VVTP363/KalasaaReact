import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeSpecies } from "../utils/species";

export default function ClearHistoryButton() {
  const { t, i18n } = useTranslation();

  const [showDialog, setShowDialog] = useState(false);

  // oletukset kuten kuvassa: CSV + historia päällä, yhteenveto pois
  const [exportCSV, setExportCSV] = useState(true);
  const [clearHistory, setClearHistory] = useState(true);
  const [clearSummary, setClearSummary] = useState(false);

  // ✅ UUSI: oppimisalusta (vältä tätä) — oletuksena pois
  const [clearLearning, setClearLearning] = useState(false);
  const handleClear = () => setShowDialog(true);

  // ---- keyt (pidä nämä yhdessä paikassa) ----
  const HISTORY_KEYS = ["virtavesisaaliit", "jarvisaaliit", "saaliit"]; // saaliit varmuuden vuoksi jos jossain vanhaa
  const SUMMARY_KEYS = [
    "virtavesisaaliit_stats",
    "jarvisaaliit_stats",
    "saaliit_stats",
    "virtavesiSummary",
    "jarvivesiSummary",
  ];

  // Oppimisalusta: suositus = pidä kaikki oppimisavaimet prefiksillä,
  // jolloin poistaminen on turvallista eikä “vahingossa katoa muuta”.
  const LEARNING_PREFIXES = ["learn:", "ohlearn:", "model:"];

  const safeParse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

const csvFishLabelRiver = (item) => {
  const kind = String(item?.kind || "").toLowerCase();
  const isSessionRow = item?.isSession === true || kind === "session";
  const isNoTargetRow =
    item?.isTargetNone === true ||
    String(item?.targetOutcome || "").toLowerCase() === "none" ||
    item?.species === "__none__" ||
    item?.species === "none";

  const raw = isSessionRow || isNoTargetRow
    ? (item?.targetSpecies || item?.species || item?.laji || "")
    : (item?.species || item?.laji || "");

  const clean = String(raw || "").trim();
  if (!clean || clean === "__none__" || clean === "none" || clean === "-") return "";

  // ✅ tärkein: käytä samaa fish.<key> -avainta kuin historiassa
  return t(`fish.${clean}`, { defaultValue: clean });
};

const pickLang = (item) => {
  const l = item?.kieli ?? item?.lang ?? item?.language ?? "";
  return String(l || i18n.language || "fi");
};

  // CSV escape: " -> "" ja aina lainausmerkit ympärille
  const csvCell = (v) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const buildCSV = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

  const downloadTextFile = (filename, text, mime = "text/csv;charset=utf-8") => {
    const blob = new Blob(["\uFEFF" + text], { type: mime }); // BOM
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const emitUpdated = () => {
    try {
      window.dispatchEvent(new Event("catchesUpdated"));
    } catch {}
  };

const exportLng = () => String(i18n?.resolvedLanguage || i18n?.language || "fi");

const csvFishLabel = (item) => {
  const raw = item?.species ?? item?.laji ?? item?.targetSpecies ?? "";
  const sp = normalizeSpecies(raw) || raw;
  const tt = i18n.getFixedT(exportLng());
  return tt(`fish.${sp}`, { defaultValue: raw || sp });
};

const csvTargetFishLabel = (item) => {
  const raw = item?.targetSpecies ?? "";
  const sp = normalizeSpecies(raw) || raw;
  const tt = i18n.getFixedT(exportLng());
  return tt(`fish.${sp}`, { defaultValue: raw || sp });
};

  const executeClear = () => {
    // 0) oppimisalusta varmistus (koska “vältä tätä”)
    if (clearLearning) {
      const ok = window.confirm(
        t("clearDialog.learningConfirm", {
          defaultValue:
            "Haluatko varmasti tyhjentää oppimisalustan? Tämä heikentää ennusteen oppimista.",
        })
      );
      if (!ok) return;
    }

    const csvRiverSpeciesLabel = (item) => {
    const raw =
    item.species ?? item.laji ?? item.targetSpecies ?? item.target ?? "";

    const key = normalizeSpecies(raw || "");
    if (!key) return "";

    // UI-kielen mukaan (sama kuin historiassa)
    return t(`fish.${key}`, { defaultValue: key });
  };

    // 1) CSV-vienti (ennen tyhjennystä)
    if (exportCSV) {
      const river = safeParse("virtavesisaaliit");
      const lake = safeParse("jarvisaaliit"); // ✅ nykyinen järvi/meri historia
      const lakeLegacy = safeParse("saaliit"); // varmuuden vuoksi, jos vanhaa dataa vielä

      const csvRows = [
        [
          "Aika",
          "Tyyppi",
          "Laji",
          "Kpl",
          "Paino (kg)",
          "Pituus",
          "C&R",
          "Kieli",
          "Paine (hPa)",
          "OH_ennuste",
          "OH_toteuma",
          "OH_suhde",
          "Tuuli",
          "Kuu",
          "Kuu_avain",
          "Arviointi",
          "TargetLaji",
          "TargetOutcome",
        ],
      ];

      // Virtavesi
      river.forEach((item) => {
  const m = Number(item.ohMatchFactor);
  const ratio = Number.isFinite(m) ? m.toFixed(2) : "";

  const aika =
    `${item.date ?? ""} ${item.time ?? ""}`.trim() ||
    (item.aika ?? "");

  const raw = String(item?.species ?? item?.laji ?? item?.targetSpecies ?? "").trim();

  // ✅ tärkein: ota speciesKey jos löytyy, muuten normalisoi raw
  const key = String(item?.speciesKey || normalizeSpecies(raw) || "").trim();

  // ✅ käännä aina key:stä
  const speciesLabel = key
    ? tt(`fish.${key}`, { defaultValue: raw || key })
    : (raw || "");

  csvRows.push([
    aika,
    tt("water.river", { defaultValue: "Virtavesi" }),

    // ✅ tähän se kalannimi (ei csvFishLabel tähän väliin)
    speciesLabel,

    // jos tämä sarake on tarkoitettu jollekin muulle, pidä,
    // mutta jos se on "toinen kalannimi", se sotkee testauksen.
    // Suosittelen tilapäisesti laittaa tähän tyhjäksi:
    // csvFishLabel(item),
    "",

    item.amount ?? item.maara ?? "",
    item.weight ?? item.paino ?? "",
    item.length ?? item.pituus ?? item.lengthClass ?? "",
    item.cr ?? item.crCount ?? "",
    exportLng(),
    item.pressure ?? item.pressure_hPa ?? "",
    item.riverOH ?? item.oh ?? item.fishingInterest ?? "",
    item.realizedOH ?? "",
    ratio,
    item.windDirection ?? item.windText ?? item.windHuman ?? "",
    item.moonPhase ??
      (item.moonEmoji && item.moonPhaseKey ? `${item.moonEmoji} ${item.moonPhaseKey}` : ""),
    item.moonPhaseKey ?? "",
    item.rating ?? item.ratingDisplay ?? item.feedback ?? item.arvio ?? "",
    csvTargetFishLabel(item),
    item.targetOutcome ?? "",
  ]);
});

      // Järvi/Meri (nykyinen)
      const pushLakeRows = (arr) => {
        arr.forEach((item) => {
          const m = Number(item.ohMatchFactor);
          const ratio = Number.isFinite(m) ? m.toFixed(2) : "";

          const aika =
            item.aika ??
            (item.date ? `${item.date} ${item.time ?? ""}`.trim() : "") ??
            "";

          const ohForecast =
            item.fishingInterest ??
            item.oh ??
            (item.ohDisplay ? String(item.ohDisplay).replace("/8", "") : "");

          csvRows.push([
            aika,
            "Järvi/Meri",
            item.speciesDisplay ?? item.laji ?? item.species ?? item.targetSpecies ?? "",
            item.maara ?? item.amount ?? "",
            item.paino ?? item.weightKg ?? item.weight ?? "",
            item.pituus ?? item.lengthClass ?? item.length ?? "",
            item.cr ?? item.crCount ?? "",
            item.lang ?? item.kieli ?? "fi",
            item.pressure ?? item.pressure_hPa ?? item.pressureDisplay ?? "",
            ohForecast ?? "",
            item.realizedOH ?? "",
            ratio,
            item.windHuman ?? item.windText ?? "",
            item.moonPhase ??
              (item.moonEmoji && item.moonPhaseKey ? `${item.moonEmoji} ${item.moonPhaseKey}` : ""),
            item.moonPhaseKey ?? "",
            item.ratingDisplay ?? item.arvio ?? item.catchRating ?? "",
            item.targetSpecies ?? "",
            item.targetOutcome ?? "",
          ]);
        });
      };

      pushLakeRows(lake);

      // myös legacy “saaliit” jos siellä on vielä jotain
      if (lakeLegacy.length) pushLakeRows(lakeLegacy);

      if (csvRows.length > 1) {
        const csvText = buildCSV(csvRows);
        downloadTextFile("saalishistoria_virtavesi_jarvimeri.csv", csvText);
      }
    }

    // 2) Tyhjennykset
    if (clearHistory) {
      HISTORY_KEYS.forEach((k) => localStorage.removeItem(k));
    }

    if (clearSummary) {
      SUMMARY_KEYS.forEach((k) => localStorage.removeItem(k));
    }

    if (clearLearning) {
      // poistetaan vain prefiksillä → ei “vahinko-tyhjennystä”
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (LEARNING_PREFIXES.some((p) => key.startsWith(p))) {
          localStorage.removeItem(key);
        }
      }
    }

    emitUpdated();
    setShowDialog(false);
  };

  return (
    <>
      <button
        onClick={handleClear}
        style={{
          padding: "6px 10px",
          backgroundColor: "#dc3545",
          color: "white",
          fontSize: "14px",
          border: "1px solid #b02a37",
          borderRadius: "5px",
          cursor: "pointer",
          height: "36px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        🧹 {t("clear", "Tyhjennä")}
      </button>

      {showDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowDialog(false)}
        >
          <div
            style={{
              background: "white",
              padding: 20,
              borderRadius: 8,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("clearDialog.title", "Tyhjennetään tietoja")}</h3>

            <label>
              <input
                type="checkbox"
                checked={exportCSV}
                onChange={() => setExportCSV(!exportCSV)}
              />
              &nbsp;{t("clearDialog.exportCsv", "Vie CSV ennen tyhjennystä")}
            </label>

            <br />

            <label>
              <input
                type="checkbox"
                checked={clearHistory}
                onChange={() => setClearHistory(!clearHistory)}
              />
              &nbsp;{t("clearDialog.clearHistory", "Tyhjennä Historia")}
            </label>

            <br />

            <label>
              <input
                type="checkbox"
                checked={clearSummary}
                onChange={() => setClearSummary(!clearSummary)}
              />
              &nbsp;{t("clearDialog.clearSummary", "Tyhjennä Yhteenveto")}
            </label>

            <br />

            {/* ✅ UUSI: oppimisalusta */}
            <label>
              <input
                type="checkbox"
                checked={clearLearning}
                onChange={() => setClearLearning(!clearLearning)}
              />
              &nbsp;{t("clearDialog.clearLearning", "Tyhjennä oppimisalusta")}{" "}
              <span style={{ opacity: 0.65 }}>
                ({t("clearDialog.avoid", "vältä tätä")})
              </span>
            </label>

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button
                onClick={executeClear}
                style={{
                  backgroundColor: "#d9534f",
                  color: "white",
                  padding: "6px 12px",
                  border: "none",
                  borderRadius: 4,
                }}
              >
                {t("clearDialog.execute", "Suorita")}
              </button>

              <button
                onClick={() => setShowDialog(false)}
                style={{ padding: "6px 12px" }}
              >
                {t("clearDialog.cancel", "Peruuta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}