import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./components/AppContext.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

window.addEventListener("error", e => {
  console.error("💥 window.onerror:", e.message, e.error);
});
window.addEventListener("unhandledrejection", e => {
  console.error("💥 unhandledrejection:", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider> {/* <-- tämä käärii Appin kontekstiin */}
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);