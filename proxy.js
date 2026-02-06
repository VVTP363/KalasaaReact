// proxy.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors()); // Sallii pyynnöt frontendiltä

app.get("/tide", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon parameters" });
  }

  const date = new Date().toISOString().split('T')[0];
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:00Z`;
  const url = `https://api.sehavniva.no/tideapi.php?lat=${lat}&lon=${lon}&fromtime=${from}&totime=${to}&datatype=tab&refcode=CD&place=&file=&lang=nb&interval=10&dst=0&tzone=1&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "KalasääApp/1.0 (kalastaja@kalasaapp.fi)"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `API error: ${response.statusText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({ error: "Tide proxy failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🌊 Tide proxy running at http://localhost:${PORT}/tide?lat=70.6&lon=29.5`);
});
