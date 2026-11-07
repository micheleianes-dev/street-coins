/* TERRITORIALS — V1.4.0 una zona per giocatore, eliminazione zona */
const TEST_MODE=true;
const SUPABASE_URL="https://ibqponyeathgxiweujvd.supabase.co";
const SUPABASE_KEY="sb_publishable_JhMo2NOsorp_HLE2Vd2BSg_VJJt6e-0";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:14,maxZoom:17,zoomSnap:1,zoomDelta:1}).setView([46.0679,11.1211],17);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const $=id=>document.getElementById(id);
const drawnLayer=L.layerGroup().addTo(map);
let watchId=null,gpsWatchdog=null,position=null,accuracy=999,track=[],trackLine=null,playerMarker=null,accuracyCircle=null,recording=false,totalDistance=0,toastTimer=null,hasInitialGpsView=false;
const CLOSE_DISTANCE=24,MAX_TRACK_ACCURACY=60,MIN_POINTS=5,MIN_AREA=250;
let savedTerritories=[],currentUser=null,playerName="",lastClosedResources=null;
function distance(a,b){const r=Math.PI/180,R=6371000,dLat=(b.lat-a.lat)*r,dLon=(b.lng-a.lng)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function area(points){if(points.length<3)return 0;const lat0=points.reduce((s,p)=>s+p.lat,0)/points.length,scaleX=111320*Math.cos(lat0*Math.PI/180),scaleY=110540;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=(a.lng*scaleX)*(b.lat*scaleY)-(b.lng*scaleX)*(a.lat*scaleY)}return Math.abs(sum/2)}
function fmtArea(value){return value>=10000?(value/10000).toFixed(2)+" ha":Math.round(value)+" m²"}
function showToast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3000)}
function updateStats(){$("distanceValue").textContent=totalDistance>=1000?(totalDistance/1000).toFixed(2)+" km":Math.round(totalDistance)+" m";$("pointValue").textContent=track.length;$("areaValue").textContent=track.length>=3?fmtArea(area(track)):"—"}
function updateTerritoryControls(){
 const own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 const start=$("startBtn"),del=$("deleteZoneBtn");
 if(!start||!del)return;
 del.hidden=!own;
 start.disabled=!!own||recording;
 start.textContent=own?"Hai già una zona":"Inizia a tracciare";
 if(own&&!recording)$("hint").textContent="Hai già conquistato una zona. Eliminala per poterne creare un’altra.";
}
function updatePositionBanner(){
 let found=null;if(position)for(const t of savedTerritories){if(pointInPolygon(position,t.points)){found=t;break}}
 $("territoryName").textContent=found?"Zona di "+found.owner_name:"Zona libera";
 if(found&&window.lastTerritoryNotice!==found.id){window.lastTerritoryNotice=found.id;showToast("Zona di "+found.owner_name)}
 if(!found)window.lastTerritoryNotice=null;
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
  const poly=L.polygon(z.points,{color:z.owner_id===currentUser?.id?"#16bd91":"#6687e8",weight:3,fillColor:z.owner_id===currentUser?.id?"#25d6a6":"#8298f0",fillOpacity:.22}).addTo(drawnLayer);
  poly.bindTooltip("Zona di "+escHtml(z.owner_name),{sticky:true,direction:"top"});
  poly.bindPopup("<b>Zona di "+escHtml(z.owner_name)+"</b><br>"+fmtArea(Number(z.area_m2)||0)+"<br><small>"+new Date(z.created_at).toLocaleDateString("it-IT")+"</small>");
 });
 updatePositionBanner();
 updateTerritoryControls();
}
async function refreshSession(){
 const {data:{session},error}=await db.auth.getSession();if(error)throw error;
 currentUser=session?.user||null;playerName=currentUser?displayName(currentUser):"";
 if(currentUser){$("authPanel").classList.add("hidden");$("authTitle").textContent="Bentornato";await loadZones()}
 else{savedTerritories=[];drawnLayer.clearLayers();$("authPanel").classList.remove("hidden");$("authTitle").textContent="Entra nel gioco"}
}
async function registerPlayer(){
 const name=$("playerName").value.trim(),email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!name||!email||password.length<6){authMessage("Inserisci un nome, un'email e una password di almeno 6 caratteri.");return}
 $("authSignup").disabled=true;
 try{const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name,full_name:name}}});if(error)throw error;
 if(data.session){currentUser=data.user;playerName=name;$("authPanel").classList.add("hidden");await loadZones();authMessage("Account creato. Buon gioco!")}
 else authMessage("Registrazione avviata: controlla la posta per confermare l'email.");
 }catch(e){authMessage(e.message||"Registrazione non riuscita.")}finally{$("authSignup").disabled=false}
}
async function loginPlayer(){
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!email||!password){authMessage("Inserisci email e password.");return}
 $("authLogin").disabled=true;
 try{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;currentUser=data.user;playerName=displayName(data.user);$("authPanel").classList.add("hidden");await loadZones();showToast("Bentornato, "+playerName)}
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
  $("authPanel").classList.add("hidden");await loadZones();
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
function resourceClass(tags){
 if(tags.landuse==="forest")return "forest";
 if(tags.landuse==="farmland"||tags.landuse==="meadow")return "food";
 if(tags.natural==="water")return "water";
 if(tags.building||tags.landuse==="industrial")return "materials";
 return null;
}
async function calculateTerritoryResources(points){
 const boundary=territoryFeature(points);if(!boundary||!window.turf)return {status:"unknown",items:[],message:"Analisi cartografica non disponibile."};
 const poly=points.map(p=>p.lat+" "+p.lng).join(" ");
 const query='[out:json][timeout:25];(way(poly:"'+poly+'")[landuse=forest];way(poly:"'+poly+'")[landuse=farmland];way(poly:"'+poly+'")[landuse=meadow];way(poly:"'+poly+'")[building];way(poly:"'+poly+'")[landuse=industrial];way(poly:"'+poly+'")[natural=water];);out body geom;';
 const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
 let data=null,lastError=null;
 for(const endpoint of endpoints){try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query)});if(!response.ok)throw new Error("Overpass HTTP "+response.status);data=await response.json();break}catch(e){lastError=e}}
 if(!data)return {status:"unknown",items:[],message:"Dati OpenStreetMap temporaneamente non raggiungibili."};
 const groups={forest:[],food:[],materials:[],water:[]};
 for(const element of (data.elements||[])){
  if(element.type!=="way"||!Array.isArray(element.geometry)||element.geometry.length<4)continue;
  const kind=resourceClass(element.tags||{});if(!kind)continue;
  const coords=element.geometry.map(p=>[p.lon,p.lat]);
  if(coords[0][0]!==coords[coords.length-1][0]||coords[0][1]!==coords[coords.length-1][1])coords.push(coords[0]);
  try{
   const feature=turf.polygon([coords]),clipped=turf.intersect(turf.featureCollection([feature,boundary]));
   if(clipped&&turf.area(clipped)>1)groups[kind].push(clipped);
  }catch(e){}
 }
 const items=[];
 for(const [key,features] of Object.entries(groups)){
  if(!features.length)continue;
  let merged=features[0];
  for(let i=1;i<features.length;i++){try{merged=turf.union(turf.featureCollection([merged,features[i]]))||merged}catch(e){}}
  const m2=Math.min(turf.area(boundary),turf.area(merged));
  if(m2>1)items.push({type:key,label:RESOURCE_TYPES[key].label,icon:RESOURCE_TYPES[key].icon,area_m2:Math.round(m2),share_pct:Math.round(m2/turf.area(boundary)*1000)/10});
 }
 return {status:"ok",items,source:"OpenStreetMap",analyzed_at:new Date().toISOString()};
}
function resourceMarkup(resources){
 if(!resources||resources.status!=="ok")return '<p class="resource-empty">'+escHtml(resources?.message||"Nessuna informazione cartografica disponibile per questa zona.")+'</p>';
 if(!resources.items?.length)return '<p class="resource-empty">Nessuna delle risorse mappate è stata rilevata in questa zona.</p>';
 return resources.items.map(r=>'<div class="resource-row"><span class="resource-icon">'+r.icon+'</span><div class="resource-copy"><strong>'+escHtml(r.label)+'</strong><small>'+fmtArea(r.area_m2)+' di superficie · '+r.share_pct+'%</small><span class="resource-meter"><i style="width:'+Math.min(100,r.share_pct)+'%"></i></span></div></div>').join("");
}
function openResources(){
 const own=savedTerritories.filter(z=>z.owner_id===currentUser?.id);
 const totals={forest:0,food:0,materials:0,water:0};
 let known=false;
 own.forEach(z=>{if(z.resources?.status==="ok"){known=true;(z.resources.items||[]).forEach(r=>{if(totals[r.type]!==undefined)totals[r.type]+=Number(r.area_m2)||0})}});
 $("resourcesIntro").textContent=own.length+" territori · superfici complessive rilevate";
 $("resourcesList").innerHTML=known?Object.entries(totals).filter(([,v])=>v>0).map(([k,v])=>'<div class="resource-row"><span class="resource-icon">'+RESOURCE_TYPES[k].icon+'</span><div class="resource-copy"><strong>'+RESOURCE_TYPES[k].label+'</strong><small>'+fmtArea(v)+' complessivi</small></div></div>').join(""):'<p class="resource-empty">Non ci sono ancora dati sulle risorse. Chiudi un territorio per avviare l’analisi OpenStreetMap.</p>';
 $("resourcesModal").classList.remove("hidden");
}

