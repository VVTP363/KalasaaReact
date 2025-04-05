// src/App.js
import React from "react";
import { AppProvider } from "./components/AppContext";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Weather from "./components/Weather";
import VirtavesiView from "./components/VirtavesiView";
import Saalishistoria from "./components/Saalishistoria";
import SaalisYhteenveto from "./components/SaalisYhteenveto";
import SaalisTabs from "./components/SaalisTabs";

function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Weather />} />
          <Route path="/virtavedet" element={<VirtavesiView />} />
          <Route path="/saalishistoria" element={<Saalishistoria />} />
          <Route path="/yhteenveto" element={<SaalisYhteenveto />} />
          <Route path="/saaliit" element={<SaalisTabs />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
