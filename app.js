
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
  // Build midnight in London today and Jan 1st
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit'});
  const [y,m,d] = fmt.format(now).split('-').map(Number);
  const today = new Date(Date.UTC(y, m-1, d));
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const diff = (today - jan1) / 86400000;
  return Math.floor(diff) + 1;
}
// Weather widget using Open-Meteo (no API key)
async function loadWeather(){
  const el = document.querySelector('#weather');
  const locationEl = document.querySelector('#weather-location');
  const tempEl = document.querySelector('#weather-temp');
  const descEl = document.querySelector('#weather-desc');
  const iconEl = document.querySelector('#weather-icon');
  let coords;
  try{
    coords = await new Promise((resolve, reject)=>{
      if(!navigator.geolocation) return reject(new Error('No geolocation'));
      const opts = { enableHighAccuracy:false, timeout: 5000, maximumAge: 10*60*1000 };
      navigator.geolocation.getCurrentPosition(p=>resolve(p.coords), reject, opts);
    });
  }catch(e){
    // Default to London if denied or unsupported
    coords = { latitude: 51.5074, longitude: -0.1278 };
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,is_day,weather_code&timezone=Europe%2FLondon`;
  try{
    const res = await fetch(url);
    const data = await res.json();
    const code = data.current.weather_code;
    const temp = Math.round(data.current.temperature_2m);
    tempEl.textContent = `${temp}°C`;
    const { label, emoji } = weatherCodeToText(code);
    descEl.textContent = label;
    iconEl.textContent = emoji;
    // Reverse-geocode roughly via Nominatim is discouraged rate-wise; keep generic
    locationEl.textContent = 'Local weather';
  }catch(e){
    el.title = String(e);
    tempEl.textContent = '--';
    descEl.textContent = 'Unavailable';
    iconEl.textContent = '⌛';
  }
}
function weatherCodeToText(code){
  // Basic mapping per WMO
  const map = {
    0:{label:'Clear', emoji:'☀️'},
    1:{label:'Mainly clear', emoji:'🌤️'},
    2:{label:'Partly cloudy', emoji:'⛅'},
    3:{label:'Overcast', emoji:'☁️'},
    45:{label:'Fog', emoji:'🌫️'},
    48:{label:'Depositing rime fog', emoji:'🌫️'},
    51:{label:'Light drizzle', emoji:'🌦️'},
    53:{label:'Drizzle', emoji:'🌦️'},
    55:{label:'Heavy drizzle', emoji:'🌧️'},
    56:{label:'Freezing drizzle', emoji:'🌧️'},
    57:{label:'Freezing drizzle', emoji:'🌧️'},
    61:{label:'Light rain', emoji:'🌧️'},
    63:{label:'Rain', emoji:'🌧️'},
    65:{label:'Heavy rain', emoji:'🌧️'},
    66:{label:'Freezing rain', emoji:'🌧️'},
    67:{label:'Freezing rain', emoji:'🌧️'},
    71:{label:'Light snow', emoji:'🌨️'},
    73:{label:'Snow', emoji:'🌨️'},
    75:{label:'Heavy snow', emoji:'❄️'},
    77:{label:'Snow grains', emoji:'❄️'},
    80:{label:'Light showers', emoji:'🌦️'},
    81:{label:'Showers', emoji:'🌦️'},
    82:{label:'Heavy showers', emoji:'🌧️'},
    85:{label:'Snow showers', emoji:'🌨️'},
    86:{label:'Heavy snow showers', emoji:'❄️'},
    95:{label:'Thunderstorm', emoji:'⛈️'},
    96:{label:'Thunderstorm with hail', emoji:'⛈️'},
    99:{label:'Thunderstorm with heavy hail', emoji:'⛈️'}
  };
  return map[code] || {label:'Weather', emoji:'🌡️'};
}
// Render contact-of-the-day
async function loadContact(){
  const dateISO = todayInLondonISO();
  const res = await fetch('data/contacts.json');
  const data = await res.json();
  const card = document.querySelector('#contact-card');
  const nameEl = document.querySelector('#contact-name');
  const roleEl = document.querySelector('#contact-role');
  const phoneEl = document.querySelector('#contact-phone');
  const imgEl = document.querySelector('#contact-photo');
  // Decide who is on duty
  let chosen;
  if (data.assignments && data.assignments[dateISO]){
    const slug = data.assignments[dateISO];
    chosen = data.roster.find(r => r.slug === slug);
  }
  if (!chosen){
    const doy = dayOfYearLondon();
    chosen = data.roster[doy % data.roster.length];
  }
  if (!chosen) return;
  nameEl.textContent = chosen.name;
  roleEl.textContent = chosen.role || 'Contact';
  imgEl.src = chosen.photo;
  imgEl.alt = `Headshot of ${chosen.name}`;
  const tel = (chosen.phone || '').replace(/\s+/g,'');
  phoneEl.href = `tel:${tel}`;
  phoneEl.textContent = chosen.phone || '';
}
// Render Canva pages (from data/pages.json)
async function loadPages(){
  const wrap = document.querySelector('#pages-grid');
  const res = await fetch('data/pages.json');
  const data = await res.json();
  data.pages.forEach((p, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <header>${p.title || 'Page ' + (idx+1)}</header>
      <img src="${p.src}" alt="${p.alt || p.title || 'Canva page'}" loading="lazy" data-full="${p.src}">
      <footer><small>${p.alt || ''}</small><button class="btn open">Open</button></footer>
    `;
    wrap.appendChild(card);
  });
  // Lightbox interactions
  wrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('.open');
    const img = e.target.tagName === 'IMG' ? e.target : null;
    const src = btn ? btn.closest('.card').querySelector('img').dataset.full : (img ? img.dataset.full : null);
    if (src){
      const lb = document.querySelector('#lightbox');
      const lbimg = document.querySelector('#lightbox-img');
      lbimg.src = src;
      lb.classList.add('open');
    }
  });
}
function closeLightbox(){
  document.querySelector('#lightbox').classList.remove('open');
}
document.addEventListener('DOMContentLoaded', ()=>{
  loadWeather();
  loadContact();
  loadPages();
  document.querySelector('#lightbox').addEventListener('click', (e)=>{
    if (e.target.id === 'lightbox' || e.target.closest('.close')) closeLightbox();
  });
});
