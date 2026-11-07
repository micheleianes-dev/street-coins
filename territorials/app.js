/* TERRITORIALS — V1.1.0 modalità test con movimento simulato */
const TEST_MODE=new URLSearchParams(location.search).get("test")==="1";
const map=L.map("map",{zoomControl:false,preferCanvas:true,minZoom:14,maxZoom:17,zoomSnap:1,zoomDelta:1}).setView([46.0679,11.1211],17);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const $=id=>document.getElementById(id);
const drawnLayer=L.layerGroup().addTo(map);
let watchId=null,gpsWatchdog=null,position=null,accuracy=999,track=[],trackLine=null,playerMarker=null,accuracyCircle=null,recording=false,totalDistance=0,toastTimer=null,hasInitialGpsView=false;
const CLOSE_DISTANCE=24,MAX_TRACK_ACCURACY=60,MIN_POINTS=5,MIN_AREA=250;
const savedTerritories=[];
function distance(a,b){const r=Math.PI/180,R=6371000,dLat=(b.lat-a.lat)*r,dLon=(b.lng-a.lng)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function area(points){if(points.length<3)return 0;const lat0=points.reduce((s,p)=>s+p.lat,0)/points.length,scaleX=111320*Math.cos(lat0*Math.PI/180),scaleY=110540;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=(a.lng*scaleX)*(b.lat*scaleY)-(b.lng*scaleX)*(a.lat*scaleY)}return Math.abs(sum/2)}
function fmtArea(value){return value>=10000?(value/10000).toFixed(2)+" ha":Math.round(value)+" m²"}
function showToast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3000)}
function updateStats(){$("distanceValue").textContent=totalDistance>=1000?(totalDistance/1000).toFixed(2)+" km":Math.round(totalDistance)+" m";$("pointValue").textContent=track.length;$("areaValue").textContent=track.length>=3?fmtArea(area(track)):"—"}
function updatePositionBanner(){let inside=false;if(position)for(const t of savedTerritories){if(pointInPolygon(position,t.points)){inside=true;break}}$("territoryName").textContent=inside?"Il tuo territorio":"Zona libera"}
function pointInPolygon(point,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],cross=((a.lng>point.lng)!==(b.lng>point.lng))&&(point.lat<(b.lat-a.lat)*(point.lng-a.lng)/(b.lng-a.lng)+a.lat);if(cross)inside=!inside}return inside}
function setGpsActive(active,label){$("gpsPill").classList.toggle("active",active);$("gpsPill").querySelector("span").textContent=label;$("locateBtn").textContent=active?"◎ GPS attivo":"◎ Attiva GPS"}
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
  updateStats();tryCloseLoop(p);
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
function startTracking(){if(!TEST_MODE&&!navigator.geolocation){showToast("GPS non disponibile in questo browser.");return}if(recording)return;recording=true;track=[];totalDistance=0;trackLine=L.polyline([],{color:"#16bd91",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(map);$("startBtn").textContent="Tracciamento attivo";$("startBtn").disabled=true;$("cancelBtn").disabled=false;$("drawState").textContent="Stai disegnando il tuo confine";$("liveDot").classList.add("active");$("hint").textContent="Cammina per disegnare il perimetro. Torna vicino al punto iniziale per chiuderlo.";if(TEST_MODE){if(position){track.push(L.latLng(position.lat,position.lng));trackLine.addLatLng(track[0]);updateStats()}else{showToast("Posiziona prima il segnalino sulla mappa.");stopTracking(false)}}else if(watchId===null)startGpsWatch();else if(position&&accuracy<=MAX_TRACK_ACCURACY){track.push(L.latLng(position.lat,position.lng));trackLine.addLatLng(track[0]);updateStats()}}
function tryCloseLoop(current){if(track.length<MIN_POINTS)return;const start=track[0],d=distance(start,current);if(d>CLOSE_DISTANCE)return;const polygonPoints=track.slice(0,-1);if(polygonPoints.length<MIN_POINTS)return;const m2=area(polygonPoints);if(m2<MIN_AREA)return;const closed=[...polygonPoints,start];L.polygon(closed,{color:"#159f7c",weight:3,fillColor:"#25d6a6",fillOpacity:.28}).addTo(drawnLayer);savedTerritories.push({points:polygonPoints});stopTracking(true);$("areaValue").textContent=fmtArea(m2);$("drawState").textContent="Territorio creato!";$("hint").textContent="Hai chiuso il perimetro: il tuo territorio è ora visibile sulla mappa.";showToast("Territorio creato · "+fmtArea(m2));updatePositionBanner()}
function stopTracking(completed){recording=false;$("startBtn").disabled=false;$("startBtn").textContent="Inizia a tracciare";$("cancelBtn").disabled=true;$("liveDot").classList.remove("active");if(!completed){if(trackLine)map.removeLayer(trackLine);trackLine=null;track=[];totalDistance=0;updateStats();$("drawState").textContent="Tracciamento annullato";$("hint").textContent="Quando vuoi, puoi iniziare un nuovo percorso."}}
function cancelTracking(){if(!recording)return;stopTracking(false);$("territoryName").textContent="Zona libera";showToast("Tracciamento annullato")}
$("locateBtn").addEventListener("click",startGpsWatch);$("startBtn").addEventListener("click",startTracking);$("cancelBtn").addEventListener("click",cancelTracking);
$("recenterBtn").addEventListener("click",()=>{if(position){map.setView([position.lat,position.lng],17,{animate:false});if(playerMarker)playerMarker.setLatLng([position.lat,position.lng])}else{showToast("Attiva prima il GPS.");startGpsWatch()}});
window.addEventListener("beforeunload",()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId)});
updateStats();