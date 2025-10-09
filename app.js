let weatherAbortCtrl = null;
let weatherSeq = 0;
let weatherRunId = 0;

// Time in Europe/London for deterministic 'day' logic
function todayInLondonISO(){
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit'});
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p=>p.type==='year').value;
  const m = parts.find(p=>p.type==='month').value;
  const d = parts.find(p=>p.type==='day').value;
  return `${y}-${m}-${d}`;
}
function dayOfYearLondon(){
  const now = new Date();
  const tz = 'Europe/London';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit'});
  const [y,m,d] = fmt.format(now).split('-').map(Number);
  const today = new Date(Date.UTC(y, m-1, d));
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const diff = (today - jan1) / 86400000;
  return Math.floor(diff) + 1;
}

// Weather widget using Open-Meteo (no API key)
// Format "HH:00" label for Europe/London local time
function formatHourLondon(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(d); // → "13:00"
}

// Weather widget using Open-Meteo (current + next 5 hours for today)

async function loadWeather() {
  const locationEl = document.querySelector('#weather-location');
  const tempEl = document.querySelector('#weather-temp');
  const descEl = document.querySelector('#weather-desc');
  const iconEl = document.querySelector('#weather-icon');
  const hoursEl = document.querySelector('#weather-hours');

  // Track "latest" invocation. Only the latest is allowed to mutate the DOM.
  const myRun = ++weatherRunId;

  // 1) Get coords (don’t clear UI yet)
  let coords;
  try {
    coords = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('No geolocation'));
      const opts = { enableHighAccuracy: false, timeout: 5000, maximumAge: 10 * 60 * 1000 };
      navigator.geolocation.getCurrentPosition(p => resolve(p.coords), reject, opts);
    });
  } catch {
    coords = { latitude: 51.5074, longitude: -0.1278 }; // London fallback
  }

  // 2) Fetch data
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.latitude}&longitude=${coords.longitude}` +
    `&current=temperature_2m,is_day,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&timezone=Europe%2FLondon`;

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    // Only the latest call should surface an error state
    if (myRun !== weatherRunId) return;
    if (tempEl) tempEl.textContent = '--';
    if (descEl) descEl.textContent = 'Unavailable';
    if (iconEl) iconEl.textContent = '⌛';
    if (hoursEl) hoursEl.replaceChildren(
      Object.assign(document.createElement('li'), { textContent: 'Forecast unavailable' })
    );
    return;
  }

  // 3) Build current conditions (pure compute)
  const codeNow = data.current?.weather_code;
  const tempNow = Math.round(data.current?.temperature_2m ?? NaN);
  const now = new Date();

  // 4) Build the “next N hours” list OFF-DOM (spans midnight)
  const N = 6; // show next 6 hours
  const tArr = data.hourly?.time ?? [];
  const tempArr = data.hourly?.temperature_2m ?? [];
  const codeArr = data.hourly?.weather_code ?? [];

  // Find first index >= now in Europe/London
  const tz = 'Europe/London';
  const nowMs = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
      .format(now)
      .replace(',', '')
  ); // coarse align; exact parse not critical since we compare Date(tISO) below

  let startIdx = 0;
  for (let i = 0; i < tArr.length; i++) {
    if (new Date(tArr[i]) >= now) { startIdx = i; break; }
  }

  const lis = [];
  for (let i = startIdx; i < Math.min(startIdx + N, tArr.length); i++) {
    const tISO = tArr[i];
    const t = new Date(tISO);
    const hh = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric' }).format(t);
    const temp = Math.round(tempArr[i]);
    const code = codeArr[i];
    const { label, emoji } = weatherCodeToText(code);

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="h">${hh}:00</span>
      <span class="wx" title="${label}">
        <span aria-hidden="true">${emoji}</span>
        <span class="t">${temp}°</span>
      </span>
    `;
    lis.push(li);
  }

  // 5) COMMIT: only if still the latest run. We update everything atomically.
  if (myRun !== weatherRunId) return;

  if (Number.isFinite(tempNow) && tempEl) tempEl.textContent = `${tempNow}°C`;
  if (descEl && codeNow != null) descEl.textContent = weatherCodeToText(codeNow).label;
  if (iconEl && codeNow != null) iconEl.textContent = weatherCodeToText(codeNow).emoji;
  if (locationEl) locationEl.textContent = 'London' /* or your resolved city if you have one */;

  if (hoursEl) {
    if (lis.length) {
      hoursEl.replaceChildren(...lis);
    } else {
      const fallback = document.createElement('li');
      fallback.textContent = 'Hourly forecast unavailable';
      hoursEl.replaceChildren(fallback);
    }
  }
}

