
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
async function loadWeather(){
  const locationEl = document.querySelector('#weather-location');
  const tempEl = document.querySelector('#weather-temp');
  const descEl = document.querySelector('#weather-desc');
  const iconEl = document.querySelector('#weather-icon');
  const hoursEl = document.querySelector('#weather-hours');

  let coords;
  try{
    coords = await new Promise((resolve, reject)=>{
      if(!navigator.geolocation) return reject(new Error('No geolocation'));
      const opts = { enableHighAccuracy:false, timeout:5000, maximumAge: 10*60*1000 };
      navigator.geolocation.getCurrentPosition(p=>resolve(p.coords), reject, opts);
    });
  }catch(e){
    coords = { latitude: 51.5074, longitude: -0.1278 }; // London fallback
  }

  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.latitude}&longitude=${coords.longitude}` +
    `&current=temperature_2m,is_day,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&timezone=Europe%2FLondon`;

  try{
    const res = await fetch(url);
    const data = await res.json();

    // ---- Current conditions (existing UI) ----
    const codeNow = data.current.weather_code;
    const tempNow = Math.round(data.current.temperature_2m);
    tempEl.textContent = `${tempNow}°C`;
    const { label, emoji } = weatherCodeToText(codeNow);
    descEl.textContent = label;
    iconEl.textContent = emoji;
    locationEl.textContent = '';

    // ---- Next 5 hours (today only, Europe/London) ----
    if (hoursEl && data.hourly && Array.isArray(data.hourly.time)){
      const now = new Date();
      const todayISO = todayInLondonISO(); // you already have this helper
      const { time, temperature_2m, weather_code } = data.hourly;

      // Build tuples and filter to: time >= now AND same London-calendar day
      const items = time.map((t, i) => ({
        tISO: t,
        temp: Math.round(temperature_2m[i]),
        code: weather_code[i]
      }))
      .filter(obj => {
        const d = new Date(obj.tISO);
        // "today" check in Europe/London using your helper
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' });
        const dISO = fmt.format(d);
        return (new Date(obj.tISO) >= now) && (dISO === todayISO);
      })
      .slice(0, 6);

      // Render
      for (const it of items){
        const { label, emoji } = weatherCodeToText(it.code);
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="h">${formatHourLondon(it.tISO)}</span>
          <span class="wx" title="${label}">
            <span aria-hidden="true">${emoji}</span>
            <span class="t">${it.temp}°</span>
          </span>
        `;
        hoursEl.appendChild(li);
      }

      // Fallback if we crossed midnight and have <5 items left for "today"
      if (hoursEl.children.length === 0){
        hoursEl.innerHTML = '<li><span>Hourly forecast unavailable</span></li>';
      }
    }
  }catch(e){
    tempEl.textContent = '--';
    descEl.textContent = 'Unavailable';
    iconEl.textContent = '⌛';
    if (hoursEl){ hoursEl.innerHTML = '<li><span>Forecast unavailable</span></li>'; }
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

document.addEventListener('DOMContentLoaded', async ()=>{
  loadWeather();
  loadContact();
  const show = new Slideshow({ duration: 30000 }); // 30 seconds
  await show.init();
  // Optional: keyboard controls if connected to a keyboard
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowRight') show.next();
  });
});
