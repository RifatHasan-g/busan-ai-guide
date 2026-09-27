// Busan AI Guide — Assignment 1 (Render cloud service with an AI feature)
// Student: Hasan Rifat | ID: 2026512896 | Global IT Engineering, Kyungsung University
//
// Backend responsibilities
//   1. /api/busan   -> live Busan weather, air quality and sea conditions (Open-Meteo, no key needed)
//   2. /api/chat    -> AI Busan guide chat (Google Gemini API, key kept secret on the server)
//   3. /api/plan    -> AI one-day trip planner that uses the live Busan weather
//   4. /api/korean  -> AI Korean phrase helper with Bangla-script pronunciation
//   5. /api/health  -> health check for Render

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- tiny .env loader (only used locally; on Render set env vars in the dashboard) ----
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const STUDENT = {
  name: "Hasan Rifat",
  id: "2026512896",
  department: "Department of Global IT Engineering",
  university: "Kyungsung University, Busan",
};

// Busan coordinates
const BUSAN = { lat: 35.1796, lon: 129.0756 };        // city centre
const HAEUNDAE = { lat: 35.1587, lon: 129.1604 };     // Haeundae beach (sea data)

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------- simple in-memory rate limit (per IP) ----------------
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  const now = Date.now();
  const windowMs = 60_000, max = 15;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    return res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
  }
  list.push(now);
  hits.set(ip, list);
  next();
}

// ---------------- Busan live data (Open-Meteo) ----------------
const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Severe thunderstorm",
};

let busanCache = { data: null, at: 0 };

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

async function getBusanData() {
  if (busanCache.data && Date.now() - busanCache.at < 10 * 60_000) return busanCache.data;

  const weatherURL =
    `https://api.open-meteo.com/v1/forecast?latitude=${BUSAN.lat}&longitude=${BUSAN.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&timezone=Asia%2FSeoul&forecast_days=5`;
  const airURL =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${BUSAN.lat}&longitude=${BUSAN.lon}` +
    `&current=pm10,pm2_5,us_aqi&timezone=Asia%2FSeoul`;
  const seaURL =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${HAEUNDAE.lat}&longitude=${HAEUNDAE.lon}` +
    `&current=wave_height,sea_surface_temperature&timezone=Asia%2FSeoul`;

  const [w, a, s] = await Promise.allSettled([fetchJSON(weatherURL), fetchJSON(airURL), fetchJSON(seaURL)]);
  if (w.status !== "fulfilled") throw new Error("Weather service unavailable");

  const cur = w.value.current;
  const d = w.value.daily;
  const data = {
    updated: cur.time,
    weather: {
      temp: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      precipitation: cur.precipitation,
      code: cur.weather_code,
      text: WEATHER_CODES[cur.weather_code] || "Unknown",
    },
    air: a.status === "fulfilled"
      ? { pm10: a.value.current.pm10, pm25: a.value.current.pm2_5, aqi: a.value.current.us_aqi }
      : null,
    sea: s.status === "fulfilled"
      ? { waveHeight: s.value.current.wave_height, seaTemp: s.value.current.sea_surface_temperature }
      : null,
    forecast: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      text: WEATHER_CODES[d.weather_code[i]] || "Unknown",
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rainChance: d.precipitation_probability_max[i],
    })),
    sunrise: d.sunrise[0],
    sunset: d.sunset[0],
  };
  busanCache = { data, at: Date.now() };
  return data;
}

function busanContext(b) {
  if (!b) return "Live Busan data is currently unavailable.";
  const w = b.weather;
  let t = `Live Busan conditions (${b.updated} KST): ${w.text}, ${w.temp}°C (feels ${w.feelsLike}°C), ` +
    `humidity ${w.humidity}%, wind ${w.wind} km/h.`;
  if (b.air) t += ` Air quality: US AQI ${b.air.aqi}, PM2.5 ${b.air.pm25} µg/m³.`;
  if (b.sea) t += ` Haeundae sea: waves ${b.sea.waveHeight} m, water ${b.sea.seaTemp}°C.`;
  t += ` Sunset today ${b.sunset?.slice(11)}. Next days: ` +
    b.forecast.slice(1, 4).map((f) => `${f.date} ${f.text} ${f.min}-${f.max}°C rain ${f.rainChance}%`).join("; ");
  return t;
}

