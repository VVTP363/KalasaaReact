// index.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = 5001;

app.get("/tideapi", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon parameters" });
  }

  try {
    const response = await axios.get(
      `https://api.met.no/weatherapi/tideforecast/2.0/.json?lat=${lat}&lon=${lon}`,
      {
        headers: {
          "User-Agent": "KalasääApp/1.0 teemu@kalastaja.fi"
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("❗ Proxy error:", error.message);
    res.status(500).json({ error: "Tide data fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🌊 SeHavniva (Met.no) proxy running at http://localhost:${PORT}`);
});
