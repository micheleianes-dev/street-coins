/* TERRITORIALS — V2.6.2 strutture sociali per intersezione */
let TEST_MODE=true;
const SUPABASE_URL="https://ibqponyeathgxiweujvd.supabase.co";
const SUPABASE_KEY="sb_publishable_JhMo2NOsorp_HLE2Vd2BSg_VJJt6e-0";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:14,maxZoom:19,zoomSnap:0.5,zoomDelta:0.5}).setView([46.0679,11.1211],17);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const $=id=>document.getElementById(id);
const drawnLayer=L.layerGroup().addTo(map);
let watchId=null,gpsWatchdog=null,position=null,accuracy=999,track=[],trackLine=null,playerMarker=null,accuracyCircle=null,recording=false,totalDistance=0,toastTimer=null,hasInitialGpsView=false;
const CLOSE_DISTANCE=24,MAX_TRACK_ACCURACY=60,MIN_POINTS=5,MIN_AREA=250,MAX_TERRITORY_AREA=20000;
let savedTerritories=[],currentUser=null,playerName="",lastClosedResources=null,currentZoneDetailsId=null,areaLimitWarned=false,expansionZone=null,expansionLeft=false,expansionPath=[],expansionExit=null,pendingNewTerritory=null;
let colony={population:1,assignments:{},inventory:{},last_tick:new Date().toISOString()},colonyLoaded=false,colonySaving=false,colonyLastTick=Date.now();
let walkedMeters=0,walkPreviousPosition=null,walkPreviousAt=0,walkPersistedAt=0,walkingSaving=false;
let playerAchievements={first_kingdom:false,walk_one_km:false};
let pendingAchievementNotices=[],lastAnnouncedUnemployed=-1,unemployedNoticeUnread=false,walkingSaveQueued=false;
const RESOURCE_RATE_PER_WORKER_MINUTE=1;
function distance(a,b){const r=Math.PI/180,R=6371000,dLat=(b.lat-a.lat)*r,dLon=(b.lng-a.lng)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function area(points){if(points.length<3)return 0;const lat0=points.reduce((s,p)=>s+p.lat,0)/points.length,scaleX=111320*Math.cos(lat0*Math.PI/180),scaleY=110540;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=(a.lng*scaleX)*(b.lat*scaleY)-(b.lng*scaleX)*(a.lat*scaleY)}return Math.abs(sum/2)}
function fmtArea(value){return value>=10000?(value/10000).toFixed(2)+" ha":Math.round(value)+" m²"}
function showToast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3000)}
function updateStats(){
 $("distanceValue").textContent=totalDistance>=1000?(totalDistance/1000).toFixed(2)+" km":Math.round(totalDistance)+" m";
 $("pointValue").textContent=track.length;
 const estimatedArea=track.length>=3?area(track):0;
 $("areaValue").textContent=track.length>=3?fmtArea(estimatedArea):"—";
 if(recording&&!expansionZone&&estimatedArea>MAX_TERRITORY_AREA){
  if(!areaLimitWarned){showToast("Attenzione: stai superando il limite massimo di 2 ettari.");areaLimitWarned=true}
  $("drawState").textContent="Limite di 2 ettari superato";
  $("hint").textContent="Il territorio supera 2 ettari (20.000 m²). Riduci il perimetro: non potrà essere chiuso finché supera il limite.";
 }else if(estimatedArea<=MAX_TERRITORY_AREA){areaLimitWarned=false}
}
function updateTerritoryControls(){
 const own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 const start=$("startBtn"),del=$("deleteZoneBtn");
 if(!start||!del)return;
 del.hidden=!own;
 start.disabled=recording;
 start.textContent=own&&position&&pointInPolygon(position,own.points)?"Espandi il tuo territorio":"Inizia a tracciare";
 if(own&&!recording)$("hint").textContent=position&&pointInPolygon(position,own.points)?"Esci dai confini e rientra da un altro punto: la nuova area verrà aggiunta al territorio.":"Una nuova conquista sostituirà il tuo regno.";
}
function updatePositionBanner(){
 let found=null;if(position)for(const t of savedTerritories){if(pointInPolygon(position,t.points)){found=t;break}}
 $("territoryName").textContent=found?(found.territory_name||"Regno"):"Zona libera";
 if(found&&window.lastTerritoryNotice!==found.id){window.lastTerritoryNotice=found.id;showToast("Zona: "+(found.territory_name||"Regno"))}
 if(!found)window.lastTerritoryNotice=null;if(!recording)updateTerritoryControls();
}
function pointInPolygon(point,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],cross=((a.lng>point.lng)!==(b.lng>point.lng))&&(point.lat<(b.lat-a.lat)*(point.lng-a.lng)/(b.lng-a.lng)+a.lat);if(cross)inside=!inside}return inside}
function setGpsActive(active,label){$("gpsPill").classList.toggle("active",active);$("gpsPill").querySelector("span").textContent=label;$("locateBtn").textContent=active?"◎ GPS attivo":"◎ Attiva GPS"}

function escHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function authMessage(s){$("authMessage").textContent=s}
function displayName(user){const m=user?.user_metadata||{};return String(m.display_name||m.full_name||m.name||(user?.email||"").split("@")[0]||"Giocatore").trim().slice(0,40)}
function showAuth(message){$("authPanel").classList.remove("hidden");if(message)authMessage(message)}
async function loadZones(){
 const {data,error}=await db.from("territorials_zones").select("*").order("created_at");
 if(error)throw error;
 drawnLayer.clearLayers();savedTerritories=(data||[]).map(z=>({...z,points:Array.isArray(z.points)?z.points:[],resources:z.resources||{status:"unknown",items:[]}}));
 savedTerritories.forEach(z=>{
  const own=z.owner_id===currentUser?.id,color=own?"#16d6ad":"#8b78ff";
  const poly=L.polygon(z.points,{color,weight:own?4:3,opacity:.98,dashArray:own?"3 6":"10 5 2 5",lineCap:"round",lineJoin:"round",fillColor:color,fillOpacity:own?0.2:0.13,className:own?"territory-glow territory-own":"territory-glow territory-rival"}).addTo(drawnLayer);
  const bounds=poly.getBounds(),center=L.latLng(bounds.getNorth(),bounds.getCenter().lng),territoryName=z.territory_name||"Regno";
  const avatarMarkup='<span class="kingdom-standard">⚑</span>';
  const resourceIcons=(z.resources?.status==="ok"?(z.resources.items||[]):[]).filter(r=>RESOURCE_TYPES[r.type]&&r.detected!==false).map(r=>'<span title="'+escHtml(r.label||RESOURCE_TYPES[r.type].label)+'">'+RESOURCE_TYPES[r.type].icon+'</span>').join("");
  const resourceMarkup=resourceIcons?'<span class="territory-label-resources">'+resourceIcons+'</span>':"";
  const resourcePending=z.resources?.status==="pending"?'<span class="territory-resource-pending"><i></i>Analisi risorse in corso</span>':"";
  L.marker(center,{interactive:true,keyboard:false,icon:L.divIcon({className:"territory-label-wrap",html:'<div class="territory-map-label '+(own?"is-own":"is-rival")+'">'+avatarMarkup+'<span class="territory-label-copy"><strong>'+escHtml(territoryName)+'</strong>'+resourceMarkup+resourcePending+'</span></div>',iconSize:[210,60],iconAnchor:[105,76]})}).addTo(drawnLayer);
  poly.bindPopup('<b>'+escHtml(territoryName)+'</b><br>'+fmtArea(Number(z.area_m2)||0)+'<br><small>'+new Date(z.created_at).toLocaleDateString("it-IT")+'</small>');
 });
 updatePositionBanner();
 updateTerritoryControls();
 const pending=savedTerritories.find(z=>z.owner_id===currentUser?.id&&(z.resources?.status==="pending"||z.resources?.status==="unknown"));
 if(pending)analyzeAndStoreResources(pending);
 // Una difficoltà nel caricamento della colonia non deve bloccare l'analisi delle risorse.
 if(currentUser)try{await loadColony()}catch(error){console.warn("Colony load:",error)}
}
async function refreshSession(){
 const {data:{session},error}=await db.auth.getSession();if(error)throw error;
 currentUser=session?.user||null;playerName=currentUser?displayName(currentUser):"";
 if(currentUser){$("authPanel").classList.add("hidden");$("authTitle").textContent="Bentornato";await loadZones();loadPlayerProgress();if(!TEST_MODE&&document.visibilityState==="visible")startGpsWatch()}
 else{savedTerritories=[];drawnLayer.clearLayers();$("authPanel").classList.remove("hidden");$("authTitle").textContent="Entra nel gioco"}
}
async function registerPlayer(){
 const name=$("playerName").value.trim(),email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!name||!email||password.length<6){authMessage("Inserisci un nome, un'email e una password di almeno 6 caratteri.");return}
 $("authSignup").disabled=true;
 try{const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name,full_name:name}}});if(error)throw error;
 if(data.session){currentUser=data.user;playerName=name;$("authPanel").classList.add("hidden");await loadZones();loadPlayerProgress();if(document.visibilityState==="visible")startGpsWatch();authMessage("Account creato. Buon gioco!")}
 else authMessage("Registrazione avviata: controlla la posta per confermare l'email.");
 }catch(e){authMessage(e.message||"Registrazione non riuscita.")}finally{$("authSignup").disabled=false}
}
async function loginPlayer(){
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!email||!password){authMessage("Inserisci email e password.");return}
 $("authLogin").disabled=true;
 try{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;currentUser=data.user;playerName=displayName(data.user);$("authPanel").classList.add("hidden");await loadZones();loadPlayerProgress();if(!TEST_MODE&&document.visibilityState==="visible")startGpsWatch();showToast("Bentornato, "+playerName)}
 catch(e){authMessage(e.message||"Accesso non riuscito.")}finally{$("authLogin").disabled=false}
}
async function enterAsGuest(){
 $("authGuest").disabled=true;
 try{
  const {data,error}=await db.auth.signInAnonymously();
  if(error)throw error;
  currentUser=data.user;
  const {data:updated,error:updateError}=await db.auth.updateUser({data:{display_name:"Giocatore Test",full_name:"Giocatore Test"}});
  if(updateError)throw updateError;
  currentUser=updated.user||data.user;playerName="Giocatore Test";
  $("authPanel").classList.add("hidden");await loadZones();loadPlayerProgress();if(document.visibilityState==="visible")startGpsWatch();
  showToast("Sei entrato come Giocatore Test");
 }catch(e){
  const message=String(e.message||"").toLowerCase();
  authMessage(message.includes("anonymous")||message.includes("disabled")?"Accesso ospite non attivo nel progetto Supabase. Abilita Authentication → Sign In / Providers → Anonymous e riprova.":(e.message||"Accesso ospite non riuscito."));
 }finally{$("authGuest").disabled=false}
}

