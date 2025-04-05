// proxy-server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 5001;

app.use(cors());

app.get("/tideapi", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const apiUrl = `https://api.sehavniva.no/tideapi.php?${params}`;
    const response = await axios.get(apiUrl);
    res.set("Content-Type", "application/xml");
    res.send(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).send("Proxy error: " + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`🌊 Proxy-palvelin käynnissä http://localhost:${PORT}/tideapi`);
});
