let weatherAbortCtrl = null;
let weatherSeq = 0;
let weatherRunId = 0;

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
    const weatherWrap = document.getElementById('weather');

    if (!items.length) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      applyBorder(null);

      // 👇 REVEAL weather and exit takeover mode
      banner.classList.remove('has-warning');
      if (weatherWrap) weatherWrap.hidden = false;
      return;
    }

    // …existing max severity logic…
    let max = (envelopeMaxSeverity ? normaliseSeverity(envelopeMaxSeverity) : null);
    if (!max) {
      const rank = { red:3, amber:2, yellow:1 };
      max = items.reduce((acc, w) => {
        const sev = normaliseSeverity(w?.severity);
        return (rank[sev] || 0) > (rank[acc] || 0) ? sev : acc;
      }, null);
    }
    applyBorder(max);

    // 👇 ENTER takeover mode: hide weather, stretch warnings
    banner.classList.add('has-warning');
    if (weatherWrap) weatherWrap.hidden = true;

    listEl.innerHTML = '';
    items.slice(0,5).forEach(w => {
      const sev = normaliseSeverity(w?.severity);
      const sevClass = sev === 'red' ? 'warning-red' :
                      (sev === 'amber') ? 'warning-amber' : 'warning-yellow';
      const icon = sev === 'red' ? '🛑' : '⚠️';

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
  }  catch (e) {
    // On error, hide the list and clear the border
    listEl.hidden = true;
    emptyEl.hidden = false;
    applyBorder(null);

    // 👇 EXIT takeover mode on error as well
    banner.classList.remove('has-warning');
    const weatherWrap = document.getElementById('weather');
    if (weatherWrap) weatherWrap.hidden = false;
  }
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