const RESOURCE_TYPES={
 forest:{label:"Legname e vegetazione",icon:"🌲"},
 food:{label:"Cibo",icon:"🌾"},
 materials:{label:"Materiali",icon:"🧱"},
 water:{label:"Acqua",icon:"💧"}
};
function territoryFeature(points){
 const ring=points.map(p=>[p.lng,p.lat]);if(ring.length<3)return null;
 if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])ring.push(ring[0]);
 return turf.polygon([ring]);
}
function resourceClasses(tags){
 const types=[];
 if(tags.landuse==="forest"||tags.natural==="wood"||tags.landcover==="trees"||tags.natural==="tree"||tags.leisure==="park"||tags.natural==="scrub"||tags.natural==="heath"||tags.natural==="grassland"||tags.landuse==="grass")types.push("forest");
 if(["farmland","farmyard","meadow","orchard","vineyard","allotments","greenhouse_horticulture"].includes(tags.landuse)||["grassland","meadow"].includes(tags.natural)||tags.crop||tags.produce||tags.garden==="vegetable"||tags.shop==="farm")types.push("food");
 if(tags.building||["industrial","quarry","construction"].includes(tags.landuse)||tags.man_made==="works"||tags.man_made==="storage_tank")types.push("materials");
 if(["water","wetland","spring"].includes(tags.natural)||tags.waterway||tags.landuse==="reservoir"||["drinking_water","fountain","watering_place"].includes(tags.amenity)||tags.man_made==="water_well")types.push("water");
 return types;
}
const resourceAnalysesInFlight=new Set(),resourceAnalysesAttempted=new Set();
async function fetchOverpassResources(query){
 // Le istanze pubbliche possono rispondere 502/429 quando sono sovraccariche.
 // Prova tre istanze e ripete una sola volta gli errori temporanei.
 const endpoints=[
  {url:"https://overpass-api.de/api/interpreter",ms:40000},
  {url:"https://overpass.private.coffee/api/interpreter",ms:40000},
  {url:"https://overpass.nchc.org.tw/api/interpreter",ms:35000}
 ];
 const errors=[];
 for(const {url,ms} of endpoints){
  for(let attempt=0;attempt<2;attempt++){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ms);
   try{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query),signal:controller.signal});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    if(!Array.isArray(data.elements))throw new Error(data.remark||"Risposta OSM non valida");
    if(data.remark&&/error|timeout|memory/i.test(data.remark))throw new Error(data.remark);
    console.info("OSM analysis:",data.elements.length,"elements from",url);
    return {elements:data.elements,server:url};
   }catch(error){
    const reason=error.name==="AbortError"?"timeout "+Math.round(ms/1000)+"s":error.message||"errore di rete";
    errors.push(new URL(url).hostname+": "+reason);
    console.warn("OSM endpoint error:",url,error);
    // Ripeti soltanto per errori di gateway o servizio momentaneamente indisponibile.
    if(attempt===0&&/HTTP (429|500|502|503|504)/.test(reason)){
     await new Promise(resolve=>setTimeout(resolve,1500));
     continue;
    }
    break;
   }finally{clearTimeout(timeout)}
  }
 }
 return {elements:null,errors};
}
function osmResourceGeometry(element){
 const polygons=[],lines=[],points=[];
 if(element.type==="node"){
  if(Number.isFinite(element.lon)&&Number.isFinite(element.lat))points.push([element.lon,element.lat]);
 }else if(element.type==="way"){
  const coords=(element.geometry||[]).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)).map(p=>[p.lon,p.lat]);
  if(coords.length>=2){
   const closed=coords.length>=4&&coords[0][0]===coords[coords.length-1][0]&&coords[0][1]===coords[coords.length-1][1];
   if(closed)polygons.push(coords);
   else lines.push(coords);
  }
 }else if(element.type==="relation"){
  for(const member of element.members||[]){
   if(member.type!=="way"||!Array.isArray(member.geometry)||member.role==="inner")continue;
   const coords=member.geometry.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)).map(p=>[p.lon,p.lat]);
   if(coords.length>=4&&coords[0][0]===coords[coords.length-1][0]&&coords[0][1]===coords[coords.length-1][1])polygons.push(coords);
   else if(coords.length>=2)lines.push(coords);
  }
 }
 return {polygons,lines,points};
}
function pointInsideOsmRing(lon,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
// Classificatore cartografico: palette della mappa standard OSM, non dati vettoriali.
const MAP_RESOURCE_PALETTE=[
 {type:"forest",rgb:[173,209,158],tolerance:52},
 {type:"forest",rgb:[200,224,180],tolerance:42},
 {type:"food",rgb:[238,240,213],tolerance:34},
 {type:"food",rgb:[205,222,172],tolerance:30},
 {type:"water",rgb:[170,211,223],tolerance:47},
 {type:"water",rgb:[181,208,208],tolerance:32},
 {type:"materials",rgb:[208,190,178],tolerance:36},
 {type:"materials",rgb:[217,208,201],tolerance:28}
];
function classifyMapPixel(r,g,b){
 // Evita di contare testi scuri, linee di confine e strade grigie come risorse.
 if(Math.max(r,g,b)-Math.min(r,g,b)<8||Math.max(r,g,b)<115)return null;
 let best=null,bestScore=Infinity;
 for(const entry of MAP_RESOURCE_PALETTE){
  const distance=Math.hypot(r-entry.rgb[0],g-entry.rgb[1],b-entry.rgb[2]);
  if(distance<entry.tolerance&&distance<bestScore){best=entry.type;bestScore=distance}
 }
 return best;
}
function osmTileXY(lat,lng,z){
 const n=2**z,latRad=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;
 return {x:(lng+180)/360*n,y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n};
}
function loadResourceTile(x,y,z){
 return new Promise((resolve,reject)=>{
  const image=new Image();image.crossOrigin="anonymous";
  const timeout=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error("Tempo scaduto per la mappa"))},14000);
  image.onload=()=>{clearTimeout(timeout);resolve(image)};
  image.onerror=()=>{clearTimeout(timeout);reject(new Error("Tile mappa non accessibile (rete/CORS)"))};
  image.src="https://tile.openstreetmap.org/"+z+"/"+x+"/"+y+".png";
 });
}
async function calculateTerritoryResources(points){
 if(!Array.isArray(points)||points.length<3)return {status:"unknown",items:[],message:"Perimetro non valido."};
 const territoryArea=area(points);
 if(!Number.isFinite(territoryArea)||territoryArea<=0)return {status:"unknown",items:[],message:"Superficie non valida."};
 const z=17,projected=points.map(p=>osmTileXY(p.lat,p.lng,z));
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x));
 const minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
 const x0=Math.floor(minX),x1=Math.floor(maxX),y0=Math.floor(minY),y1=Math.floor(maxY);
 const count=(x1-x0+1)*(y1-y0+1);
 if(count>20)return {status:"unknown",items:[],message:"Area troppo estesa per l'analisi cartografica."};
 const canvas=document.createElement("canvas");canvas.width=(x1-x0+1)*256;canvas.height=(y1-y0+1)*256;
 const context=canvas.getContext("2d",{willReadFrequently:true});
 try{
  // Usa gli stessi tile della mappa visibile, senza interrogare Overpass.
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const img=await loadResourceTile(x,y,z);
   context.drawImage(img,(x-x0)*256,(y-y0)*256,256,256);
  }
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const totals={forest:0,food:0,materials:0,water:0};
  let inside=0;
  // Pixel a passo 2: classificazione rapida su una griglia ad alta risoluzione.
  for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2){
   const tileX=x0+x/256,tileY=y0+y/256;
   if(!pointInsideOsmRing(tileX,tileY,projected.map(p=>[p.x,p.y])))continue;
   inside++;
   const i=(y*canvas.width+x)*4;
   const type=classifyMapPixel(pixels[i],pixels[i+1],pixels[i+2]);
   if(type)totals[type]++;
  }
  if(!inside)return {status:"unknown",items:[],message:"Il territorio è troppo piccolo per la risoluzione cartografica."};
  const items=Object.keys(RESOURCE_TYPES).map(type=>{
   const share=totals[type]/inside;
   return {type,label:RESOURCE_TYPES[type].label,icon:RESOURCE_TYPES[type].icon,area_m2:Math.round(share*territoryArea),share_pct:Math.round(share*1000)/10,detected:totals[type]>0};
  });
  return {status:"ok",items,source:"Mappa OpenStreetMap · stima cromatica",method:"map-pixels-v1",analyzed_at:new Date().toISOString(),sampled_points:inside,confidence:"estimated"};
 }catch(error){
  console.warn("Map pixel analysis:",error);
  return {status:"unknown",items:[],message:"Non è stato possibile leggere i colori della mappa.",details:String(error.message||error)};
 }
}
// Catalogo dei POI cartografici: una richiesta bbox per tutti i tag iconografici principali.
const POI_KEYS=["amenity","shop","tourism","leisure","historic","healthcare","emergency","office","craft","man_made","aeroway","railway","public_transport"];
const POI_LABELS={social_facility:"Struttura sociale",hospital:"Ospedale",clinic:"Clinica",doctors:"Medico",pharmacy:"Farmacia",school:"Scuola",kindergarten:"Asilo",university:"Università",college:"Istituto",library:"Biblioteca",restaurant:"Ristorante",cafe:"Bar/caffetteria",fast_food:"Fast food",drinking_water:"Acqua potabile",fountain:"Fontana",place_of_worship:"Luogo di culto",community_centre:"Centro comunitario",police:"Polizia",fire_station:"Vigili del fuoco",post_office:"Ufficio postale",bank:"Banca",atm:"Bancomat",fuel:"Distributore",parking:"Parcheggio",museum:"Museo",hotel:"Hotel",supermarket:"Supermercato",playground:"Parco giochi",cinema:"Cinema",theatre:"Teatro",castle:"Castello",memorial:"Memoriale",monument:"Monumento",bus_station:"Autostazione"};
function poiLabel(key,value){return POI_LABELS[value]||value.replace(/_/g," ").replace(/^./,c=>c.toUpperCase())+" ("+key+")"}
async function findTerritoryPois(points){
 const lats=points.map(p=>p.lat),lngs=points.map(p=>p.lng);
 const bbox=[Math.min(...lats),Math.min(...lngs),Math.max(...lats),Math.max(...lngs)].map(v=>v.toFixed(7)).join(",");
 const query='[out:json][timeout:18];nwr["^(amenity|shop|tourism|leisure|historic|healthcare|emergency|office|craft|man_made|aeroway|railway|public_transport)$"~"."]('+bbox+');out center;';
 const errors=[];
 for(const server of ["https://overpass.private.coffee/api/interpreter","https://overpass-api.de/api/interpreter"]){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
  try{
   const response=await fetch(server,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(query),signal:controller.signal});
   if(!response.ok)throw new Error("HTTP "+response.status);
   const json=await response.json();if(!Array.isArray(json.elements)||json.remark)throw new Error(json.remark||"Risposta OSM non valida");
   const facilities=[],ids=new Set();
   for(const item of json.elements){
    const p=item.type==="node"?item:item.center;
    if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||!pointInPolygon({lat:p.lat,lng:p.lon},points))continue;
    const id=item.type+"/"+item.id;if(ids.has(id))continue;ids.add(id);
    const tags=item.tags||{},key=POI_KEYS.find(k=>tags[k]);
    if(!key)continue;
    const value=tags[key],name=String(tags.name||poiLabel(key,value));
    facilities.push({id,key,value,name,label:poiLabel(key,value)});
   }
   const counts={};
   for(const f of facilities){const k=f.key+"="+f.value;if(!counts[k])counts[k]={key:f.key,value:f.value,label:f.label,count:0};counts[k].count++}
   return {status:"ok",count:facilities.length,facilities,counts:Object.values(counts).sort((a,b)=>b.count-a.count),source:"OpenStreetMap",analyzed_at:new Date().toISOString()};
  }catch(error){errors.push(new URL(server).hostname+": "+(error.name==="AbortError"?"timeout":error.message))}
  finally{clearTimeout(timer)}
 }
 return {status:"unknown",count:null,facilities:[],counts:[],details:errors.join(" | ")};
}
async function analyzeAndStoreResources(zone,force=false){
 if(!zone||zone.owner_id!==currentUser?.id||(!force&&!["pending","unknown"].includes(zone.resources?.status)))return;
 const key=zone.id+":"+zone.created_at;
 if(resourceAnalysesInFlight.has(key)||(!force&&resourceAnalysesAttempted.has(key)))return;
 resourceAnalysesInFlight.add(key);resourceAnalysesAttempted.add(key);
 let result;
 try{
  result=await calculateTerritoryResources(zone.points);
  const pois=await findTerritoryPois(zone.points);
  result.poi_features=pois.status==="ok"?pois:(zone.resources?.poi_features?.status==="ok"?zone.resources.poi_features:pois);
 }catch(error){
  console.error("Resource analysis:",error);
  result={status:"unknown",items:[],message:"Errore nel calcolo delle risorse.",details:String(error?.message||error).slice(0,350)};
 }
 try{
  // Evita che un risultato vecchio sovrascriva una conquista successiva dello stesso utente.
  const {data,error}=await db.from("territorials_zones").update({resources:result}).eq("id",zone.id).eq("owner_id",zone.owner_id).eq("created_at",zone.created_at).select("id").maybeSingle();
  if(error)throw error;
  if(data){
   const local=savedTerritories.find(z=>z.id===zone.id&&z.created_at===zone.created_at);
   if(local)local.resources=result;
   await loadZones();
   if(document.querySelector('.territory-tab.active')?.dataset.tab==="resources"&&!$("territoryPanel").hidden)renderTerritoryTab("resources");
   if(currentZoneDetailsId===zone.id&&!$("zoneModal").classList.contains("hidden"))$("zoneResources").innerHTML="<h3>Risorse di questo territorio</h3>"+resourceMarkup(result);
   showToast(result.status==="ok"?"Risorse del regno analizzate":"Analisi delle risorse non riuscita.");
  }
 }catch(error){
  console.error("Resource save:",error);
  const local=savedTerritories.find(z=>z.id===zone.id&&z.created_at===zone.created_at);
  if(local)local.resources={status:"unknown",items:[],message:"Analisi non disponibile: impossibile salvare il risultato.",details:String(error?.message||error).slice(0,350)};
 }finally{resourceAnalysesInFlight.delete(key)}
}
function unemployedWorkerCount(){
 if(!currentUser||!colonyLoaded||!savedTerritories.some(z=>z.owner_id===currentUser.id)||!colonyResourceTypes().length)return 0;
 return Math.max(0,colony.population-colonyTotalsAssigned());
}
function updateProfileNotifications(announceUnemployed=false){
 const badge=$("profileNotificationBadge");if(!badge)return;
 const achievementCount=pendingAchievementNotices.length,unemployed=unemployedWorkerCount();
 const total=achievementCount; // Il badge del profilo segnala soltanto obiettivi non ancora letti.
 badge.textContent=total>9?"9+":String(total);
 badge.hidden=total===0;
 badge.setAttribute("aria-hidden",String(total===0));
 const messages=[];
 if(achievementCount)messages.push(achievementCount+" obiettiv"+(achievementCount===1?"o completato":"i completati"));
 // Gli avvisi dei lavoratori restano nella sezione Territorio → Popolazione.
 $("profileNav").title=messages.length? "Profilo · "+messages.join(" · "):"Profilo";
 $("profileNav").setAttribute("aria-label",messages.length?"Profilo, notifiche: "+messages.join(", "):"Profilo");
 if(announceUnemployed){
  if(unemployed>0&&unemployed!==lastAnnouncedUnemployed){
   unemployedNoticeUnread=true;
   showToast("Hai "+unemployed+" "+(unemployed===1?"lavoratore disoccupato":"lavoratori disoccupati")+". Apri Il tuo territorio → Popolazione per assegnarli.");
  }
  if(unemployed===0)unemployedNoticeUnread=false;
  lastAnnouncedUnemployed=unemployed;
 }
}
function colonyResourceTypes(){
 const own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 if(!own||own.resources?.status!=="ok")return [];
 return (own.resources.items||[]).filter(r=>r.detected!==false).map(r=>r.type).filter((v,i,a)=>RESOURCE_TYPES[v]&&a.indexOf(v)===i);
}
function colonyTotalsAssigned(){return colonyResourceTypes().reduce((s,type)=>s+(Number(colony.assignments?.[type])||0),0)}
function renderColony(){
 const panel=$("colonyResources");if(!panel)return;
 const pop=$("colonyPopulation");if(pop)pop.textContent=String(colony.population);
 const types=colonyResourceTypes(),own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 let html="";
 if(own?.resources?.status==="pending")html='<p class="colony-note">Analisi delle risorse in corso…</p>';
 else if(!types.length)html='<p class="colony-note">Conquista una zona con risorse mappate per iniziare la raccolta.</p>';
 else html=types.map(type=>{
  const workers=Number(colony.assignments[type])||0,amount=Number(colony.inventory[type])||0,rate=workers*RESOURCE_RATE_PER_WORKER_MINUTE;
  return '<div class="colony-resource colony-'+type+'"><div class="colony-resource-head"><span>'+RESOURCE_TYPES[type].icon+' '+RESOURCE_TYPES[type].label+'</span><strong>'+amount.toFixed(2)+'</strong></div><div class="colony-resource-sub"><span>'+workers+' lavoratori</span><span>+'+rate.toFixed(0)+'/min</span></div><div class="colony-worker-controls"><button type="button" data-resource="'+type+'" data-delta="-1" aria-label="Rimuovi un lavoratore">−</button><span>'+workers+'</span><button type="button" data-resource="'+type+'" data-delta="1" aria-label="Aggiungi un lavoratore">+</button></div></div>';
 }).join("");
 $("colonyResources").innerHTML=html;
 const unassigned=colony.population-colonyTotalsAssigned(),free=$("colonyUnassigned");
 if(free)free.textContent=unassigned+" non assegnati";
 updateProfileNotifications(false);
 $("colonyResources").querySelectorAll("button[data-resource]").forEach(btn=>btn.addEventListener("click",()=>changeWorkerAssignment(btn.dataset.resource,Number(btn.dataset.delta))));
}
async function persistColony(){
 if(!currentUser||!colonyLoaded||colonySaving)return;
 colonySaving=true;
 try{
  const row={owner_id:currentUser.id,population:colony.population,assignments:colony.assignments,inventory:colony.inventory,last_tick:new Date(colonyLastTick).toISOString(),updated_at:new Date().toISOString()};
  const {error}=await db.from("territorials_colonies").upsert(row,{onConflict:"owner_id"});
  if(error)throw error;
 }catch(e){console.error("Colony save:",e);showToast("Impossibile salvare i dati della colonia.");}
 finally{colonySaving=false}
}
async function loadColony(){
 const {data,error}=await db.from("territorials_colonies").select("*").eq("owner_id",currentUser.id).maybeSingle();
 if(error)throw error;
 if(data){
  colony={population:Math.max(1,Number(data.population)||1),assignments:data.assignments||{},inventory:data.inventory||{},last_tick:data.last_tick||new Date().toISOString()};
  colonyLastTick=new Date(colony.last_tick).getTime();
 }else{
  colony={population:1,assignments:{},inventory:{},last_tick:new Date().toISOString()};colonyLastTick=Date.now();
  const {error:insertError}=await db.from("territorials_colonies").insert({owner_id:currentUser.id,population:1,assignments:{},inventory:{},last_tick:new Date(colonyLastTick).toISOString()});
  if(insertError)throw insertError;
 }
 colonyLoaded=true;
 tickColony();
 renderColony();
 updateProfileNotifications(true);
}
function tickColony(){
 if(!currentUser||!colonyLoaded)return;
 const now=Date.now(),elapsed=Math.max(0,(now-colonyLastTick)/1000);
 if(elapsed<1)return;
 for(const type of colonyResourceTypes()){
  const workers=Math.max(0,Number(colony.assignments[type])||0);
  if(workers)colony.inventory[type]=(Number(colony.inventory[type])||0)+(workers*RESOURCE_RATE_PER_WORKER_MINUTE*elapsed/60);
 }
 colonyLastTick=now;colony.last_tick=new Date(now).toISOString();renderColony();persistColony();
}
async function changeWorkerAssignment(type,delta){
 if(!colonyResourceTypes().includes(type))return;
 const current=Number(colony.assignments[type])||0;
 if(delta>0&&colonyTotalsAssigned()>=colony.population)return;
 if(delta<0&&current<=0)return;
 colony.assignments[type]=current+delta;
 renderColony();updateProfileNotifications(true);await persistColony();
}
setInterval(tickColony,15000);
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden"){
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
  walkPreviousPosition=null;walkPreviousAt=0;
 }else{tickColony();if(currentUser&&!TEST_MODE)startGpsWatch()}
});
function resourceMarkup(resources){
 if(resources?.status==="pending")return '<p class="resource-empty"><i class="resource-pending-indicator"></i> Analisi risorse in corso</p>';
 if(!resources||resources.status!=="ok")return '<p class="resource-empty">'+escHtml(resources?.message||"Nessuna informazione cartografica disponibile per questa zona.")+'</p>'+(resources?.details?'<p class="resource-empty"><small>Dettagli tecnici: '+escHtml(resources.details)+'</small></p>':"")+'<button type="button" class="auth-secondary retry-osm-analysis">↻ Riprova analisi della mappa</button>';
 if(!resources.items?.length)return '<p class="resource-empty">Nessuna delle risorse mappate è stata rilevata in questa zona.</p>';
 const base=resources.items.map(r=>'<div class="resource-row resource-'+r.type+'"><span class="resource-icon">'+r.icon+'</span><div class="resource-copy"><strong>'+escHtml(r.label)+'</strong><small>'+(r.detected===false?"Non rilevata nei dati OSM":r.area_m2>0?fmtArea(r.area_m2)+" di superficie · "+r.share_pct+"%":"Presenza rilevata su OSM (superficie non stimabile)")+'</small><span class="resource-meter"><i style="width:'+Math.min(100,r.share_pct)+'%"></i></span></div></div>').join("");
 const pois=resources.poi_features;
 if(!pois)return base+'<p class="resource-empty">Punti di interesse OSM: analisi non ancora eseguita.</p>';
 if(pois.status!=="ok")return base+'<p class="resource-empty">Punti di interesse OSM non disponibili: '+escHtml(pois.details||"Server non raggiungibile")+'</p>';
 const rows=(pois.counts||[]).map(p=>'<div class="resource-row resource-poi"><span class="resource-icon">📍</span><div class="resource-copy"><strong>'+escHtml(p.label)+'</strong><small>'+escHtml(p.key+"="+p.value)+'</small></div><strong>'+p.count+'</strong></div>').join("");
 return base+'<h3>📍 Strutture e punti di interesse OSM ('+pois.count+')</h3>'+(rows||'<p class="resource-empty">Nessun punto di interesse OSM rilevato.</p>');
}
async function retryOwnResourceAnalysis(){
 const zone=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 if(!zone){showToast("Non hai un territorio da analizzare.");return}
 const key=zone.id+":"+zone.created_at;
 if(resourceAnalysesInFlight.has(key)){showToast("Analisi delle risorse già in corso.");return}
 const previous=zone.resources;
 const pending={status:"pending",items:[],poi_features:previous?.poi_features};
 try{
  const {data,error}=await db.from("territorials_zones").update({resources:pending}).eq("id",zone.id).eq("owner_id",zone.owner_id).eq("created_at",zone.created_at).select("id").maybeSingle();
  if(error)throw error;
  if(!data){showToast("Il territorio è cambiato: riapri la schermata.");return}
  zone.resources=pending;
  if(currentZoneDetailsId===zone.id&&!$("zoneModal").classList.contains("hidden"))$("zoneResources").innerHTML="<h3>Risorse di questo territorio</h3>"+resourceMarkup(pending);
  const resourceTab=document.querySelector('.territory-tab.active');
  if(resourceTab?.dataset.tab==="resources"&&!$("territoryPanel").hidden)renderTerritoryTab("resources");
  showToast("Nuova analisi visiva della mappa avviata.");
  analyzeAndStoreResources({...zone,resources:previous},true);
 }catch(error){console.error("Retry OSM:",error);showToast("Impossibile riavviare l’analisi.")}
}
document.addEventListener("click",event=>{
 if(event.target.closest(".retry-osm-analysis"))retryOwnResourceAnalysis();

});
function profileInitials(name){return String(name||"G").trim().split(/\s+/).slice(0,2).map(s=>s[0]||"").join("").toUpperCase()}
function achievementList(){return [
 {id:"first_kingdom",title:"Crea il tuo primo regno",description:"Disegna e conquista il tuo primo territorio.",icon:"🏰",done:!!playerAchievements.first_kingdom},
 {id:"walk_one_km",title:"Cammina per un km",description:"Percorri 1.000 metri con il GPS mentre Territorials è aperta.",icon:"🥾",done:!!playerAchievements.walk_one_km,progress:Math.min(1000,Math.round(walkedMeters)),target:1000}
]}
function renderProfileTab(tab){
 document.querySelectorAll(".profile-tab").forEach(b=>b.classList.toggle("active",b.dataset.profileTab===tab));
 const content=$("profileTabContent");if(!content)return;
 if(tab==="achievements"){
  const newlyUnlocked=new Set(pendingAchievementNotices);
  content.innerHTML='<div class="achievement-intro">Completa le sfide per costruire la tua storia da conquistatore.</div>'+achievementList().map(a=>'<article class="achievement-card '+(a.done?"is-unlocked":"is-locked")+(newlyUnlocked.has(a.id)?" is-new":"")+'"><span class="achievement-icon">'+a.icon+'</span><div class="achievement-copy"><strong>'+escHtml(a.title)+'</strong><p>'+escHtml(a.description)+'</p>'+(a.id==="walk_one_km"?'<div class="achievement-progress"><i style="width:'+Math.min(100,a.progress/10)+'%"></i></div><small>'+a.progress+' / 1.000 m</small>':'')+'</div><span class="achievement-status">'+(a.done?"✓":"🔒")+'</span></article>').join("");
  if(newlyUnlocked.size){
   pendingAchievementNotices=[];
   updateProfileNotifications(false);
   // Salva l'avvenuta lettura; una nuova notifica arriverà solo per un nuovo obiettivo.
   savePlayerProgress();
  }
 }else{
  content.innerHTML='<div class="profile-overview"><div class="profile-summary"><div id="profileAvatar" class="profile-avatar">?</div><div><strong id="profileName">Giocatore</strong><small id="profileEmail"></small></div></div><div class="profile-details" id="profileDetails"></div><div class="avatar-editor"><label for="avatarFile">FOTO PROFILO</label><input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><button id="avatarUploadBtn" class="auth-secondary" type="button">Carica / cambia avatar</button><small id="avatarUploadStatus">Carica una foto per farti riconoscere sulla mappa.</small></div><button id="profileLogout" class="auth-secondary">Esci dall’account</button></div>';
  const meta=currentUser?.user_metadata||{},name=playerName||displayName(currentUser),photo=meta.avatar_url||meta.picture||meta.photo_url||"";
  $("profileName").textContent=name;$("profileEmail").textContent=currentUser.email||"Account ospite";
  $("profileAvatar").innerHTML=photo?'<img src="'+escHtml(photo)+'" alt="Foto profilo">':escHtml(profileInitials(name));
  $("profileDetails").innerHTML='<div><small>TIPO ACCOUNT</small><strong>'+(currentUser.is_anonymous?"Ospite":"Giocatore registrato")+'</strong></div><div><small>COLONIA</small><strong>'+colony.population+' abitanti</strong></div><div><small>CAMMINATA</small><strong>'+fmtDistance(walkedMeters)+'</strong></div>';
  const upload=$("avatarUploadStatus");if(upload)upload.textContent=photo?"Immagine profilo impostata. Puoi sostituirla quando vuoi.":"Carica una foto per farti riconoscere sulla mappa.";
  $("avatarUploadBtn").addEventListener("click",()=>$("avatarFile").click());$("avatarFile").addEventListener("change",uploadProfileAvatar);
  $("profileLogout").addEventListener("click",async()=>{const {error}=await db.auth.signOut();if(error)showToast(error.message);else{closeSidePanels();await refreshSession()}});
 }
}
async function savePlayerProgress(){
 if(!currentUser)return;
 if(walkingSaving){walkingSaveQueued=true;return}
 walkingSaving=true;
 try{
  do{
   walkingSaveQueued=false;
   const metadata={...(currentUser.user_metadata||{}),territorials_walked_m:Math.round(walkedMeters),territorials_achievements:playerAchievements,territorials_pending_achievements:pendingAchievementNotices};
   const {data,error}=await db.auth.updateUser({data:metadata});if(error)throw error;
   currentUser=data.user||{...currentUser,user_metadata:metadata};
  }while(walkingSaveQueued);
 }catch(e){console.warn("Progress save:",e)}finally{
  walkingSaving=false;
  if(walkingSaveQueued){walkingSaveQueued=false;savePlayerProgress()}
 }
}
async function unlockAchievement(id){
 if(playerAchievements[id])return;
 playerAchievements[id]=true;pendingAchievementNotices=[...new Set([...pendingAchievementNotices,id])];updateProfileNotifications(false);await savePlayerProgress();
 showToast(id==="first_kingdom"?"Obiettivo sbloccato: primo regno!":"Obiettivo sbloccato: 1 km a piedi!");
 if(!$("profilePanel").hidden&&document.querySelector('.profile-tab.active')?.dataset.profileTab==="achievements")renderProfileTab("achievements");
}
function loadPlayerProgress(){
 const meta=currentUser?.user_metadata||{},storedAchievements=meta.territorials_achievements||{};
 walkedMeters=Math.max(0,Number(meta.territorials_walked_m)||0);walkPersistedAt=walkedMeters;
 playerAchievements={first_kingdom:!!storedAchievements.first_kingdom,walk_one_km:!!storedAchievements.walk_one_km};
 pendingAchievementNotices=(Array.isArray(meta.territorials_pending_achievements)?meta.territorials_pending_achievements:[]).filter(id=>playerAchievements[id]);
 if(walkedMeters>=1000){
  playerAchievements.walk_one_km=true;
  if(!storedAchievements.walk_one_km)pendingAchievementNotices=[...new Set([...pendingAchievementNotices,"walk_one_km"])];
 }
 if(savedTerritories.some(z=>z.owner_id===currentUser?.id)){
  playerAchievements.first_kingdom=true;
  if(!storedAchievements.first_kingdom)pendingAchievementNotices=[...new Set([...pendingAchievementNotices,"first_kingdom"])];
 }
 if(playerAchievements.first_kingdom||playerAchievements.walk_one_km||pendingAchievementNotices.length)savePlayerProgress();
 updateProfileNotifications(false);
}
function renderProfile(){if(!currentUser)return;renderProfileTab("overview")}
function renderTerritorySummary(){
 const box=$("territorySummary"),z=savedTerritories.find(t=>t.owner_id===currentUser?.id);
 if(!box)return;
 if(!z){box.innerHTML='<div class="territory-summary-empty">Non hai ancora conquistato un territorio.</div>';return}
 const pts=z.points||[],lat=pts.length?pts.reduce((s,p)=>s+Number(p.lat),0)/pts.length:0,lng=pts.length?pts.reduce((s,p)=>s+Number(p.lng),0)/pts.length:0;
 const lats=pts.map(p=>Number(p.lat)),lngs=pts.map(p=>Number(p.lng));
 const bounds=pts.length?((Math.max(...lats)-Math.min(...lats))*111320):0;
 const width=pts.length?((Math.max(...lngs)-Math.min(...lngs))*111320*Math.cos(lat*Math.PI/180)):0;
 const key="territory-location-"+z.id;
 box.innerHTML='<div class="territory-summary-title"><span>📍 COLLOCAZIONE</span><strong>'+escHtml(z.territory_name||("Territorio di "+z.owner_name))+'</strong></div><div class="territory-location" id="'+key+'">Coordinate: '+lat.toFixed(5)+', '+lng.toFixed(5)+'</div><div class="territory-dimensions"><div><small>SUPERFICIE</small><strong>'+fmtArea(Number(z.area_m2)||0)+'</strong></div><div><small>PERIMETRO</small><strong>'+fmtDistance(Number(z.perimeter_m)||0)+'</strong></div><div><small>ESTENSIONE N-S</small><strong>'+fmtDistance(bounds)+'</strong></div><div><small>ESTENSIONE E-O</small><strong>'+fmtDistance(width)+'</strong></div></div>';
 if(pts.length){
  fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lng)+"&zoom=14&addressdetails=1",{headers:{"Accept-Language":"it"}}).then(r=>r.ok?r.json():null).then(data=>{
   const target=$(key);if(!target||!data?.address)return;
   const a=data.address,place=a.village||a.town||a.city||a.hamlet||a.suburb||a.neighbourhood||a.municipality||a.county||"";
   const region=a.state||a.region||"";
   if(place)target.textContent=place+(region?", "+region:"")+" · "+lat.toFixed(5)+", "+lng.toFixed(5);
  }).catch(()=>{});
 }
}
function renderTerritoryTab(tab){
 const content=$("territoryTabContent");
 renderTerritorySummary();
 document.querySelectorAll(".territory-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 if(tab==="population"){
  content.innerHTML='<div class="tab-intro">Gestisci gli abitanti e assegna la forza lavoro alle risorse della tua zona.</div><div class="colony-title"><span>🏕️ POPOLAZIONE</span><strong><span id="colonyPopulation">1</span> abitanti</strong></div><div class="colony-inventory-title">ASSEGNAZIONE LAVORATORI</div><div id="colonyResources"></div><div class="colony-footer"><span>Forza lavoro libera</span><strong id="colonyUnassigned">1 non assegnato</strong></div><small class="colony-rate-note">1 lavoratore raccoglie 1 unità al minuto. La colonia lavora anche quando sei offline.</small>';
  renderColony();
  if(unemployedNoticeUnread){unemployedNoticeUnread=false;updateProfileNotifications(false)}
 }else if(tab==="resources"){
  const own=savedTerritories.find(z=>z.owner_id===currentUser?.id),resources=own?.resources;
  content.innerHTML='<div class="tab-intro">Risorse naturali individuate all’interno del tuo territorio.</div>'+(resources?.status==="pending"?'<p class="resource-empty">Analisi delle risorse in corso…</p>':resourceMarkup(resources));
 }else if(tab==="warehouse"){
  const types=["forest","food","materials","water"];
  content.innerHTML='<div class="tab-intro">Materiali raccolti dalla colonia e disponibili per le attività future.</div>'+types.map(type=>'<div class="resource-row resource-'+type+'"><span class="resource-icon">'+RESOURCE_TYPES[type].icon+'</span><div class="resource-copy"><strong>'+RESOURCE_TYPES[type].label+'</strong><small>Disponibili in magazzino</small></div><strong class="warehouse-amount">'+(Number(colony.inventory[type])||0).toFixed(2)+'</strong></div>').join("");
 }else{
  content.innerHTML='<div class="create-placeholder"><div>⚒</div><strong>Costruisci la tua colonia</strong><p>Qui potrai utilizzare le risorse del magazzino per costruire edifici, strutture e miglioramenti.</p><small>Sezione in preparazione</small></div>';
 }
}
function openResources(){
 const own=savedTerritories.filter(z=>z.owner_id===currentUser?.id);
 const totals={forest:0,food:0,materials:0,water:0};
 let known=false;
 own.forEach(z=>{if(z.resources?.status==="ok"){known=true;(z.resources.items||[]).forEach(r=>{if(totals[r.type]!==undefined)totals[r.type]+=Number(r.area_m2)||0})}});
 const pending=own.some(z=>z.resources?.status==="pending");
 $("resourcesIntro").textContent=own.length+" territori · superfici complessive rilevate";
 const pendingMarkup=pending?'<p class="resource-empty">Calcolo risorse in corso…</p>':"";
 const totalsMarkup=known?Object.entries(totals).filter(([,v])=>v>0).map(([k,v])=>'<div class="resource-row resource-'+k+'"><span class="resource-icon">'+RESOURCE_TYPES[k].icon+'</span><div class="resource-copy"><strong>'+RESOURCE_TYPES[k].label+'</strong><small>'+fmtArea(v)+' complessivi</small></div></div>').join(""):'<p class="resource-empty">Non ci sono ancora dati sulle risorse.</p>';
 $("resourcesList").innerHTML=pending?pendingMarkup+totalsMarkup:totalsMarkup;
 $("resourcesModal").classList.remove("hidden");
 renderColony();
}

