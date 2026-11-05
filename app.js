/* Street Coins v6
   Basemap CARTO Voyager senza etichette, dati stradali OpenStreetMap via Overpass.
*/
const DEFAULT_VIEW = [46.0679, 11.1211]; // Trento: posizione iniziale modificabile sulla mappa
const SEARCH_RADIUS_M = 520;
const COIN_SPACING_M = 50;
const PICKUP_BASE_M = 12;
const BONUS_RADIUS_M = 200;
const MAX_COINS = 85;
const CACHE_TTL_MS = 8 * 60 * 1000;
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

const map = L.map("map", {zoomControl:false, preferCanvas:true}).setView(DEFAULT_VIEW, 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19,
  subdomains:"abc",
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);

const coinLayer = L.layerGroup().addTo(map);
let playerMarker=null, playerCircle=null, watchId=null, currentPosition=null;
let coins=[], total=Number(localStorage.getItem("streetCoinsTotal")||0);
let bonusCharges=Number(localStorage.getItem("streetCoinsBonus") ?? 1);
let bonusMode=false, generating=false, lastGeneratedAt=null;
let lastGoodFix=null, lastRoadCenter=null, lastFailedAt=null;
document.getElementById("coinCount").textContent=total;
const statusEl=document.getElementById("status"), locateBtn=document.getElementById("locateBtn");
const refreshBtn=document.getElementById("refreshBtn"), bonusBtn=document.getElementById("bonusBtn");
const toastEl=document.getElementById("toast");

