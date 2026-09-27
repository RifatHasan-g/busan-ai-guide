// Busan AI Guide — frontend (Hasan Rifat, 2026512896)
const $ = (s) => document.querySelector(s);

/* ---------- tiny safe Markdown renderer ---------- */
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
function md(text) {
  const lines = escapeHTML(text).split(/\r?\n/);
  let html = "", list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { close(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else if (!line.trim()) { close(); }
    else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return html;
}

async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

/* ---------- tabs ---------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
  tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length]);
    if (e.key === "ArrowLeft") selectTab(tabs[(i - 1 + tabs.length) % tabs.length]);
  });
});

/* ---------- live Busan data ---------- */
const ICONS = (c) =>
  c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : c <= 82 ? "🌦️" : c <= 86 ? "🌨️" : "⛈️";

function aqiInfo(aqi) {
  if (aqi == null) return { label: "n/a", color: "#999" };
  if (aqi <= 50) return { label: "Good", color: "#3a9d6a" };
  if (aqi <= 100) return { label: "Moderate", color: "#e0b400" };
  if (aqi <= 150) return { label: "Unhealthy for some", color: "#d98e04" };
  return { label: "Unhealthy", color: "#c0392b" };
}

async function loadBusan() {
  try {
    const b = await api("/api/busan");
    const w = b.weather;
    const aq = aqiInfo(b.air?.aqi);
    const time = b.updated?.slice(11, 16);
    let sentence = `<span class="temp">${Math.round(w.temp)}°C</span>${w.text} over the city, feels like ${Math.round(w.feelsLike)}°C.`;
    if (b.sea) sentence += ` Haeundae water is ${b.sea.seaTemp}°C with ${b.sea.waveHeight} m waves.`;
    $("#nowSentence").innerHTML = sentence;

    const stats = [
      ["Humidity", `${w.humidity}%`],
      ["Wind", `${w.wind} km/h`],
      ["Air quality", b.air ? `<span class="aqi-dot" style="background:${aq.color}"></span>${aq.label}` : "n/a"],
      ["PM2.5", b.air ? `${b.air.pm25} µg/m³` : "n/a"],
      ["Sunset", b.sunset?.slice(11) || "n/a"],
      ["Updated", time ? `${time} KST` : "n/a"],
    ];
    $("#nowStats").innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    $("#forecast").innerHTML = b.forecast
      .map((f, i) => {
        const d = new Date(f.date + "T12:00:00+09:00");
        const name = i === 0 ? "Today" : days[d.getDay()];
        return `<li><span class="fday">${name}</span><span class="ficon" role="img" aria-label="${f.text}">${ICONS(f.code)}</span>${Math.round(f.max)}° / ${Math.round(f.min)}°<span class="frain">☂ ${f.rainChance ?? 0}%</span></li>`;
      })
      .join("");
  } catch (e) {
    $("#nowSentence").textContent = "Live Busan data could not be loaded. The AI tools still work; refresh the page to try again.";
  }
}

/* ---------- chat ---------- */
const history = [];
const log = $("#chatLog");

function addMsg(role, html) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="bubble">${html}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function sendChat(text) {
  text = (text ?? $("#chatInput").value).trim();
  if (!text) return;
  $("#chatInput").value = "";
  $("#chatSend").disabled = true;
  addMsg("user", escapeHTML(text));
  history.push({ role: "user", content: text });
  const typing = addMsg("bot", '<span class="typing" aria-label="Thinking"><span></span><span></span><span></span></span>');
  try {
    const { reply } = await api("/api/chat", { messages: history });
    history.push({ role: "assistant", content: reply });
    typing.querySelector(".bubble").innerHTML = md(reply);
  } catch (e) {
    history.pop();
    typing.className = "msg error";
    typing.querySelector(".bubble").textContent = e.message;
  } finally {
    $("#chatSend").disabled = false;
    log.scrollTop = log.scrollHeight;
    $("#chatInput").focus();
  }
}
$("#chatSend").addEventListener("click", () => sendChat());
$("#chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
$("#suggestions").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") sendChat(e.target.textContent);
});

/* ---------- planner ---------- */
$("#planBtn").addEventListener("click", async () => {
  const btn = $("#planBtn");
  const out = $("#planOut");
  const interests = [...document.querySelectorAll(".interests input:checked")].map((i) => i.value);
  btn.disabled = true;
  btn.textContent = "Making your plan…";
  out.innerHTML = '<p class="empty">Checking the weather and building your day…</p>';
  try {
    const { plan } = await api("/api/plan", {
      area: $("#planArea").value,
      day: $("#planDay").value,
      budget: $("#planBudget").value,
      people: $("#planPeople").value,
      interests,
    });
    out.innerHTML = md(plan);
  } catch (e) {
    out.innerHTML = `<p class="empty">${escapeHTML(e.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Make my plan";
  }
});

/* ---------- korean ---------- */
function speakKorean(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function translate(text) {
  text = (text ?? $("#koInput").value).trim();
  if (!text) return;
  $("#koInput").value = text;
  const btn = $("#koBtn");
  btn.disabled = true;
  $("#koResult").innerHTML = '<p class="empty">Translating…</p>';
  try {
    const r = await api("/api/korean", { text });
    const ko = escapeHTML(r.korean || "");
    $("#koResult").innerHTML = `
      <div class="ko-card">
        <div class="row"><p class="hangul" lang="ko">${ko}</p></div>
        ${r.bangla_pronunciation ? `<p class="bn" lang="bn">🔊 ${escapeHTML(r.bangla_pronunciation)}</p>` : ""}
        ${r.romanization ? `<p class="rom">${escapeHTML(r.romanization)}${r.english ? ` (“${escapeHTML(r.english)}”)` : ""}</p>` : ""}
        <button class="speak" type="button" id="speakBtn">Play pronunciation</button>
        ${r.tip ? `<p class="tip">💡 ${escapeHTML(r.tip)}</p>` : ""}
      </div>`;
    $("#speakBtn").addEventListener("click", () => speakKorean(r.korean));
  } catch (e) {
    $("#koResult").innerHTML = `<p class="empty">${escapeHTML(e.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}
$("#koBtn").addEventListener("click", () => translate());
$("#koInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); translate(); }
});
$("#koChips").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") translate(e.target.textContent);
});

/* ---------- health ---------- */
api("/api/health")
  .then((h) => {
    const s = $("#aiStatus");
    s.textContent = h.aiConfigured ? `AI online (${h.model})` : "AI key missing on server";
    s.className = h.aiConfigured ? "on" : "off";
  })
  .catch(() => {});

loadBusan();
setInterval(loadBusan, 10 * 60_000);