function weatherCodeToText(code){
  const map = {
    0:{label:'Clear', emoji:'☀️'},
    1:{label:'Mainly clear', emoji:'🌤️'},
    2:{label:'Partly cloudy', emoji:'⛅'},
    3:{label:'Overcast', emoji:'☁️'},
    45:{label:'Fog', emoji:'🌫️'},
    48:{label:'Rime fog', emoji:'🌫️'},
    51:{label:'Light drizzle', emoji:'🌦️'},
    53:{label:'Drizzle', emoji:'🌦️'},
    55:{label:'Heavy drizzle', emoji:'🌧️'},
    61:{label:'Light rain', emoji:'🌧️'},
    63:{label:'Rain', emoji:'🌧️'},
    65:{label:'Heavy rain', emoji:'🌧️'},
    71:{label:'Light snow', emoji:'🌨️'},
    73:{label:'Snow', emoji:'🌨️'},
    75:{label:'Heavy snow', emoji:'❄️'},
    80:{label:'Light showers', emoji:'🌦️'},
    81:{label:'Showers', emoji:'🌦️'},
    82:{label:'Heavy showers', emoji:'🌧️'},
    95:{label:'Thunderstorm', emoji:'⛈️'},
    96:{label:'Storm + hail', emoji:'⛈️'},
    99:{label:'Storm + heavy hail', emoji:'⛈️'}
  };
  return map[code] || {label:'Weather', emoji:'🌡️'};
}

async function loadWarnings(){
  const banner  = document.querySelector('.banner');
  const listEl  = document.getElementById('warnings-list');
  const emptyEl = document.querySelector('.warnings-empty');

  const CUSTOM_WARNINGS_URL = 'https://bloomsburydigital.app.n8n.cloud/webhook/9dd226df-261b-4d57-9781-629c56a0776c';

  const applyBorder = (maxSeverity) => {
    banner.classList.remove('warn-yellow','warn-red', 'warn-amber');

    // NEW: global theme hooks
    document.body.classList.remove('theme-warn-yellow','theme-warn-red');

    const s = (maxSeverity || '').toLowerCase();
    if (s.includes('red')) {
      banner.classList.add('warn-red');
      document.body.classList.add('theme-warn-red');   // NEW
    } else if (['yellow'].some(k => s.includes(k))) {
      banner.classList.add('warn-yellow');
      document.body.classList.add('theme-warn-yellow'); // NEW
    } else if (['amber'].some(k => s.includes(k))) {
      banner.classList.add('warn-amber');
      document.body.classList.add('theme-warn-amber'); // NEW
    }
  };

  const normaliseSeverity = (s) => {
    const x = String(s || '').toLowerCase();
    if (x.includes('red')) return 'red';
    if (x.includes('amber') || x.includes('orange')) return 'amber';
    if (x.includes('yellow')) return 'yellow';
    return 'yellow';
  };

  const formatAreas = (areas) => {
    if (!Array.isArray(areas)) return '';
    return areas.map(a => {
      const region = a?.regionName || a?.regionCode || '';
      const subs = Array.isArray(a?.subRegions) && a.subRegions.length ? `: ${a.subRegions.join(', ')}` : '';
      return `${region}${subs}`;
    }).join(' • ');
  };

  const formatWhen = (w) => {
    // Accept a variety of possible fields; your sample has none that are ISO times.
    const start = w.starts || w.start || w.validFrom || w.from || null;
    const end   = w.ends   || w.end   || w.validTo   || w.to   || null;

    const fmt = (v) => {
      // If it looks like a date, try to format; otherwise return as-is
      const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : null;
      return d && !isNaN(d) ? d.toLocaleString('en-GB', { timeZone:'Europe/London' }) : (typeof v === 'string' ? v : '');
    };

    const parts = [start && fmt(start), end && fmt(end)].filter(Boolean);
    return parts.length ? parts.join(' → ') : '';
  };

  const render = (warnings, envelopeMaxSeverity) => {
    const items = Array.isArray(warnings) ? warnings : [];
    if (!items.length) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      applyBorder(null);
      return;
    }

    // Prefer server-provided maxSeverity, else compute
    let max = (envelopeMaxSeverity ? normaliseSeverity(envelopeMaxSeverity) : null);
    if (!max) {
      const rank = { red:3, amber:2, yellow:1 };
      max = items.reduce((acc, w) => {
        const sev = normaliseSeverity(w?.severity);
        return (rank[sev] || 0) > (rank[acc] || 0) ? sev : acc;
      }, null);
    }
    applyBorder(max);

    listEl.innerHTML = '';
    items.slice(0,5).forEach(w => {
      const sev = normaliseSeverity(w?.severity);
      const sevClass = sev === 'red' ? 'warning-red' :
                       (sev === 'amber') ? 'warning-amber' : 'warning-yellow';
      const icon = sev === 'red' ? '🛑' : '⚠️';

      const areasText = formatAreas(w?.areas);
      const whenText  = formatWhen(w);

      //old html that includes area:
      //<div class="icon" aria-hidden="true">${icon}</div>
      //<div class="meta">
        //<div class="title">${w?.headline || w?.event || 'Weather warning'}</div>
        //${whenText  ? `<div class="when">${whenText}</div>` : ``}
        //${areasText ? `<div class="areas">${areasText}</div>` : ``}
      //</div>

      const li = document.createElement('li');
      li.className = `warning-item ${sevClass}`;
      li.innerHTML = `
        <div class="icon" aria-hidden="true">${icon}</div>
        <div class="meta">
          <div class="title">${w?.headline || w?.event || 'Weather warning'}</div>
        </div>
      `;
      listEl.appendChild(li);
    });

    emptyEl.hidden = true;
    listEl.hidden = false;
  };

  try {
    const res = await fetch(CUSTOM_WARNINGS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();

    // Accept either [{...}] or {...}
    let envelope = null;
    if (Array.isArray(j)) {
      // pick the most recently updated item
      envelope = j.slice().sort((a,b) => new Date(b.updated||0) - new Date(a.updated||0))[0] || null;
    } else if (j && typeof j === 'object') {
      envelope = j;
    }

    const warnings = envelope?.warnings;
    if (Array.isArray(warnings)) {
      render(warnings, envelope?.maxSeverity);
      return;
    }

    // If a totally different shape appears, show “none” gracefully
    render([], null);
  } catch (e) {
    // On error, hide the list and clear the border
    listEl.hidden = true;
    emptyEl.hidden = false;
    applyBorder(null);
    // optional: console.error('loadWarnings failed', e);
  }
}


