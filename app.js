/* STREET COINS V7
   Monete rosa sempre visibili. Strade via Overpass; fallback locale se il servizio non risponde.
*/
const APP_VERSION = "V7";
const DEFAULT_VIEW = [46.0679, 11.1211]; // Trento come punto iniziale; usa GPS o trascina la mappa
const SEARCH_RADIUS_M = 650;
const COIN_SPACING_M = 50;
const PICKUP_BASE_M = 12;
const BONUS_RADIUS_M = 200;
const MAX_COINS = 90;
const CACHE_TTL_MS = 8 * 60 * 1000;
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const map = L.map("map", {zoomControl:false, preferCanvas:true}).setView(DEFAULT_VIEW, 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19, subdomains:"abc",
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);

const coinLayer = L.layerGroup().addTo(map);
let playerMarker=null, playerCircle=null, watchId=null, currentPosition=null;
let coins=[], total=Number(localStorage.getItem("streetCoinsTotal")||0);
let bonusCharges=Number(localStorage.getItem("streetCoinsBonus") ?? 1);
let bonusMode=false, generating=false, lastGoodFix=null, lastRoadCenter=null, lastFailedAt=null;
document.getElementById("coinCount").textContent=total;
const statusEl=document.getElementById("status"), locateBtn=document.getElementById("locateBtn");
const refreshBtn=document.getElementById("refreshBtn"), bonusBtn=document.getElementById("bonusBtn");
const toastEl=document.getElementById("toast");
const versionEl=document.getElementById("appVersion");
if(versionEl) versionEl.textContent=APP_VERSION;

