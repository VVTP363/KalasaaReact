import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const SaalisTabs = () => {
  const [activeTab, setActiveTab] = useState("historia");
  const [saaliit, setSaaliit] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("saalisdata") || "[]");
    setSaaliit(data.reverse());
  }, []);

  const yhteenvetoData = saaliit.reduce((acc, { laji, maara, paino }) => {
    if (!acc[laji]) acc[laji] = { laji, maara: 0, paino: 0 };
    acc[laji].maara += Number(maara);
    acc[laji].paino += Number(paino);
    return acc;
  }, {});

  const yhteenveto = Object.values(yhteenvetoData);

  const lataaCSV = () => {
    const otsikot = ["Aika", "Paikka", "Laji", "Määrä", "Paino", "C&R", "Ilmanpaine", "Tuulensuunta", "Kuun asema"];
    const rivit = saaliit.map(s => [
      new Date(s.aika).toLocaleString(),
      s.paikka,
      s.laji,
      s.maara,
      s.paino,
      s.cr || 0,
      s.ilmanpaine || "",
      s.tuulensuunta || "",
      s.kuu || ""
    ]);
    const csv = [otsikot, ...rivit]
      .map(rivi => rivi.map(kentta => `"${String(kentta).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "saalisdata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <h2>🎣 Saalistiedot</h2>
      <div style={{ display: "flex", gap: "1em", marginBottom: "1em" }}>
        <button onClick={() => setActiveTab("historia")}>📋 Historia</button>
        <button onClick={() => setActiveTab("yhteenveto")}>📊 Yhteenveto</button>
        <button onClick={lataaCSV}>📁 Lataa CSV</button>
      </div>

      {activeTab === "historia" && (
        <div>
          {saaliit.length === 0 ? (
            <p>Ei tallennettuja saaliita vielä.</p>
          ) : (
            <ul>
              {saaliit.map((s, i) => (
                <li key={i} style={{ marginBottom: "0.5em" }}>
                  <strong>{new Date(s.aika).toLocaleString()}</strong> – {s.laji} ({s.maara} kpl / {s.paino} kg)
                  {s.cr ? ` (C&R: ${s.cr})` : ""} @ {s.paikka}
                  {s.ilmanpaine || s.tuulensuunta || s.kuu ? (
                    <div style={{ fontSize: "0.9em", color: "#555" }}>
                      {s.ilmanpaine && `Ilmanpaine: ${s.ilmanpaine} hPa`} {s.tuulensuunta && `| Tuuli: ${s.tuulensuunta}`} {s.kuu && `| Kuu: ${s.kuu}`}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "yhteenveto" && (
        <div>
          {yhteenveto.length === 0 ? (
            <p>Ei riittävästi dataa kaavion luomiseen.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yhteenveto}>
                <XAxis dataKey="laji" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="maara" name="Kappalemäärä" fill="#82ca9d" />
                <Bar dataKey="paino" name="Yhteispaino (kg)" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <button onClick={() => navigate("/")} style={{ marginTop: "2em", padding: "0.5em" }}>
        🔙 Palaa ennusteeseen
      </button>
    </div>
  );
};

export default SaalisTabs;
