
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
async function loadWeather(){
  const locationEl = document.querySelector('#weather-location');
  const tempEl = document.querySelector('#weather-temp');
  const descEl = document.querySelector('#weather-desc');
  const iconEl = document.querySelector('#weather-icon');
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
    locationEl.textContent = 'Local weather';
  }catch(e){
    tempEl.textContent = '--';
    descEl.textContent = 'Unavailable';
    iconEl.textContent = '⌛';
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

// Contact-of-the-day
async function loadContact(){
  const dateISO = todayInLondonISO();
  const res = await fetch('data/contacts.json');
  const data = await res.json();
  const nameEl = document.querySelector('#contact-name');
  const roleEl = document.querySelector('#contact-role');
  const phoneEl = document.querySelector('#contact-phone');
  const imgEl = document.querySelector('#contact-photo');
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
