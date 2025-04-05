
import React, { createContext, useState } from "react";

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [pressure, setPressure] = useState(1013);
  const [moonPhase, setMoonPhase] = useState("🌑 Uusikuu");
  const [windDirection, setWindDirection] = useState("Pohjoinen");

  return (
    <AppContext.Provider value={{ pressure, setPressure, moonPhase, setMoonPhase, windDirection, setWindDirection }}>
      {children}
    </AppContext.Provider>
  );
};
