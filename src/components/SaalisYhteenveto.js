import React, { useEffect, useState } from "react";
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

const SaalisYhteenveto = () => {
  const [data, setData] = useState([]);
const navigate = useNavigate();
  useEffect(() => {
    const raw = JSON.parse(localStorage.getItem("saalisdata") || "[]");
    const summary = {};

    raw.forEach(({ laji, maara, paino }) => {
      if (!summary[laji]) summary[laji] = { laji, maara: 0, paino: 0 };
      summary[laji].maara += Number(maara);
      summary[laji].paino += Number(paino);
    });

    setData(Object.values(summary));
  }, []);

  if (data.length === 0) {
    return <p>Ei riittävästi dataa kaavion luomiseen.</p>;
  }

  return (
    <div>
      <h2>📊 Saalisyhteenveto</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="laji" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="maara" name="Kappalemäärä" fill="#82ca9d" />
          <Bar dataKey="paino" name="Yhteispaino (kg)" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
	<button onClick={() => navigate("/")} style={{ marginTop: "1.5em", padding: "0.5em" }}>
  🔙 Palaa ennusteeseen
</button>

    </div>
  );
};

export default SaalisYhteenveto;