function perimeter(points){let total=0;for(let i=0;i<points.length;i++)total+=distance(points[i],points[(i+1)%points.length]);return total}
function fmtDistance(v){return v>=1000?(v/1000).toFixed(2)+" km":Math.round(v)+" m"}
function showZoneDetails(z,first){
 currentZoneDetailsId=z.id;
 $("zoneTitle").textContent="Hai chiuso il tuo territorio!";$("territoryNameInput").value=z.territory_name||("Territorio di "+z.owner_name);
 $("zoneDescription").textContent="La zona è stata registrata a nome di "+z.owner_name+".";
 $("zoneArea").textContent=fmtArea(Number(z.area_m2));
 $("zonePerimeter").textContent=fmtDistance(Number(z.perimeter_m));
 $("zoneDistance").textContent=fmtDistance(Number(z.distance_m));
 $("zonePoints").textContent=z.points.length;
 $("zoneDate").textContent="Conquistata il "+new Date(z.created_at).toLocaleString("it-IT");
 $("zoneResources").innerHTML="<h3>Risorse di questo territorio</h3>"+resourceMarkup(z.resources);
 $("zoneModal").classList.remove("hidden");
}
async function saveClosedZone(points,m2,walked){
 if(!Number.isFinite(m2)||m2>MAX_TERRITORY_AREA){showToast("Territorio non valido: la superficie massima consentita è 2 ettari (20.000 m²).");return null}
 if(!currentUser){showAuth("Accedi o registrati per salvare la tua zona.");return null}
 const ownerId=currentUser.id,name=playerName||displayName(currentUser),avatar=currentUser.user_metadata?.avatar_url||currentUser.user_metadata?.picture||currentUser.user_metadata?.photo_url||null,resources={status:"pending",items:[]},row={owner_id:ownerId,owner_name:name,owner_avatar_url:avatar,territory_name:savedTerritories.find(z=>z.owner_id===ownerId)?.territory_name||"Il mio regno",points:points.map(p=>({lat:p.lat,lng:p.lng})),area_m2:Math.round(m2),perimeter_m:Math.round(perimeter(points)),distance_m:Math.round(walked),resources,created_at:new Date().toISOString()};
 // La nuova conquista sostituisce la riga del giocatore, mantenendo valida la regola di una sola zona per account.
 const previous=savedTerritories.find(z=>z.owner_id===ownerId);
 const result=previous
  ?await db.from("territorials_zones").update(row).eq("owner_id",ownerId).select("*").single()
  :await db.from("territorials_zones").insert(row).select("*").single();
 const {data,error}=result;
 if(error)throw error;
 savedTerritories=savedTerritories.filter(z=>z.owner_id!==ownerId);
 savedTerritories.push(data);
 await unlockAchievement("first_kingdom");
 await loadZones();
 // L'analisi OSM parte da loadZones e riprende anche se l'app viene riaperta.
 return data;
}

