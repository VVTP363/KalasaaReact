// VirtavesiIlmoitus.js
import React, { useState } from "react";

const pituudet = {
  Lohi: ["<50 cm", "50–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", "91–100 cm", "101–110 cm", "111–120 cm", "121–130 cm", ">130 cm"],
  Taimen: ["<50 cm", "51–60 cm", "61–70 cm", "71–80 cm", "81–90 cm", ">90 cm"],
  Harjus: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
  Rautu: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"],
  Siika: ["<35 cm", "36–40 cm", "41–45 cm", "46–50 cm", "51–55 cm", "56–60 cm", ">60 cm"]
};

const VirtavesiIlmoitus = () => {
  const [laji, setLaji] = useState("Lohi");
  const [pituus, setPituus] = useState("");
  const [maara, setMaara] = useState(0);
  const [cr, setCr] = useState(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const uusi = {
      aika: new Date().toISOString(),
      paikka: "Virtavesi",
      laji,
      pituus,
      maara,
      cr
    };
    const vanhat = JSON.parse(localStorage.getItem("virtavesisaaliit") || "[]");
    const uudet = [...vanhat, uusi];
    localStorage.setItem("virtavesisaaliit", JSON.stringify(uudet));
    alert("Virtavesisaalis tallennettu!");
    setPituus("");
    setMaara(0);
    setCr(0);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>🎣 Virtavesien saalisilmoitus</h3>
      <label>
        Kalalaji:
        <select value={laji} onChange={(e) => setLaji(e.target.value)} style={{ marginLeft: "0.5em" }}>
          {Object.keys(pituudet).map((kala) => (
            <option key={kala} value={kala}>{kala}</option>
          ))}
        </select>
      </label>
      <br />

      <label>
        Pituusluokka:
        <select
          value={pituus}
          onChange={(e) => setPituus(e.target.value)}
          required
          style={{ marginLeft: "0.5em" }}
        >
          <option value="">Valitse</option>
          {pituudet[laji].map((mitta) => (
            <option key={mitta} value={mitta}>{mitta}</option>
          ))}
        </select>
      </label>
      <br />

      <label>
        Kappalemäärä:
        <input
          type="number"
          min="0"
          value={maara}
          onChange={(e) => setMaara(Number(e.target.value))}
          style={{ marginLeft: "0.5em", width: "5em" }}
        />
      </label>
      <br />

      <label>
        C&R määrä:
        <input
          type="number"
          min="0"
          value={cr}
          onChange={(e) => setCr(Number(e.target.value))}
          style={{ marginLeft: "0.5em", width: "5em" }}
        />
      </label>
      <br />

      <button type="submit">💾 Tallenna</button>
    </form>
  );
};

export default VirtavesiIlmoitus;