app.get("/api/busan", async (_req, res) => {
  try {
    res.json(await getBusanData());
  } catch (e) {
    res.status(502).json({ error: "Could not load live Busan data right now." });
  }
});

// ---------------- Gemini helper ----------------
async function askGemini({ system, messages, temperature = 0.7, maxTokens = 1200 }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("GEMINI_API_KEY is not set on the server.");
    err.status = 500;
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content).slice(0, 2000) }],
      })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || `Gemini error ${r.status}`);
    err.status = r.status === 429 ? 429 : 502;
    throw err;
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw Object.assign(new Error("The AI returned an empty answer. Try rephrasing."), { status: 502 });
  return text.trim();
}

function sendAIError(res, e) {
  console.error("[AI]", e.message);
  res.status(e.status || 500).json({ error: e.message });
}

const BASE_PERSONA =
  "You are 'Busan AI Guide', a friendly local expert on Busan, South Korea, built by Hasan Rifat " +
  "(student ID 2026512896, Global IT Engineering, Kyungsung University) as a cloud-service assignment. " +
  "Give practical, accurate, concise answers: places, food, subway lines (Busan Metro lines 1-4), buses, " +
  "costs in KRW, culture, and student life. Use the live data below when weather matters. " +
  "If you are unsure of a fact (opening hours, prices), say so and suggest checking. Use short Markdown " +
  "(bold, bullet lists, ### headings). Reply in the same language the user writes in.";

// ---------------- AI chat ----------------
app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];
    if (!history.length) return res.status(400).json({ error: "Message is empty." });
    let live = null;
    try { live = await getBusanData(); } catch {}
    const reply = await askGemini({
      system: `${BASE_PERSONA}\n\n${busanContext(live)}`,
      messages: history,
    });
    res.json({ reply });
  } catch (e) { sendAIError(res, e); }
});

// ---------------- AI trip planner ----------------
app.post("/api/plan", rateLimit, async (req, res) => {
  try {
    const { area = "Anywhere in Busan", budget = "Medium", interests = [], people = "1", day = "today" } = req.body || {};
    let live = null;
    try { live = await getBusanData(); } catch {}
    const prompt =
      `Plan a one-day Busan itinerary for ${day}.\n` +
      `Base area: ${area}. Budget: ${budget}. Group size: ${people}. ` +
      `Interests: ${[].concat(interests).join(", ") || "general sightseeing"}.\n` +
      `Adapt to the weather (indoor options if rainy, poor air or very hot/cold). Structure:\n` +
      `### Weather verdict (1-2 lines)\n### Morning / ### Afternoon / ### Evening (each: place, why, how to get there by subway/bus, rough cost in KRW)\n` +
      `### Food to try (3 items)\n### Estimated total cost\nKeep it under 350 words.`;
    const plan = await askGemini({
      system: `${BASE_PERSONA}\n\n${busanContext(live)}`,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      maxTokens: 1500,
    });
    res.json({ plan });
  } catch (e) { sendAIError(res, e); }
});

// ---------------- AI Korean phrase helper ----------------
app.post("/api/korean", rateLimit, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Type a phrase first." });
    const system =
      "You translate short phrases into natural, polite Korean (해요체) for someone living in Busan. " +
      "Return ONLY valid JSON, no markdown fences, with keys: " +
      `{"korean": "...", "romanization": "...", "bangla_pronunciation": "Korean sound written in Bangla script", ` +
      `"english": "English meaning", "tip": "one short usage tip (e.g. Busan dialect or politeness)"}`;
    const raw = await askGemini({
      system,
      messages: [{ role: "user", content: text.slice(0, 300) }],
      temperature: 0.3,
      maxTokens: 400,
    });
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)); }
    catch { return res.json({ korean: clean }); }
    res.json(parsed);
  } catch (e) { sendAIError(res, e); }
});

// ---------------- meta ----------------
app.get("/api/student", (_req, res) => res.json(STUDENT));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, aiConfigured: Boolean(GEMINI_API_KEY), model: GEMINI_MODEL, time: new Date().toISOString() })
);

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Busan AI Guide running on port ${PORT}`));
