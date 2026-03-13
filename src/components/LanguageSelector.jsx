import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const LanguageSelector = () => {
  const { t, i18n } = useTranslation();

  const [pendingLang, setPendingLang] = useState(null);
  const [nextLang, setNextLang] = useState(null); // valinta joka odottaa vahvistusta

  const changeLanguage = (e) => {
    const lang = e.target.value;

    if (["en", "sv", "no"].includes(lang)) {
      // ÄLÄ vaihda kieltä vielä – avaa modal ja odota OK
      setNextLang(lang);
      setPendingLang(lang);
    } else {
      // fi: vaihda heti, ja poista oletus
      i18n.changeLanguage(lang);
      localStorage.removeItem("app_lang");
      setPendingLang(null);
      setNextLang(null);
    }
  };

  const saveDefault = () => {
    if (!nextLang) return;

    // nyt vasta vaihdetaan kieli
    i18n.changeLanguage(nextLang);

    // ja tallennetaan oletukseksi
    localStorage.setItem("app_lang", nextLang);

    setPendingLang(null);
    setNextLang(null);
  };

  const cancel = () => {
    // perutaan: ei vaihdeta kieltä, ei tallenneta
    setPendingLang(null);
    setNextLang(null);
  };

  // modaalin kieli = käyttäjän valinta
  const modalLng = pendingLang || i18n.language;

  // ✅ SAFE DEBUG (ei kaada appia)
  const hasBundle =
    typeof i18n?.hasResourceBundle === "function"
      ? i18n.hasResourceBundle("en", "translation")
      : null;

  console.log("i18n.language =", i18n.language);
  console.log("has en bundle =", hasBundle);
  console.log(
    "en langDefault.title =",
    t("langDefault.title", { lng: "en", defaultValue: "Default language" })
  );

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="language-select" style={{ marginRight: "0.5rem" }}>
          {t("language", { defaultValue: "Kieli" })}:
        </label>

        <select id="language-select" value={i18n.language} onChange={changeLanguage}>
          <option value="fi">suomi</option>
          <option value="en">english</option>
          <option value="sv">svenska</option>
          <option value="no">norsk</option>
        </select>
      </div>

      {pendingLang && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={cancel}
        >
          <div
            style={{
              background: "white",
              padding: "14px 16px",
              borderRadius: 10,
              width: 340,
              maxWidth: "92vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {t("langDefault.title", {
                lng: modalLng,
                defaultValue: "Oletuskieli",
              })}
            </div>

            <div style={{ marginBottom: 12 }}>
              {t("langDefault.question", {
                lng: modalLng,
                defaultValue: "Haluatko asettaa tämän oletukseksi?",
              })}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={cancel}>
                {t("langDefault.cancel", {
                  lng: modalLng,
                  defaultValue: "Ei nyt",
                })}
              </button>

              <button type="button" onClick={saveDefault}>
                {t("langDefault.ok", {
                  lng: modalLng,
                  defaultValue: "OK",
                })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LanguageSelector;
