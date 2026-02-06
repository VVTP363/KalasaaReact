import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fi from "./locales/fi/translation.json";
import en from "./locales/en/translation.json";
import sv from "./locales/sv/translation.json";
import no from "./locales/no/translation.json";

const savedLng = localStorage.getItem("app_lang");

i18n.use(initReactI18next).init({
  resources: {
    fi: { translation: fi },
    en: { translation: en },
    sv: { translation: sv },
    no: { translation: no },
  },

  supportedLngs: ["fi", "en", "sv", "no"],
  nonExplicitSupportedLngs: true,
  load: "languageOnly",

  lng: savedLng || "fi",
  fallbackLng: "en",

  debug: true,

  // ⭐ TÄRKEÄT LISÄYKSET
  saveMissing: true,
  missingKeyHandler: (lng, ns, key) => {
    console.warn("❌ Missing i18n key:", key);
  },

  interpolation: { escapeValue: false },
});

export default i18n;