function perimeter(points){let total=0;for(let i=0;i<points.length;i++)total+=distance(points[i],points[(i+1)%points.length]);return total}
function fmtDistance(v){return v>=1000?(v/1000).toFixed(2)+" km":Math.round(v)+" m"}
function showZoneDetails(z,first){
 $("zoneTitle").textContent=first?"Hai chiuso la tua prima zona!":"Zona conquistata!";
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
 if(!currentUser){showAuth("Accedi o registrati per salvare la tua zona.");return null}
 const name=playerName||displayName(currentUser),resources=await calculateTerritoryResources(points),row={owner_id:currentUser.id,owner_name:name,points:points.map(p=>({lat:p.lat,lng:p.lng})),area_m2:Math.round(m2),perimeter_m:Math.round(perimeter(points)),distance_m:Math.round(walked),resources};
 const {data,error}=await db.from("territorials_zones").insert(row).select("*").single();
 if(error)throw error;
 savedTerritories.push(data);updateTerritoryControls();return data;
}

function updatePlayerMarker(p){
 if(!playerMarker){
  playerMarker=L.marker(p,{icon:L.divIcon({className:"player-marker-icon",html:'<div class="player-dot"><span></span></div>',iconSize:[30,30],iconAnchor:[15,15]}),zIndexOffset:1000,keyboard:false,draggable:TEST_MODE}).addTo(map);
  if(TEST_MODE){playerMarker.on("drag",e=>onSimulatedPosition(e.target.getLatLng()));playerMarker.on("dragend",e=>onSimulatedPosition(e.target.getLatLng()))}
 }else playerMarker.setLatLng(p);
}
function applyMovementPoint(p){
 position={lat:p.lat,lng:p.lng};updatePositionBanner();
 if(recording){
  if(track.length===0){track.push(p);trackLine.addLatLng(p)}
  else{const last=track[track.length-1],d=distance(last,p);if(d>=4){track.push(p);totalDistance+=d;trackLine.addLatLng(p)}}
  updateStats();
tryCloseLoop(p);
 }
}
function onSimulatedPosition(p){
 if(!TEST_MODE)return;
 accuracy=5;updateAccuracyCircle(p);applyMovementPoint(p);
 $("gpsPill").classList.add("active");$("gpsPill").querySelector("span").textContent="Posizione simulata";
 $("recenterBtn").disabled=false;
 $("hint").textContent=recording?"Spostamento simulato: distanza, punti e confine si aggiornano mentre trascini il segnalino.":"Trascina il segnalino verde sulla mappa. Quando inizi il tracciamento, ogni spostamento verrà conteggiato come camminata.";
}
function updateAccuracyCircle(p){const radius=Math.max(5,Math.min(accuracy,1000));if(!accuracyCircle)accuracyCircle=L.circle(p,{radius,color:"#287cff",weight:1,fillColor:"#287cff",fillOpacity:.07,interactive:false}).addTo(map);else{accuracyCircle.setLatLng(p);accuracyCircle.setRadius(radius)}}
function onPosition(event){
 const c=event.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return;
 const p=L.latLng(c.latitude,c.longitude);position={lat:p.lat,lng:p.lng};accuracy=Number.isFinite(c.accuracy)?c.accuracy:999;
 setGpsActive(true,accuracy>100?"GPS impreciso":"GPS attivo");
 updatePlayerMarker(p);updateAccuracyCircle(p);
 if(!hasInitialGpsView){map.setView(p,17,{animate:false});hasInitialGpsView=true}
 $("recenterBtn").disabled=false;
 $("hint").textContent=accuracy>100?"Posizione approssimativa: il computer non fornisce un GPS preciso. Il segnalino indica comunque la posizione stimata.":"GPS attivo. La posizione viene aggiornata automaticamente, come in Street Coins.";
 applyMovementPoint(p);
 if(recording&&accuracy>MAX_TRACK_ACCURACY){$("hint").textContent="Segnalino aggiornato, ma precisione GPS insufficiente per tracciare il confine. Attendi un fix più preciso."}
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
function startTracking(){if(!currentUser){showAuth("Accedi o registrati prima di iniziare a tracciare.");return}if(savedTerritories.some(z=>z.owner_id===currentUser.id)){showToast("Puoi avere una sola zona. Elimina quella attuale per crearne un’altra.");updateTerritoryControls();return}if(!TEST_MODE&&!navigator.geolocation){showToast("GPS non disponibile in questo browser.");return}if(recording)return;recording=true;track=[];totalDistance=0;trackLine=L.polyline([],{color:"#16bd91",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(map);$("startBtn").textContent="Tracciamento attivo";$("startBtn").disabled=true;$("cancelBtn").disabled=false;$("drawState").textContent="Stai disegnando il tuo confine";$("liveDot").classList.add("active");$("hint").textContent="Cammina per disegnare il perimetro. Torna vicino al punto iniziale per chiuderlo.";if(TEST_MODE){if(position){track.push(L.latLng(position.lat,position.lng));trackLine.addLatLng(track[0]);updateStats()}else{showToast("Posiziona prima il segnalino sulla mappa.");stopTracking(false)}}else if(watchId===null)startGpsWatch();else if(position&&accuracy<=MAX_TRACK_ACCURACY){track.push(L.latLng(position.lat,position.lng));trackLine.addLatLng(track[0]);updateStats()}}
async function tryCloseLoop(current){
 if(track.length<MIN_POINTS||!currentUser)return;
 const start=track[0],d=distance(start,current);if(d>CLOSE_DISTANCE)return;
 const polygonPoints=track.slice(0,-1);if(polygonPoints.length<MIN_POINTS)return;
 const m2=area(polygonPoints);if(m2<MIN_AREA)return;
 if(window.zoneSaving)return;window.zoneSaving=true;
 try{
  const first=savedTerritories.filter(z=>z.owner_id===currentUser.id).length===0;
  const z=await saveClosedZone(polygonPoints,m2,totalDistance);
  if(!z) return;
  L.polygon([...polygonPoints,polygonPoints[0]],{color:"#159f7c",weight:3,fillColor:"#25d6a6",fillOpacity:.28}).addTo(drawnLayer).bindTooltip("Zona di "+escHtml(z.owner_name));
  stopTracking(true);$("areaValue").textContent=fmtArea(m2);$("drawState").textContent="Territorio creato!";$("hint").textContent="Hai chiuso il perimetro: il tuo territorio è stato salvato.";
  showZoneDetails(z,first);updatePositionBanner();
 }catch(e){showToast("Non è stato possibile salvare la zona: "+(e.message||"riprova"));$("hint").textContent="Errore nel salvataggio. Il perimetro è ancora aperto: torna vicino al punto iniziale per riprovare."}
 finally{window.zoneSaving=false}
}
function stopTracking(completed){recording=false;$("startBtn").disabled=false;$("startBtn").textContent="Inizia a tracciare";$("cancelBtn").disabled=true;$("liveDot").classList.remove("active");if(!completed){if(trackLine)map.removeLayer(trackLine);trackLine=null;track=[];totalDistance=0;updateStats();$("drawState").textContent="Tracciamento annullato";$("hint").textContent="Quando vuoi, puoi iniziare un nuovo percorso."}updateTerritoryControls()}
function cancelTracking(){if(!recording)return;stopTracking(false);$("territoryName").textContent="Zona libera";showToast("Tracciamento annullato")}
async function deleteOwnTerritory(){
 const own=savedTerritories.find(z=>z.owner_id===currentUser?.id);
 if(!own){showToast("Non hai una zona da eliminare.");updateTerritoryControls();return}
 if(recording){showToast("Annulla prima il tracciamento.");return}
 if(!confirm("Vuoi eliminare definitivamente la tua zona e le relative risorse? Potrai crearne una nuova."))return;
 const btn=$("deleteZoneBtn");btn.disabled=true;
 try{
  const {error}=await db.from("territorials_zones").delete().eq("id",own.id).eq("owner_id",currentUser.id);
  if(error)throw error;
  await loadZones();
  $("drawState").textContent="Zona eliminata";$("hint").textContent="Ora puoi tracciare e conquistare una nuova zona.";
  showToast("La tua zona è stata eliminata.");
 }catch(e){showToast("Errore durante l’eliminazione: "+(e.message||"riprova."))}
 finally{btn.disabled=false;updateTerritoryControls()}
}
$("deleteZoneBtn").addEventListener("click",deleteOwnTerritory);$("authSignup").addEventListener("click",registerPlayer);$("authLogin").addEventListener("click",loginPlayer);$("authGuest").addEventListener("click",enterAsGuest);
$("zoneClose").onclick=()=>$("zoneModal").classList.add("hidden");$("zoneOk").onclick=()=>$("zoneModal").classList.add("hidden");$("resourcesClose").onclick=()=>$("resourcesModal").classList.add("hidden");$("resourcesOk").onclick=()=>$("resourcesModal").classList.add("hidden");$("resourcesBtn").onclick=openResources;$("zoneResourcesBtn").onclick=()=>{$("zoneModal").classList.add("hidden");openResources()};
db.auth.onAuthStateChange(()=>setTimeout(()=>refreshSession().catch(e=>authMessage(e.message)),0));
$("locateBtn").addEventListener("click",startGpsWatch);$("startBtn").addEventListener("click",startTracking);$("cancelBtn").addEventListener("click",cancelTracking);
$("recenterBtn").addEventListener("click",()=>{if(position){map.setView([position.lat,position.lng],17,{animate:false});if(playerMarker)playerMarker.setLatLng([position.lat,position.lng])}else{showToast("Attiva prima il GPS.");startGpsWatch()}});
window.addEventListener("beforeunload",()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId)});
updateStats();
if(TEST_MODE){
 $("testModePill").hidden=false;$("gpsPill").hidden=true;$("locateBtn").hidden=true;
 $("drawState").textContent="Modalità test pronta";
 $("hint").textContent="Trascina il segnalino verde sulla mappa per simulare una camminata. Premi «Inizia a tracciare» per disegnare un territorio.";
 const initial=map.getCenter();position={lat:initial.lat,lng:initial.lng};accuracy=5;
 updatePlayerMarker(initial);updateAccuracyCircle(initial);$("recenterBtn").disabled=false;updatePositionBanner();updateTerritoryControls();
}