function londonNow() {
  // Get a Date representing current time in Europe/London (DST-safe)
  const now = new Date();
  // Build a YYYY-MM-DDTHH:mm:ss string in London using Intl then parse back
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return new Date(isoLocal);
}

function todayInLondonISO() {
  const d = londonNow();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Optional: ISO week number for nice weekly rotation among multiple candidates
function isoWeekNumber(date) {
  // date: Date in London
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday in current week decides the year
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function weekdayCodeLondon(){
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
  return fmt.format(new Date()).slice(0,3); // e.g., "Mon"
}

// ISO week number (for fair weekly rotation among multiple candidates)
function isoWeekNumberLondon(){
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' });
  const [y,m,d] = fmt.format(new Date()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

// Contact-of-the-day
async function loadContact(){
  const dateISO = todayInLondonISO();
  const dow = weekdayCodeLondon();

  // Avoid stale cache while you’re testing JSON edits
  const res = await fetch('data/contacts.json', { cache: 'no-store' });
  const data = await res.json();

  const nameEl  = document.querySelector('#contact-name');
  const roleEl  = document.querySelector('#contact-role');
  const phoneEl = document.querySelector('#contact-phone');
  const imgEl   = document.querySelector('#contact-photo');

  const roster = Array.isArray(data.roster) ? data.roster : [];
  if (!roster.length) return;

  let chosen = null;

  // 1) Exact-date override if present: assignments: { "YYYY-MM-DD": "slug" }
  if (data.assignments && data.assignments[dateISO]){
    const slug = data.assignments[dateISO];
    chosen = roster.find(r => r.slug === slug) || null;
  }

  // 2) Day-of-week routing (e.g., "Mon","Wed") — your JSON already has this
  if (!chosen){
    const candidates = roster.filter(c =>
      Array.isArray(c.days) && c.days.some(d => d.toLowerCase() === dow.toLowerCase())
    );
    if (candidates.length){
      // Rotate weekly among the candidates for that weekday
      const week = isoWeekNumberLondon();
      chosen = candidates[week % candidates.length];
    }
  }

  // 3) Fallback to deterministic rotation if nothing matched
  if (!chosen){
    const doy = dayOfYearLondon();
    chosen = roster[doy % roster.length];
  }

  // --- Render ---
  nameEl.textContent = chosen.name;
  roleEl.textContent = chosen.role || 'Contact';
  imgEl.src = chosen.photo;
  imgEl.alt = `Headshot of ${chosen.name}`;

  const tel = (chosen.phone || '').replace(/\s+/g,'');
  phoneEl.href = tel ? `tel:${tel}` : '#';
  phoneEl.textContent = chosen.phone || '';
  phoneEl.setAttribute('aria-label', `Call DSL Hotline ${chosen.phone || ''}`);
}

// Slideshow (full-height area below headers) with 30s interval
class Slideshow{
  constructor({duration=30000}={}){
    this.duration = duration;
    this.layerA = document.getElementById('layerA');
    this.layerB = document.getElementById('layerB');
    this.imgA = document.getElementById('slideA');
    this.imgB = document.getElementById('slideB');
    this.active = 'A'; // which layer is showing
    this.timer = null;
    this.pages = [];
    this.index = 0;
  }
  async init(){
    const res = await fetch('data/pages.json');
    const data = await res.json();
    this.pages = (data.pages || []).filter(p => p && p.src);
    if (this.pages.length === 0) return;
    // Start with first slide
    await this.show(0, true);
    this.timer = setInterval(()=>this.next(), this.duration);
    // Resize handler ensures object-fit remains, nothing else needed
  }
  preload(idx){
    return new Promise(resolve=>{
      const img = new Image();
      const p = this.pages[idx];
      img.onload = ()=>resolve(img);
      img.onerror = ()=>resolve(null);
      img.src = p.src;
      img.alt = p.alt || p.title || 'Slide';
      img.title = p.title || '';
    });
  }
  async show(idx, immediate=false){
    const pre = await this.preload(idx);
    const targetLayer = this.active === 'A' ? this.layerB : this.layerA;
    const targetImg = this.active === 'A' ? this.imgB : this.imgA;
    if (pre){
      targetImg.src = pre.src;
      targetImg.alt = pre.alt || 'Slide';
      targetImg.title = pre.title || '';
    }else{
      // If preload failed, still set src; browser will handle error
      const p = this.pages[idx];
      targetImg.src = p.src;
      targetImg.alt = p.alt || p.title || 'Slide';
      targetImg.title = p.title || '';
    }
    // Crossfade
    const showLayer = targetLayer;
    const hideLayer = this.active === 'A' ? this.layerA : this.layerB;
    showLayer.classList.add('active');
    showLayer.setAttribute('aria-hidden','false');
    hideLayer.classList.remove('active');
    hideLayer.setAttribute('aria-hidden','true');
    this.active = this.active === 'A' ? 'B' : 'A';
    this.index = idx;
    if (immediate){
      // Skip fade at first draw
      showLayer.style.transition = 'none';
      showLayer.classList.add('active');
      // Force reflow then restore transition
      requestAnimationFrame(()=>{
        showLayer.offsetHeight; // reflow
        showLayer.style.transition = '';
      });
    }
  }
  async next(){
    if (this.pages.length === 0) return;
    const nextIdx = (this.index + 1) % this.pages.length;
    await this.show(nextIdx);
  }
}

// Run a function now, then again at the top of every hour
function scheduleHourly(fn){
  // run immediately
  fn();

  // wait until the next :00, then run every hour
  const now = new Date();
  const msToNextHour =
    (60 - now.getMinutes()) * 60_000
    - now.getSeconds() * 1_000
    - now.getMilliseconds();

  setTimeout(() => {
    fn(); // fire exactly at the next top-of-hour
    setInterval(fn, 60 * 60 * 1000); // every hour thereafter
  }, Math.max(0, msToNextHour));
}


document.addEventListener('DOMContentLoaded', async ()=>{
  scheduleHourly(async () => {
    await loadWeather();
    await loadWarnings(); // optional, but handy to keep warnings fresh
  });

  loadContact();
  const show = new Slideshow({ duration: 30000 });
  await show.init();

  document.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') show.next();
  });

  // Optional resilience: refresh when the tab becomes visible again
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible') {
      loadWeather();
      loadWarnings();
    }
  });
});