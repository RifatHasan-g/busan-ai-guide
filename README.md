# 부산 Busan AI Guide

**Assignment 1 — Render-based cloud service with an AI feature**
**Student:** Hasan Rifat  |  **ID:** 2026512896  |  Department of Global IT Engineering, Kyungsung University

A cloud web service deployed on **Render** that combines **live Busan data** with **Google Gemini AI**.

## Features
| Feature | What it does | API used |
|---|---|---|
| Busan right now | Live temperature, air quality (PM2.5 / AQI), Haeundae sea temperature & waves, sunset, 5-day forecast | Open-Meteo Weather, Air Quality & Marine APIs (free, no key) |
| Ask the guide | AI chat about places, food, transport and culture in Busan. The live weather is given to the AI, so answers fit today's conditions | Google Gemini API |
| Plan my day | AI one-day itinerary by area, budget, group size and interests — switches to indoor spots when it rains or the air is bad | Google Gemini API + Open-Meteo |
| Korean phrases | Translates English/Bangla into polite Korean with Bangla-script pronunciation, romanization, a usage tip and audio playback | Google Gemini API + browser speech |

The Gemini key stays on the server (never sent to the browser).

## Tech stack
Node.js 18+, Express, vanilla HTML/CSS/JS. Hosted on Render (free web service).

## Run locally
```bash
npm install
cp .env.example .env      # then put your Gemini key in .env
npm start                 # http://localhost:3000
```

## Deploy on Render
1. Push this repo to GitHub.
2. Render dashboard → **New → Web Service** → connect the repo.
3. Runtime: **Node** · Build command: `npm install` · Start command: `npm start` · Plan: **Free**.
4. **Environment** → add `GEMINI_API_KEY` = your key (free at https://aistudio.google.com/apikey).
5. Deploy. Check `https://<your-app>.onrender.com/api/health` → `"aiConfigured": true`.

## API endpoints
- `GET /api/busan` – live Busan conditions (cached 10 min)
- `POST /api/chat` – `{ messages: [{role, content}] }`
- `POST /api/plan` – `{ area, day, budget, people, interests[] }`
- `POST /api/korean` – `{ text }`
- `GET /api/health` – status for Render

AI code was written with the help of generative AI tools, as allowed for this course.
