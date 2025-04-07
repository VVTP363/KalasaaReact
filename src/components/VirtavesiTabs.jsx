// VirtavesiTabs.js
import React, { useState } from "react";
import VirtavesiIlmoitus from "./VirtavesiIlmoitus";

const VirtavesiTabs = () => {
  const [tab, setTab] = useState("ilmoitus");

  const saaliit = JSON.parse(localStorage.getItem("virtavesisaaliit") || "[]");

  const renderYhteenveto = () => {
    const yhteenveto = {};
    saaliit.forEach(({ laji, maara, cr }) => {
      if (!yhteenveto[laji]) yhteenveto[laji] = { kpl: 0, cr: 0 };
      yhteenveto[laji].kpl += maara;
      yhteenveto[laji].cr += cr;
    });

    return (
      <div>
        <h4>📊 Yhteenveto</h4>
        {Object.entries(yhteenveto).map(([laji, data]) => (
          <p key={laji}>{laji}: {data.kpl} kpl ({data.cr} C&R)</p>
        ))}
      </div>
    );
  };

  const exportCSV = () => {
    const rows = [
      ["Aika", "Paikka", "Laji", "Pituus", "Määrä", "C&R"]
    ];
    saaliit.forEach(s => {
      rows.push([s.aika, s.paikka, s.laji, s.pituus, s.maara, s.cr]);
    });
    const csvContent = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "virtavesisaaliit.csv";
    link.click();
  };

  return (
    <div>
      <div style={{ marginBottom: "1em" }}>
        <button onClick={() => setTab("ilmoitus")}>🎣 Ilmoita saalis</button>
        <button onClick={() => setTab("historia")}>📋 Saalishistoria</button>
        <button onClick={() => setTab("yhteenveto")}>📊 Yhteenveto</button>
        <button onClick={exportCSV} style={{ marginLeft: "1em" }}>📁 Vie CSV</button>
      </div>

      {tab === "ilmoitus" && <VirtavesiIlmoitus />}

      {tab === "historia" && (
        <div>
          <h4>📋 Tallennetut saaliit</h4>
          {saaliit.length === 0 ? <p>Ei ilmoituksia.</p> : (
            <ul>
              {saaliit.map((s, i) => (
                <li key={i}>{s.aika.split("T")[0]} – {s.laji} {s.pituus}, {s.maara} kpl ({s.cr} C&R)</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "yhteenveto" && renderYhteenveto()}
    </div>
  );
};

export default VirtavesiTabs;