function updatePlayerMarker(p){
 if(!playerMarker){
  playerMarker=L.marker(p,{icon:L.divIcon({className:"player-marker-icon",html:'<div class="player-dot"><span></span></div>',iconSize:[30,30],iconAnchor:[15,15]}),zIndexOffset:1000,keyboard:false,draggable:TEST_MODE}).addTo(map);
  playerMarker.on("drag",e=>onSimulatedPosition(e.target.getLatLng()));playerMarker.on("dragend",e=>onSimulatedPosition(e.target.getLatLng()));
 }else playerMarker.setLatLng(p);
}
function applyMovementPoint(p){
 position={lat:p.lat,lng:p.lng};updatePositionBanner();
 if(recording&&expansionZone){
  const inside=pointInPolygon(p,expansionZone.points);
  if(!expansionLeft&&!inside){
   expansionLeft=true;
   const last=track[track.length-1]||p;
   expansionExit=boundaryCrossing(last,p,expansionZone.points)||p;
   expansionPath=[expansionExit,p];
   $("hint").textContent="Sei fuori dai confini: traccia la nuova area e rientra nel territorio.";
  }else if(expansionLeft&&!inside){
   if(!expansionPath.length||distance(expansionPath[expansionPath.length-1],p)>=2)expansionPath.push(p);
  }else if(expansionLeft&&inside){
   const last=expansionPath[expansionPath.length-1];
   const entry=boundaryCrossing(last,p,expansionZone.points);
   if(entry){expansionPath.push(entry);tryCloseExpansion(entry)}
  }
 }
 if(recording){
  if(track.length===0){track.push(p);trackLine.addLatLng(p)}
  else{const last=track[track.length-1],d=distance(last,p);if(d>=4){track.push(p);totalDistance+=d;trackLine.addLatLng(p)}}
  updateStats();
if(!expansionZone)tryCloseLoop(p);
 }
}
function onSimulatedPosition(p){
 if(!TEST_MODE)return;
 accuracy=5;updateAccuracyCircle(p);applyMovementPoint(p);
 $("gpsPill").classList.add("active");$("gpsPill").querySelector("span").textContent="Posizione simulata";
 $("recenterBtn").disabled=false;
 if(!recording&&!(track.length>=3&&area(track)>MAX_TERRITORY_AREA))$("hint").textContent=recording?"Spostamento simulato: distanza, punti e confine si aggiornano mentre trascini il segnalino.":"Trascina il segnalino verde sulla mappa. Quando inizi il tracciamento, ogni spostamento verrà conteggiato come camminata.";
}
function updateAccuracyCircle(p){const radius=Math.max(5,Math.min(accuracy,1000));if(!accuracyCircle)accuracyCircle=L.circle(p,{radius,color:"#287cff",weight:1,fillColor:"#287cff",fillOpacity:.07,interactive:false}).addTo(map);else{accuracyCircle.setLatLng(p);accuracyCircle.setRadius(radius)}}
function recordWalkingPosition(p,acc){
 if(!currentUser||TEST_MODE||document.visibilityState!=="visible")return;
 const now=Date.now();
 if(!Number.isFinite(acc)||acc>35){walkPreviousPosition=null;walkPreviousAt=0;return}
 if(walkPreviousPosition&&walkPreviousAt){
  const elapsed=(now-walkPreviousAt)/1000,d=distance(walkPreviousPosition,p);
  if(elapsed>0&&elapsed<=30&&d>=2&&d<=Math.max(35,elapsed*4.5)){
   walkedMeters+=d;
   if(walkedMeters>=1000&&!playerAchievements.walk_one_km)unlockAchievement("walk_one_km");
   if(walkedMeters-walkPersistedAt>=25){walkPersistedAt=walkedMeters;savePlayerProgress()}
   if(!$("profilePanel").hidden&&document.querySelector('.profile-tab.active')?.dataset.profileTab==="achievements")renderProfileTab("achievements");
  }
 }
 walkPreviousPosition=p;walkPreviousAt=now;
}
function onPosition(event){
 const c=event.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return;
 const p=L.latLng(c.latitude,c.longitude);position={lat:p.lat,lng:p.lng};accuracy=Number.isFinite(c.accuracy)?c.accuracy:999;recordWalkingPosition({lat:p.lat,lng:p.lng},accuracy);
 setGpsActive(true,accuracy>100?"GPS impreciso":"GPS attivo");
 updatePlayerMarker(p);updateAccuracyCircle(p);
 if(!hasInitialGpsView){map.setView(p,17,{animate:false});hasInitialGpsView=true}
 $("recenterBtn").disabled=false;
 $("hint").textContent=accuracy>100?"Posizione approssimativa: il computer non fornisce un GPS preciso. Il segnalino indica comunque la posizione stimata.":"GPS attivo. La posizione viene aggiornata automaticamente, come in Street Coins.";
 applyMovementPoint(p);
 if(recording&&accuracy>MAX_TRACK_ACCURACY&&!(track.length>=3&&area(track)>MAX_TERRITORY_AREA)){$("hint").textContent="Segnalino aggiornato, ma precisione GPS insufficiente per tracciare il confine. Attendi un fix più preciso."}
}
function gpsError(error){
 if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null}
 const message=error.code===1?"Permesso GPS negato. Consenti la posizione al sito nelle impostazioni del browser.":error.code===2?"Il dispositivo o il computer non riesce a determinare la posizione. Attiva i servizi di localizzazione di Windows/macOS.":"GPS lento: controlla i servizi di localizzazione e riprova.";
 setGpsActive(false,"GPS non disponibile");$("locateBtn").disabled=false;showToast(message);$("hint").textContent=message;
 if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
}
function startGpsWatch(){
 if(!navigator.geolocation){showToast("Geolocalizzazione non disponibile in questo browser.");return}
 if(watchId!==null){showToast("GPS già attivo.");return}
 $("locateBtn").disabled=true;$("locateBtn").textContent="◎ Ricerca GPS…";$("hint").textContent="Attendo la posizione del dispositivo…";showToast("Richiesta posizione GPS avviata");
 if(gpsWatchdog)clearTimeout(gpsWatchdog);
 gpsWatchdog=setTimeout(()=>{if(!position){$("locateBtn").disabled=false;$("locateBtn").textContent="◎ Riprova GPS";$("hint").textContent="Nessuna posizione ricevuta. Su computer, verifica che i servizi di localizzazione del sistema operativo siano attivi e che il browser abbia il permesso.";showToast("Nessuna posizione GPS ricevuta entro 30 secondi.")}},30000);
 try{watchId=navigator.geolocation.watchPosition(event=>{if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null}$("locateBtn").disabled=false;onPosition(event)},gpsError,{enableHighAccuracy:true,maximumAge:0,timeout:30000})}
 catch(error){if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null}watchId=null;$("locateBtn").disabled=false;$("locateBtn").textContent="◎ Riprova GPS";showToast("Impossibile avviare il GPS: "+(error.message||"controlla i permessi."))}
}
function startTracking(){
 if(!currentUser){showAuth("Accedi prima di tracciare.");return}if(recording||!position)return;
 expansionZone=savedTerritories.find(z=>z.owner_id===currentUser.id&&pointInPolygon(position,z.points))||null;expansionLeft=false;expansionPath=[];expansionExit=null;recording=true;areaLimitWarned=false;track=[];totalDistance=0;
 trackLine=L.polyline([],{color:"#16bd91",weight:5,opacity:.95}).addTo(map);
 $("startBtn").textContent=expansionZone?"Espansione attiva":"Tracciamento attivo";$("startBtn").disabled=true;$("cancelBtn").disabled=false;$("drawState").textContent=expansionZone?"Espansione del regno":"Stai disegnando il tuo confine";$("liveDot").classList.add("active");
 $("hint").textContent=expansionZone?"Esci dai confini, percorri il nuovo perimetro esterno e rientra nel territorio da un altro punto.":"Cammina lungo il perimetro e torna al punto iniziale.";
 if(TEST_MODE||accuracy<=MAX_TRACK_ACCURACY){track.push(L.latLng(position.lat,position.lng));trackLine.addLatLng(track[0]);updateStats()}else if(watchId===null)startGpsWatch();
}
function boundaryCrossing(a,b,ring){
 if(!a||!b)return null;
 const ax=a.lng,ay=a.lat,bx=b.lng,by=b.lat;
 let best=null,bestT=Infinity;
 for(let i=0;i<ring.length;i++){
  const c=ring[i],d=ring[(i+1)%ring.length],rx=bx-ax,ry=by-ay,sx=d.lng-c.lng,sy=d.lat-c.lat;
  const det=rx*sy-ry*sx;if(Math.abs(det)<1e-16)continue;
  const t=((c.lng-ax)*sy-(c.lat-ay)*sx)/det,u=((c.lng-ax)*ry-(c.lat-ay)*rx)/det;
  if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8&&t<bestT){bestT=t;best={lat:ay+t*ry,lng:ax+t*rx}}
 }
 return best;
}
async function tryCloseExpansion(entry){
 if(!expansionZone||!expansionLeft||!expansionExit||expansionPath.length<3||window.zoneSaving)return;
 const original=expansionZone,path=expansionPath.slice(),patch=path.map(p=>({lat:p.lat,lng:p.lng}));
 if(distance(patch[0],patch[patch.length-1])<3){showToast("Esci e rientra da punti diversi del confine.");return}
 window.zoneSaving=true;
 try{
  const base=territoryFeature(original.points),extension=territoryFeature(patch);
  if(turf.kinks(extension).features.length){showToast("Il percorso esterno si incrocia.");return}
  const merged=turf.union(turf.featureCollection([base,extension]));
  if(!merged||merged.geometry.type!=="Polygon"||merged.geometry.coordinates.length!==1){showToast("L'espansione deve essere continua e collegata al territorio.");return}
  const points=merged.geometry.coordinates[0].slice(0,-1).map(([lng,lat])=>({lat,lng})),m2=area(points),added=m2-area(original.points);
  if(added<MIN_AREA/2){showToast("Espansione troppo piccola.");return}
  if(m2>MAX_TERRITORY_AREA){showToast("Il territorio non può superare 2 ettari.");return}
  for(const rival of savedTerritories){
   if(rival.owner_id===currentUser.id||rival.points.length<3)continue;
   const overlap=turf.intersect(turf.featureCollection([merged,territoryFeature(rival.points)]));
   if(overlap&&turf.area(overlap)>1){showToast("Non puoi invadere un territorio rivale.");return}
  }
  $("drawState").textContent="Salvataggio espansione…";
  const {data,error}=await db.from("territorials_zones").update({points,area_m2:Math.round(m2),perimeter_m:Math.round(perimeter(points)),distance_m:Math.round((Number(original.distance_m)||0)+totalDistance),resources:{status:"pending",items:[]}}).eq("id",original.id).eq("owner_id",currentUser.id).select("*").single();
  if(error)throw error;
  stopTracking(true);$("areaValue").textContent=fmtArea(m2);$("drawState").textContent="Territorio espanso!";
  $("hint").textContent="Nuova superficie: +"+fmtArea(added);
  await loadZones();showZoneDetails(data,false);showToast("Territorio espanso: +"+fmtArea(added));
 }catch(e){console.error("Espansione:",e);showToast("Espansione non riuscita: "+(e.message||"riprova"))}
 finally{window.zoneSaving=false}
}
async function tryCloseLoop(current){
 if(track.length<MIN_POINTS||!currentUser)return;
 const start=track[0],d=distance(start,current);if(d>CLOSE_DISTANCE)return;
 const polygonPoints=track.slice(0,-1);if(polygonPoints.length<MIN_POINTS)return;
 const m2=area(polygonPoints);if(m2<MIN_AREA)return;
 if(m2>MAX_TERRITORY_AREA){if(!areaLimitWarned)showToast("Territorio troppo grande: 2 ettari è il limite massimo. Riduci il perimetro prima di chiuderlo.");areaLimitWarned=true;$("drawState").textContent="Limite di 2 ettari superato";$("hint").textContent="Chiusura bloccata: il territorio misura "+fmtArea(m2)+". Riduci il perimetro a massimo 2 ettari e riprova.";return}
 if(window.zoneSaving||pendingNewTerritory)return;
 const previous=savedTerritories.find(z=>z.owner_id===currentUser.id);
 if(previous){
  pendingNewTerritory={points:polygonPoints.map(p=>({lat:p.lat,lng:p.lng})),m2,walked:totalDistance};
  $("zoneTitle").textContent="Hai chiuso un nuovo territorio!";
  $("zoneDescription").textContent="Possiedi già un regno. Vuoi conservare quello precedente oppure sostituirlo con questo nuovo territorio?";
  $("zoneArea").textContent=fmtArea(m2);$("zonePerimeter").textContent=fmtDistance(perimeter(polygonPoints));$("zoneDistance").textContent=fmtDistance(totalDistance);
  $("zonePoints").textContent=polygonPoints.length;$("zoneDate").textContent="Nuovo territorio non ancora salvato";
  $("zoneResources").innerHTML="";
  $("territoryNameInput").closest(".territory-name-editor").hidden=true;
  $("zoneOk").hidden=true;$("zoneReplaceActions").hidden=false;
  $("zoneModal").classList.remove("hidden");return;
 }
 await commitNewTerritory({points:polygonPoints,m2,walked:totalDistance});
}
async function commitNewTerritory(candidate){
 if(window.zoneSaving)return;window.zoneSaving=true;
 try{
  const first=!savedTerritories.some(z=>z.owner_id===currentUser.id);
  $("drawState").textContent="Salvataggio del territorio…";
  const z=await saveClosedZone(candidate.points,candidate.m2,candidate.walked);
  if(!z)return;
  pendingNewTerritory=null;stopTracking(true);$("areaValue").textContent=fmtArea(candidate.m2);
  $("drawState").textContent="Territorio creato!";$("hint").textContent="Il nuovo territorio è stato salvato.";
  $("zoneReplaceActions").hidden=true;$("zoneOk").hidden=false;
  $("territoryNameInput").closest(".territory-name-editor").hidden=false;
  showZoneDetails(z,first);updatePositionBanner();
 }catch(e){showToast("Non è stato possibile salvare il territorio: "+(e.message||"riprova"))}
 finally{window.zoneSaving=false}
}
function discardNewTerritory(){
 pendingNewTerritory=null;$("zoneModal").classList.add("hidden");
 $("zoneReplaceActions").hidden=true;$("zoneOk").hidden=false;
 $("territoryNameInput").closest(".territory-name-editor").hidden=false;
 stopTracking(false);updatePositionBanner();showToast("Il regno precedente è stato conservato.");
}
function stopTracking(completed){recording=false;expansionZone=null;expansionLeft=false;expansionPath=[];expansionExit=null;areaLimitWarned=false;$("startBtn").disabled=false;$("startBtn").textContent="Inizia a tracciare";$("cancelBtn").disabled=true;$("liveDot").classList.remove("active");if(trackLine){map.removeLayer(trackLine);trackLine=null}if(!completed){track=[];totalDistance=0;updateStats();$("drawState").textContent="Tracciamento annullato";$("hint").textContent="Quando vuoi, puoi iniziare un nuovo percorso."}updateTerritoryControls()}
function cancelTracking(){if(!recording)return;stopTracking(false);$("territoryName").textContent="Zona libera";showToast("Tracciamento annullato")}