function setStatus(s){statusEl.textContent=s;}
function showToast(s){toastEl.textContent=s;toastEl.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastEl.classList.remove("show"),1550);}
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
function coinIcon(inRange=false){
  return L.divIcon({
    className:"",
    html:`<div class="coin-marker ${inRange?"in-range":""}"><span>★</span></div>`,
    iconSize:[42,42],
    iconAnchor:[21,21]
  });
}
function playerIcon(){return L.divIcon({className:"",html:'<div class="player-dot"></div>',iconSize:[20,20],iconAnchor:[10,10]});}
function clearCoins(){coinLayer.clearLayers();coins=[];}
function cacheKey(lat,lon){return `streetRoads:${lat.toFixed(3)}:${lon.toFixed(3)}`;}
async function fetchRoads(lat,lon){
  const key=cacheKey(lat,lon);
  try{
    const cached=JSON.parse(localStorage.getItem(key)||"null");
    if(cached&&Date.now()-cached.time<CACHE_TTL_MS&&Array.isArray(cached.elements)&&cached.elements.length)return cached.elements;
  }catch(_){}
  const query=`[out:json][timeout:25];way(around:${SEARCH_RADIUS_M},${lat},${lon})["highway"~"^(residential|tertiary|secondary|primary|living_street|unclassified|road|service)$"];out geom;`;
  let lastError=null;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),28000);
      let response;
      try{
        response=await fetch(endpoint,{method:"POST",mode:"cors",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query),signal:controller.signal});
      }finally{clearTimeout(timer);}
      if(!response.ok)throw new Error(`server ${response.status}`);
      const data=await response.json();
      const elements=data.elements||[];
      if(!elements.length)throw new Error("nessuna strada restituita dall'area");
      try{localStorage.setItem(key,JSON.stringify({time:Date.now(),elements}));}catch(_){}
      return elements;
    }catch(err){
      lastError=err;
      console.warn("Overpass non disponibile:",endpoint,err);
    }
  }
  throw new Error(lastError?.message||"nessun servizio cartografico ha risposto");
}
function drawCoins(points){
  clearCoins();
  points.forEach((p,i)=>{
    const id=`${p.lat.toFixed(6)}:${p.lon.toFixed(6)}:${i}`;
    const marker=L.marker([p.lat,p.lon],{icon:coinIcon(),keyboard:false}).addTo(coinLayer);
    marker.on("click",()=>{if(bonusMode)useBonusOn(coin);});
    const coin={id,lat:p.lat,lon:p.lon,marker};
    // click handler uses the object created for this marker
    marker.off("click");
    marker.on("click",()=>{if(bonusMode)useBonusOn(coin);});
    coins.push(coin);
  });
}
async function generateCoins(lat,lon,force=false){
  if(generating)return;
  if(!force&&lastRoadCenter&&distanceMeters({lat,lon},lastRoadCenter)<260&&coins.length)return;
  if(!force&&lastFailedAt&&Date.now()-lastFailedAt<45000){
    setStatus("Strade non disponibili. Premi ↻ per riprovare.");
    return;
  }
  generating=true;setStatus("Caricamento delle strade vicine…");
  try{
    const ways=await fetchRoads(lat,lon);
    let candidates=[];
    for(const way of ways){
      if(!way.geometry||way.geometry.length<2)continue;
      candidates.push(...interpolateRoadPoints(way.geometry.map(p=>({lat:p.lat,lon:p.lon})),COIN_SPACING_M));
    }
    candidates=candidates.filter(p=>distanceMeters({lat,lon},p)<SEARCH_RADIUS_M*.97);
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    const chosen=[];
    for(const p of candidates){
      if(chosen.every(q=>distanceMeters(p,q)>28))chosen.push(p);
      if(chosen.length>=MAX_COINS)break;
    }
    drawCoins(chosen);lastRoadCenter={lat,lon};lastGeneratedAt=Date.now();lastFailedAt=null;
    setStatus(`${coins.length} monete distribuite sulle strade`);
    if(!coins.length)setStatus("Strade trovate, ma nessuna posizione utile per le monete. Premi ↻.");
  }catch(err){
    console.warn(err);lastFailedAt=Date.now();
    setStatus(`Dati stradali non raggiungibili (${err?.message||"errore di rete"}). Premi ↻ per riprovare.`);
  }finally{generating=false;}
}
function collectCoin(coin,source="gps"){
  if(!coin||!coins.includes(coin))return;
  coinLayer.removeLayer(coin.marker);
  coins=coins.filter(c=>c.id!==coin.id);
  total++;localStorage.setItem("streetCoinsTotal",String(total));
  document.getElementById("coinCount").textContent=total;
  // Una carica bonus ogni 10 monete raccolte normalmente.
  if(source==="gps"&&total%10===0){bonusCharges++;localStorage.setItem("streetCoinsBonus",String(bonusCharges));updateBonusUI();showToast("+1 MONETA · BONUS RICARICATO!");}
  else showToast(source==="bonus"?"BONUS! +1 MONETA":" +1 MONETA!");
  if(!coins.length)setStatus("Zona completata! Premi ↻ per cercare altre monete.");
}
function collectNearby(){
  if(!currentPosition)return;
  const accuracy=lastGoodFix?.accuracy??999;
  // Non raccogliere automaticamente se il GPS è impreciso: le monete restano visibili.
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
  // Accetta anche fix indoor imprecisi: servono per centrare approssimativamente la mappa.
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
  const safeAccuracy=Number.isFinite(accuracy)?accuracy:999;
  lastGoodFix={lat:latitude,lon:longitude,accuracy:safeAccuracy};
  updatePlayer(latitude,longitude,safeAccuracy);
  if(!coins.length&&!generating){
    if(!lastFailedAt||Date.now()-lastFailedAt>=45000)generateCoins(latitude,longitude);
  }else if(lastRoadCenter&&distanceMeters({lat:latitude,lon:longitude},lastRoadCenter)>320&&!generating){
    generateCoins(latitude,longitude,true);
  }
  if(safeAccuracy>35){
    setStatus(`Monete visibili · GPS approssimativo (±${Math.round(safeAccuracy)} m). Raccolta automatica in pausa.`);
  }else{
    setStatus(`GPS attivo · precisione ±${Math.round(safeAccuracy)} m`);
  }
}
function startGPS(){
  if(!navigator.geolocation){setStatus("Questo dispositivo non supporta il GPS.");return;}
  if(watchId!==null)return;
  locateBtn.disabled=true;locateBtn.textContent="◎ GPS attivo";setStatus("Ricerca del segnale GPS…");
  watchId=navigator.geolocation.watchPosition(onGPS,err=>{
    const messages={1:"Permesso posizione negato: abilitalo nelle impostazioni.",2:"Posizione non disponibile. Prova all'aperto.",3:"GPS lento. Riprova."};
    setStatus(messages[err.code]||"Errore GPS.");locateBtn.disabled=false;locateBtn.textContent="◎ Riprova GPS";watchId=null;
  },{enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
function useBonusOn(coin){
  if(!bonusMode||bonusCharges<=0||!currentPosition)return;
  const d=distanceMeters(currentPosition,coin);
  if(d>BONUS_RADIUS_M){showToast("Questa moneta è oltre 200 m");return;}
  bonusCharges--;localStorage.setItem("streetCoinsBonus",String(bonusCharges));
  bonusMode=false;bonusBtn.classList.remove("active");
  collectCoin(coin,"bonus");updateBonusUI();setStatus("Bonus utilizzato! Puoi continuare a camminare.");
}
function toggleBonus(){
  if(!currentPosition){setStatus("Attiva prima il GPS.");return;}
  if(bonusCharges<=0){setStatus("Nessun bonus disponibile: raccogli 10 monete per ricaricarlo.");return;}
  if(bonusMode){bonusMode=false;bonusBtn.classList.remove("active");setStatus("Selezione bonus annullata.");return;}
  const inRange=coins.filter(c=>distanceMeters(currentPosition,c)<=BONUS_RADIUS_M);
  if(!inRange.length){setStatus("Non ci sono monete entro 200 metri.");return;}
  bonusMode=true;bonusBtn.classList.add("active");
  inRange.forEach(c=>c.marker.setIcon(coinIcon(true)));
  setStatus("Bonus attivo: tocca una moneta entro 200 metri sulla mappa.");
  showToast("SCEGLI UNA MONETA");
}
function refreshCoins(){
  lastFailedAt=null;
  bonusMode=false;bonusBtn.classList.remove("active");
  // Se il GPS non è disponibile, usa il centro attuale della mappa.
  const center=currentPosition||map.getCenter();
  generateCoins(center.lat,center.lng,true);
}
bonusBtn.addEventListener("click",toggleBonus);
refreshBtn.addEventListener("click",refreshCoins);
locateBtn.addEventListener("click",startGPS);
updateBonusUI();
// Mostra subito le monete nella zona iniziale: il GPS non è necessario per visualizzarle.
generateCoins(DEFAULT_VIEW[0],DEFAULT_VIEW[1]);
if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
  addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
