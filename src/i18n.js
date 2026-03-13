import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fi from "./locales/fi/translation.json";
import en from "./locales/en/translation.json";
import sv from "./locales/sv/translation.json";
import no from "./locales/no/translation.json";

const savedLng = localStorage.getItem("app_lang") || "fi";

if (!i18n.isInitialized) {
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

    lng: savedLng,
    fallbackLng: "fi",

    debug: false,

    react: {
      useSuspense: false, // ✅ tärkeä: estää hook-polkujen vaihtumisen
    },

    // (voit pitää nämä, mutta saveMissing voi spämmiä konsolia)
    saveMissing: true,
    missingKeyHandler: (lng, ns, key) => {
      console.warn("❌ Missing i18n key:", key);
    },

    interpolation: { escapeValue: false },
  });
}

export default i18n;