async function saveTerritoryName(){
 const z=savedTerritories.find(item=>item.id===currentZoneDetailsId);if(!z||z.owner_id!==currentUser?.id)return;
 const name=$("territoryNameInput").value.trim().slice(0,36);if(!name){showToast("Inserisci un nome per il territorio.");return;}
 const btn=$("saveTerritoryNameBtn");btn.disabled=true;
 try{const {error}=await db.from("territorials_zones").update({territory_name:name}).eq("id",z.id).eq("owner_id",currentUser.id);if(error)throw error;z.territory_name=name;await loadZones();showToast("Nome del territorio aggiornato.");}
 catch(e){showToast("Non è stato possibile salvare il nome: "+(e.message||"riprova."));}finally{btn.disabled=false}
}
async function uploadProfileAvatar(){
 const input=$("avatarFile"),file=input.files?.[0];if(!file)return;
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)){showToast("Usa un'immagine JPG, PNG o WebP.");input.value="";return;}
 if(file.size>3*1024*1024){showToast("L'immagine deve pesare al massimo 3 MB.");input.value="";return;}
 const status=$("avatarUploadStatus"),button=$("avatarUploadBtn");button.disabled=true;status.textContent="Caricamento in corso…";
 try{
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path=currentUser.id+"/avatar-"+Date.now()+"."+ext;
  const {error:uploadError}=await db.storage.from("territory-avatars").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:true});if(uploadError)throw uploadError;
  const {data:publicData}=db.storage.from("territory-avatars").getPublicUrl(path),url=publicData.publicUrl;
  const {data,error}=await db.auth.updateUser({data:{avatar_url:url}});if(error)throw error;currentUser=data.user||currentUser;
  const {error:zoneError}=await db.from("territorials_zones").update({owner_avatar_url:url}).eq("owner_id",currentUser.id);if(zoneError)throw zoneError;
  await loadZones();renderProfile();status.textContent="Foto aggiornata: ora è visibile anche sul territorio.";showToast("Avatar aggiornato.");
 }catch(e){console.error("Avatar upload:",e);status.textContent="Caricamento non riuscito. Verifica la configurazione dello spazio avatar.";showToast("Errore caricamento avatar: "+(e.message||"riprova."));}
 finally{button.disabled=false;input.value=""}
}

