import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Saalishistoria = () => {
  const [saaliit, setSaaliit] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("saalisdata") || "[]");
    setSaaliit(data.reverse()); // uusin ensin
  }, []);

  if (saaliit.length === 0) {
    return <p>Ei tallennettuja saaliita vielä.</p>;
  }
  
  return (
    <div> 
      <h2>🎣 Saalishistoria</h2>
      <ul>
        {saaliit.map((s, i) => (
          <li key={i} style={{ marginBottom: "0.5em" }}>
            <strong>{new Date(s.aika).toLocaleString()}</strong> – {s.laji} ({s.maara} kpl / {s.paino} kg) {s.cr ? `(C&R: ${s.cr})` : ""} @ {s.paikka}
	
          </li>
        ))}
      </ul>
	<button onClick={() => navigate("/")} style={{ marginTop: "1.5em", padding: "0.5em" }}>
  🔙 Palaa ennusteeseen
</button>
      
    </div>

  );
};

export default Saalishistoria;