function setStatus(s){statusEl.textContent=s;}
function showToast(s){
  toastEl.textContent=s;toastEl.classList.add("show");
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastEl.classList.remove("show"),1700);
}
function updateBonusUI(){
  document.getElementById("bonusCount").textContent=bonusCharges;
  bonusBtn.disabled=!currentPosition||bonusCharges<=0;
  bonusBtn.classList.toggle("active",bonusMode);
}
function distanceMeters(a,b){
  const R=6371000,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function coinIcon(inRange=false){
  return L.divIcon({className:"",html:`<div class="coin-marker ${inRange?"in-range":""}"><span>★</span></div>`,iconSize:[42,42],iconAnchor:[21,21]});
}
function playerIcon(){
  return L.divIcon({className:"",html:'<div class="player-dot"></div>',iconSize:[22,22],iconAnchor:[11,11]});
}
function clearCoins(){coinLayer.clearLayers();coins=[];}
function cacheKey(lat,lon){return `streetRoads:${lat.toFixed(3)}:${lon.toFixed(3)}`;}

async function fetchRoads(lat,lon){
  const key=cacheKey(lat,lon);
  try{
    const cached=JSON.parse(localStorage.getItem(key)||"null");
    if(cached&&Date.now()-cached.time<CACHE_TTL_MS&&Array.isArray(cached.elements)&&cached.elements.length)return cached.elements;
  }catch(_){}
  const query=`[out:json][timeout:20];way(around:${SEARCH_RADIUS_M},${lat},${lon})["highway"~"^(residential|tertiary|secondary|primary|living_street|unclassified|road|service)$"];out geom;`;
  let lastError=null;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),18000);
      let response;
      try{
        // GET avoids POST restrictions encountered by some Overpass mirrors.
        const url=endpoint+"?data="+encodeURIComponent(query);
        response=await fetch(url,{method:"GET",mode:"cors",signal:controller.signal,cache:"no-store"});
      }finally{clearTimeout(timer);}
      if(!response.ok)throw new Error(`server ${response.status}`);
      const data=await response.json();
      const elements=data.elements||[];
      if(!elements.length)throw new Error("nessuna strada restituita");
      try{localStorage.setItem(key,JSON.stringify({time:Date.now(),elements}));}catch(_){}
      return elements;
    }catch(err){
      lastError=err;
      console.warn("Overpass non disponibile:",endpoint,err);
    }
  }
  throw new Error(lastError?.message||"servizio stradale non raggiungibile");
}
function interpolateRoadPoints(nodes,spacing){
  const pts=[];let carry=0;
  for(let i=1;i<nodes.length;i++){
    const a=nodes[i-1],b=nodes[i],len=distanceMeters(a,b);
    if(!Number.isFinite(len)||len===0)continue;
    let d=spacing-carry;
    while(d<len){const t=d/len;pts.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t});d+=spacing;}
    carry=(carry+len)%spacing;
  }
  return pts;
}
function drawCoins(points){
  clearCoins();
  points.forEach((p,i)=>{
    const id=`${p.lat.toFixed(6)}:${p.lon.toFixed(6)}:${i}`;
    const coin={id,lat:p.lat,lon:p.lon,marker:null};
    const marker=L.marker([p.lat,p.lon],{icon:coinIcon(),keyboard:false}).addTo(coinLayer);
    coin.marker=marker;
    marker.on("click",()=>{if(bonusMode)useBonusOn(coin);});
    coins.push(coin);
  });
}
function fallbackPoints(lat,lon){
  // Griglia di monete in un'area intorno al centro: garantisce che la mappa non resti vuota.
  // Questi punti sono provvisori e non garantiscono che coincidano con il tracciato stradale.
  const points=[];
  const latStep=0.00045; // circa 50 m
  const lonStep=latStep/Math.max(0.25,Math.cos(lat*Math.PI/180));
  for(let ring=0;ring<7;ring++){
    for(let i=-7;i<=7;i++){
      const j=ring%2===0?i:i+0.5;
      if(Math.abs(i)+ring<2)continue;
      const p={lat:lat+(ring-3)*latStep,lon:lon+j*lonStep};
      if(distanceMeters({lat,lon},p)<SEARCH_RADIUS_M)points.push(p);
    }
  }
  return points.slice(0,MAX_COINS);
}
async function generateCoins(lat,lon,force=false){
  if(generating)return;
  generating=true;
  setStatus("Cerco le strade e preparo le monete…");
  try{
    let points=[],source="strade";
    try{
      const ways=await fetchRoads(lat,lon);
      let candidates=[];
      for(const way of ways){
        if(way.geometry&&way.geometry.length>=2){
          candidates.push(...interpolateRoadPoints(way.geometry.map(p=>({lat:p.lat,lon:p.lon})),COIN_SPACING_M));
        }
      }
      candidates=candidates.filter(p=>distanceMeters({lat,lon},p)<SEARCH_RADIUS_M*.97);
      for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
      for(const p of candidates){
        if(points.every(q=>distanceMeters(p,q)>28))points.push(p);
        if(points.length>=MAX_COINS)break;
      }
      if(!points.length)throw new Error("nessuna posizione stradale utile");
    }catch(err){
      console.warn("Uso monete provvisorie:",err);
      points=fallbackPoints(lat,lon);
      source="provvisorie";
    }
    drawCoins(points);
    lastRoadCenter={lat,lon};
    if(source==="strade"){
      setStatus(`${coins.length} monete rosa sulle strade`);
    }else{
      setStatus(`${coins.length} monete rosa visibili · modalità provvisoria`);
    }
  }finally{generating=false;}
}
function collectCoin(coin,source="gps"){
  if(!coin||!coins.includes(coin))return;
  coinLayer.removeLayer(coin.marker);
  coins=coins.filter(c=>c.id!==coin.id);
  total++;localStorage.setItem("streetCoinsTotal",String(total));
  document.getElementById("coinCount").textContent=total;
  if(source==="gps"&&total%10===0){
    bonusCharges++;localStorage.setItem("streetCoinsBonus",String(bonusCharges));
    updateBonusUI();showToast("+1 MONETA · BONUS RICARICATO!");
  }else showToast(source==="bonus"?"BONUS! +1 MONETA":"+1 MONETA!");
  if(!coins.length)setStatus("Zona completata! Premi ↻ per cercare altre monete.");
}
function collectNearby(){
  if(!currentPosition)return;
  const accuracy=lastGoodFix?.accuracy??999;
  if(accuracy>35)return;
  const radius=Math.max(PICKUP_BASE_M,Math.min(18,accuracy*.45));
  for(const coin of [...coins]){
    if(distanceMeters(currentPosition,coin)<=radius)collectCoin(coin,"gps");
  }
}
function updatePlayer(lat,lon,accuracy){
  currentPosition={lat,lon};
  if(!playerMarker){
    playerMarker=L.marker([lat,lon],{icon:playerIcon(),zIndexOffset:1000,keyboard:false}).addTo(map);
    playerCircle=L.circle([lat,lon],{radius:Math.max(accuracy||0,8),color:"#287cff",weight:1,opacity:.45,fillColor:"#287cff",fillOpacity:.08}).addTo(map);
    map.setView([lat,lon],17);
  }else{
    playerMarker.setLatLng([lat,lon]);playerCircle.setLatLng([lat,lon]);playerCircle.setRadius(Math.max(accuracy||0,8));
  }
  collectNearby();updateBonusUI();
}
function onGPS(pos){
  const {latitude,longitude,accuracy}=pos.coords;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
  const acc=Number.isFinite(accuracy)?accuracy:999;
  lastGoodFix={lat:latitude,lon:longitude,accuracy:acc};
  updatePlayer(latitude,longitude,acc);
  if(!lastRoadCenter||distanceMeters({lat:latitude,lon:longitude},lastRoadCenter)>260){
    generateCoins(latitude,longitude,true);
  }
  setStatus(acc>35
    ? `Monete visibili · GPS approssimativo (±${Math.round(acc)} m), raccolta automatica in pausa`
    : `GPS attivo · precisione ±${Math.round(acc)} m`);
}
function startGPS(){
  if(!navigator.geolocation){setStatus("GPS non disponibile: puoi usare la mappa manualmente.");return;}
  if(watchId!==null)return;
  locateBtn.disabled=true;locateBtn.textContent="◎ GPS attivo";
  setStatus("Cerco la posizione…");
  watchId=navigator.geolocation.watchPosition(onGPS,err=>{
    const messages={1:"Permesso posizione negato: usa la mappa manualmente.",2:"Posizione non disponibile: usa la mappa manualmente.",3:"GPS lento: puoi comunque usare la mappa."};
    setStatus(messages[err.code]||"GPS non disponibile: usa la mappa.");
    locateBtn.disabled=false;locateBtn.textContent="◎ Riprova GPS";watchId=null;
  },{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
}
function useBonusOn(coin){
  if(!bonusMode||bonusCharges<=0||!currentPosition)return;
  if(lastGoodFix&&lastGoodFix.accuracy>35){showToast("GPS troppo impreciso per il bonus");return;}
  const d=distanceMeters(currentPosition,coin);
  if(d>BONUS_RADIUS_M){showToast("Questa moneta è oltre 200 m");return;}
  bonusCharges--;localStorage.setItem("streetCoinsBonus",String(bonusCharges));
  bonusMode=false;bonusBtn.classList.remove("active");
  collectCoin(coin,"bonus");updateBonusUI();setStatus("Bonus utilizzato!");
}
function toggleBonus(){
  if(!currentPosition){setStatus("Attiva il GPS per usare il bonus.");return;}
  if(lastGoodFix&&lastGoodFix.accuracy>35){setStatus("GPS troppo impreciso per usare il bonus.");return;}
  if(bonusCharges<=0){setStatus("Nessun bonus disponibile: raccogli 10 monete.");return;}
  if(bonusMode){bonusMode=false;bonusBtn.classList.remove("active");setStatus("Selezione bonus annullata.");return;}
  const inRange=coins.filter(c=>distanceMeters(currentPosition,c)<=BONUS_RADIUS_M);
  if(!inRange.length){showToast("Nessuna moneta entro 200 metri");return;}
  bonusMode=true;bonusBtn.classList.add("active");
  inRange.forEach(c=>c.marker.setIcon(coinIcon(true)));
  setStatus("Bonus attivo: tocca una moneta rosa.");
  showToast("SCEGLI UNA MONETA");
}
function refreshCoins(){
  bonusMode=false;bonusBtn.classList.remove("active");
  const center=currentPosition||map.getCenter();
  generateCoins(center.lat,center.lng,true);
}
bonusBtn.addEventListener("click",toggleBonus);
refreshBtn.addEventListener("click",refreshCoins);
locateBtn.addEventListener("click",startGPS);
updateBonusUI();

// Generate fallback markers immediately so the map never opens empty.
drawCoins(fallbackPoints(DEFAULT_VIEW[0],DEFAULT_VIEW[1]));
setStatus("Monete rosa visibili · attiva il GPS o sposta la mappa");
generateCoins(DEFAULT_VIEW[0],DEFAULT_VIEW[1]);

// V7 deliberately disables the old service worker to prevent stale app versions.
if("serviceWorker" in navigator){
  navigator.serviceWorker.getRegistrations().then(regs=>regs.forEach(reg=>reg.unregister())).catch(()=>{});
  if("caches" in window) caches.keys().then(keys=>keys.forEach(k=>caches.delete(k))).catch(()=>{});
}