async function deleteOwnTerritory(){
 const own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 if(!own){showToast("Non hai una zona da eliminare.");updateTerritoryControls();return}
 if(recording){showToast("Annulla prima il tracciamento.");return}
 if(!confirm("Vuoi eliminare definitivamente la tua zona e le relative risorse? Potrai crearne una nuova."))return;
 const btn=$("deleteZoneBtn");btn.disabled=true;
 try{
  const {error}=await db.from("territorials_zones").delete().eq("id",own.id).eq("owner_id",currentUser.id);
  if(error)throw error;
  if(trackLine){map.removeLayer(trackLine);trackLine=null}track=[];totalDistance=0;updateStats();
  await loadZones();
  $("drawState").textContent="Zona eliminata";$("hint").textContent="Ora puoi tracciare e conquistare una nuova zona.";
  showToast("La tua zona è stata eliminata.");
 }catch(e){showToast("Errore durante l’eliminazione: "+(e.message||"riprova."))}
 finally{btn.disabled=false;updateTerritoryControls()}
}
$("deleteZoneBtn").addEventListener("click",deleteOwnTerritory);
$("saveTerritoryNameBtn").addEventListener("click",saveTerritoryName);
function closeSidePanels(){["profilePanel","territoryPanel","drawPanel"].forEach(id=>$(id).hidden=true);document.querySelectorAll(".rail-button").forEach(b=>b.classList.remove("active"))}
function toggleSidePanel(id,button){
 const wasOpen=!$(id).hidden;closeSidePanels();
 if(!wasOpen){$(id).hidden=false;button.classList.add("active");}
}
$("profileNav").addEventListener("click",()=>{toggleSidePanel("profilePanel",$("profileNav"));if(!$("profilePanel").hidden)renderProfile()});
document.querySelectorAll(".profile-tab").forEach(b=>b.addEventListener("click",()=>renderProfileTab(b.dataset.profileTab)));
$("exploreNav").addEventListener("click",()=>toggleSidePanel("drawPanel",$("exploreNav")));
$("territoryNav").addEventListener("click",()=>{toggleSidePanel("territoryPanel",$("territoryNav"));if(!$("territoryPanel").hidden)renderTerritoryTab("resources")});
document.querySelectorAll("[data-close-panel]").forEach(b=>b.addEventListener("click",closeSidePanels));
document.querySelectorAll(".territory-tab").forEach(b=>b.addEventListener("click",()=>renderTerritoryTab(b.dataset.tab)));
$("authSignup").addEventListener("click",registerPlayer);$("authLogin").addEventListener("click",loginPlayer);$("authGuest").addEventListener("click",enterAsGuest);
$("zoneClose").onclick=()=>{if(pendingNewTerritory)discardNewTerritory();else $("zoneModal").classList.add("hidden")};$("zoneOk").onclick=()=>$("zoneModal").classList.add("hidden");$("zoneKeepOld").onclick=discardNewTerritory;$("zoneReplaceOld").onclick=()=>{if(pendingNewTerritory)commitNewTerritory(pendingNewTerritory)};$("resourcesClose").onclick=()=>$("resourcesModal").classList.add("hidden");$("resourcesOk").onclick=()=>$("resourcesModal").classList.add("hidden");
db.auth.onAuthStateChange(()=>setTimeout(()=>refreshSession().catch(e=>authMessage(e.message)),0));
$("locateBtn").addEventListener("click",startGpsWatch);$("startBtn").addEventListener("click",startTracking);$("cancelBtn").addEventListener("click",cancelTracking);
$("recenterBtn").addEventListener("click",()=>{if(position){map.setView([position.lat,position.lng],17,{animate:false});if(playerMarker)playerMarker.setLatLng([position.lat,position.lng])}else{showToast("Attiva prima il GPS.");startGpsWatch()}});
window.addEventListener("beforeunload",()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId)});
updateStats();
function updateModeUI(){
 $("testModePill").hidden=!TEST_MODE;
 $("gpsPill").hidden=TEST_MODE;
 $("locateBtn").hidden=TEST_MODE;
 $("modeToggleBtn").textContent=TEST_MODE?"Passa a GPS":"Attiva modalità test";
 $("modeToggleBtn").setAttribute("aria-pressed",String(TEST_MODE));
 if(playerMarker){if(TEST_MODE)playerMarker.dragging.enable();else playerMarker.dragging.disable()}
}
function toggleTestMode(){
 if(recording){showToast("Annulla il tracciamento prima di cambiare modalità.");return}
 TEST_MODE=!TEST_MODE;
 if(TEST_MODE){
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
  if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null}
  walkPreviousPosition=null;walkPreviousAt=0;
  if(!position){const p=map.getCenter();position={lat:p.lat,lng:p.lng};accuracy=5}
  updatePlayerMarker(position);updateAccuracyCircle(position);
  $("hint").textContent="Modalità test attiva: trascina il segnalino verde per simulare una camminata.";
  $("drawState").textContent="Modalità test pronta";
 }else{
  setGpsActive(false,"GPS non attivo");
  $("hint").textContent="Modalità GPS attiva: il GPS misura la camminata mentre Territorials è aperta.";
  $("drawState").textContent="Pronto a tracciare?";
  if(currentUser&&document.visibilityState==="visible")startGpsWatch();
 }
 updateModeUI();updatePositionBanner();showToast(TEST_MODE?"Modalità test attivata":"Modalità GPS attivata");
}
$("modeToggleBtn").addEventListener("click",toggleTestMode);
const initial=map.getCenter();position={lat:initial.lat,lng:initial.lng};accuracy=5;
updatePlayerMarker(initial);updateAccuracyCircle(initial);$("recenterBtn").disabled=false;updatePositionBanner();updateTerritoryControls();updateModeUI();
if(TEST_MODE){
 $("drawState").textContent="Modalità test pronta";
 $("hint").textContent="Trascina il segnalino verde sulla mappa per simulare una camminata. Premi «Inizia a tracciare» per disegnare un territorio.";
}else{
 $("hint").textContent="Modalità GPS attiva: premi «Attiva GPS» per usare la posizione reale.";
}
