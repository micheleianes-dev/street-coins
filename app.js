/* STREET COINS V28 */
const APP_VERSION="V28";
const SUPABASE_URL="https://ibqponyeathgxiweujvd.supabase.co";
const SUPABASE_KEY="sb_publishable_JhMo2NOsorp_HLE2Vd2BSg_VJJt6e-0";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const TRENT0={lat:46.0679,lon:11.1211},SEED_RADIUS=3600;
const ENDPOINTS=["https://overpass.private.coffee/api/interpreter","https://ovp.dresel.systems/api/interpreter","https://overpass-api.de/api/interpreter"];
const map=L.map("map",{zoomControl:false,preferCanvas:true,zoomSnap:1,zoomDelta:1,minZoom:14,maxZoom:17}).setView([0,0],2);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_52vs_1_1db3e835804d22b5902148c7",{maxZoom:20,subdomains:"abcd",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const layer=L.layerGroup().addTo(map),$=id=>document.getElementById(id);
map.on("click",e=>{const lat=e.latlng.lat,lon=e.latlng.lng;L.popup().setLatLng(e.latlng).setContent(`<div class="coord-popup"><b>Punto selezionato</b><br>Latitudine: ${lat.toFixed(6)}<br>Longitudine: ${lon.toFixed(6)}</div>`).openOn(map)});
let user=null,admin=false,position=null,accuracy=999,watch=null,coins=[],collected=new Set(),pendingCollections=new Set(),bonusMode=false,audioCtx=null,lastGpsFix=null,headingAnchor=null,gpsWatchdog=null,playerMoving=false,movingSince=0,directionMarker=null,hasInitialGpsView=false,stableHeading=null,lastHeadingUpdate=0;
$("appVersion").textContent=APP_VERSION;
const status=$("status"),locate=$("locateBtn"),account=$("accountBtn"),bonus=$("bonusBtn"),refresh=$("refreshBtn"),recenter=$("recenterBtn");
function say(s){status.textContent=s}
function playVictory(){
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  audioCtx=audioCtx||new AC();if(audioCtx.state==="suspended")audioCtx.resume();
  const now=audioCtx.currentTime;
  [[523.25,0],[659.25,.13],[783.99,.26],[1046.5,.42]].forEach(([f,t])=>{
   const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.value=f;
   g.gain.setValueAtTime(.0001,now+t);g.gain.exponentialRampToValueAtTime(.16,now+t+.025);g.gain.exponentialRampToValueAtTime(.0001,now+t+.34);
   o.connect(g);g.connect(audioCtx.destination);o.start(now+t);o.stop(now+t+.36);
  });
 }catch(e){console.warn("Audio vittoria non disponibile",e)}
}
function showVictory(c){
 const panel=$("victoryPanel"),img=$("victoryImage");
 $("victoryTitle").textContent=c.name||c.code;
 $("victoryDescription").textContent=c.description||"Hai trovato una nuova moneta!";
 if(c.image_path){img.src=db.storage.from("coin-images").getPublicUrl(c.image_path).data.publicUrl;img.classList.remove("hidden")}
 else{img.removeAttribute("src");img.classList.add("hidden")}
 panel.classList.remove("hidden");playVictory();
 const fx=$("fireworks");fx.innerHTML="";
 for(let i=0;i<28;i++){const p=document.createElement("i"),angle=Math.PI*2*i/28,distance=55+Math.random()*95;p.style.setProperty("--x",Math.cos(angle)*distance+"px");p.style.setProperty("--y",Math.sin(angle)*distance+"px");p.style.setProperty("--h",Math.floor(Math.random()*360));fx.appendChild(p)}
}

function dist(a,b){const r=Math.PI/180,R=6371000,d1=(b.lat-a.lat)*r,d2=(b.lon-a.lon)*r,x=Math.sin(d1/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearingBetween(a,b){const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dLon=(b.lon-a.lon)*r,y=Math.sin(dLon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);return (Math.atan2(y,x)/r+360)%360}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function updateCount(){$("coinCount").textContent=collected.size;$("bonusCount").textContent=1+Math.floor(collected.size/10);bonus.disabled=!user||!position}
function birdIcon(moving){
 const svg='<svg viewBox="0 0 64 64" role="img" aria-label="Uccello bianco visto dall’alto"><path class="bird-body" d="M32 5 C27 9 25 16 25 24 C17 23 8 27 3 34 C12 37 19 39 25 38 C25 47 28 54 32 60 C36 54 39 47 39 38 C45 39 52 37 61 34 C56 27 47 23 39 24 C39 16 37 9 32 5Z" fill="#fff" stroke="#344054" stroke-width="2.8" stroke-linejoin="round"/><path class="bird-wing" d="M25 27 C18 25 10 29 5 34 C13 36 19 36 25 35Z" fill="#f7f9fc" stroke="#344054" stroke-width="1.5" stroke-linejoin="round"/><path class="bird-wing" d="M39 27 C46 25 54 29 59 34 C51 36 45 36 39 35Z" fill="#f7f9fc" stroke="#344054" stroke-width="1.5" stroke-linejoin="round"/><path d="M29 12 L32 8 L35 12" fill="none" stroke="#d5dce5" stroke-width="1.5" stroke-linecap="round"/><circle cx="29" cy="20" r="1.4" fill="#344054"/><circle cx="35" cy="20" r="1.4" fill="#344054"/></svg>';
 return L.divIcon({className:'player-bird-icon '+(moving?'is-moving':'is-perched'),html:'<div class="bird-wrap">'+svg+'</div>',iconSize:[58,58],iconAnchor:[29,32]});
}
function directionArrowIcon(heading){
 const svg='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 L29 28 L16 21 L3 28 Z" fill="#287cff" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
 return L.divIcon({className:"direction-arrow-icon",html:'<div class="direction-arrow" style="transform:rotate('+heading+'deg)">'+svg+'</div>',iconSize:[30,30],iconAnchor:[-12,15]});
}
function updateDirectionArrow(stamp,heading){
 if(!playerMoving){movingSince=0;if(directionMarker&&map.hasLayer(directionMarker))map.removeLayer(directionMarker);directionMarker=null;return}
 if(!movingSince)movingSince=stamp;
 if(stamp-movingSince<2800||heading===null||!Number.isFinite(heading))return;
 const arrowIcon=directionArrowIcon(heading);
 if(!directionMarker||!map.hasLayer(directionMarker))directionMarker=L.marker([position.lat,position.lon],{icon:arrowIcon,interactive:false,zIndexOffset:1100}).addTo(map);
 else{directionMarker.setLatLng([position.lat,position.lon]);directionMarker.setIcon(arrowIcon)}
}
function icon(c){let inner=c.image_path?`<img src="${db.storage.from("coin-images").getPublicUrl(c.image_path).data.publicUrl}">`:"<span>★</span>";return L.divIcon({className:"",html:`<div class="coin-marker ${collected.has(c.id)?"collected":""}" style="background:${esc(c.color||"#ff6eae")}">${inner}</div>`,iconSize:[42,42],iconAnchor:[21,21]})}
function draw(){layer.clearLayers();coins.forEach(c=>{c.marker=L.marker([c.latitude,c.longitude],{icon:icon(c)}).addTo(layer);c.marker.bindPopup(`<div class="coin-popup"><b>${esc(c.name||c.code)}</b><p>${esc(c.description||"Nessuna descrizione disponibile.")}</p>${collected.has(c.id)?'<small>Già raccolta da te</small>':""}</div>`);c.marker.on("click",()=>{const el=c.marker.getElement()?.querySelector(".coin-marker");if(el){el.classList.remove("coin-tap");void el.offsetWidth;el.classList.add("coin-tap")}if(bonusMode||(position&&dist(position,{lat:c.latitude,lon:c.longitude})<=collectionRadius()))collect(c)})})}
async function loadCoins(){let {data,error}=await db.from("coins").select("*").order("code");if(error)throw error;coins=data||[];draw();return coins.length}
async function syncUser(){
 let {data:{session}}=await db.auth.getSession();user=session?.user||null;admin=false;collected=new Set();
 if(user){
  const [a,c]=await Promise.all([db.from("admins").select("user_id").eq("user_id",user.id).maybeSingle(),db.from("coin_collections").select("coin_id").eq("user_id",user.id)]);
  admin=!!a.data;if(c.data)collected=new Set(c.data.map(x=>x.coin_id));
 }
 account.textContent=user?(admin?"Admin":"Account"):"Accedi";updateCount();draw();
}
async function collect(c){
 if(!user){say("Accedi per raccogliere questa moneta.");$("authPanel").classList.remove("hidden");$("authMsg").textContent="Accedi o crea un account per salvare le monete.";return}
 if(collected.has(c.id)||pendingCollections.has(c.id))return;
 pendingCollections.add(c.id);say("Raccolta della moneta in corso…");
 try{
  const {error}=await db.from("coin_collections").insert({user_id:user.id,coin_id:c.id});
  if(error&&error.code!=="23505")throw error;
  collected.add(c.id);c.marker?.setIcon(icon(c));updateCount();say("Moneta raccolta!");showVictory(c);
 }catch(e){say("Raccolta non completata: "+(e.message||"controlla la connessione e riprova."))}
 finally{pendingCollections.delete(c.id)}
}
function collectionRadius(){return Math.max(35,Math.min(60,accuracy*1.2))}
function collectNearby(){
 if(!position||accuracy>70)return;
 const radius=collectionRadius();
 for(const c of coins){
  if(collected.has(c.id)||pendingCollections.has(c.id))continue;
  if(dist(position,{lat:c.latitude,lon:c.longitude})<=radius){
   if(user)collect(c);
   else say("Sei vicino a una moneta! Accedi per raccoglierla.");
   break;
  }
 }
}
function startGPS(){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audioCtx=audioCtx||new AC();audioCtx.resume()}}catch(e){}
 if(!navigator.geolocation){say("GPS non disponibile.");return}if(watch!==null)return;
 locate.disabled=true;locate.textContent="◎ Ricerca GPS…";say("Attendo la posizione GPS…");
 if(gpsWatchdog)clearTimeout(gpsWatchdog);
 gpsWatchdog=setTimeout(()=>{if(position===null||locate.disabled){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;locate.disabled=false;locate.textContent="◎ Riprova GPS";say("Il telefono non sta fornendo la posizione. Attiva Posizione e autorizza Chrome ad accedere alla posizione precisa, poi riprova.");}},30000);
 try{watch=navigator.geolocation.watchPosition(p=>{
  if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null;}
  try{
  const nextPosition={lat:p.coords.latitude,lon:p.coords.longitude},stamp=p.timestamp||Date.now(),previousFix=lastGpsFix;
  let speed=Number.isFinite(p.coords.speed)?p.coords.speed:0,derivedHeading=null;
  const newAccuracy=p.coords.accuracy||999;
  if(previousFix){const seconds=(stamp-previousFix.time)/1000,meters=dist(previousFix.position,nextPosition);if(seconds>.2&&!Number.isFinite(p.coords.speed))speed=meters/seconds}
  if(!headingAnchor)headingAnchor={position:nextPosition,time:stamp};
  const anchorSeconds=(stamp-headingAnchor.time)/1000,anchorMeters=dist(headingAnchor.position,nextPosition);
  if(anchorSeconds>=1.2&&anchorMeters>=3&&newAccuracy<=50){derivedHeading=bearingBetween(headingAnchor.position,nextPosition);headingAnchor={position:nextPosition,time:stamp}}
  if(speed>0.75)playerMoving=true;else if(speed<0.4)playerMoving=false;
  const gpsHeading=Number.isFinite(p.coords.heading)&&speed>=0.7?p.coords.heading:null;
  const movementHeading=gpsHeading!==null?gpsHeading:derivedHeading;
  lastGpsFix={position:nextPosition,time:stamp,accuracy:newAccuracy};position=nextPosition;accuracy=newAccuracy;say("Posizione GPS ricevuta: aggiorno la mappa…");
  if(movementHeading!==null){stableHeading=movementHeading;lastHeadingUpdate=stamp;}
  updateDirectionArrow(stamp,movementHeading!==null?movementHeading:stableHeading);
  if(!window.player||!map.hasLayer(window.player)){
   window.player=L.marker([position.lat,position.lon],{icon:birdIcon(playerMoving),zIndexOffset:1000}).addTo(map);
   window.playerMovingState=playerMoving;
  }else{
   window.player.setLatLng([position.lat,position.lon]);
   if(window.playerMovingState!==playerMoving){window.player.setIcon(birdIcon(playerMoving));window.playerMovingState=playerMoving}
  }
  if(!window.circle||!map.hasLayer(window.circle)){
   window.circle=L.circle([position.lat,position.lon],{radius:accuracy,color:"#287cff",weight:1,fillOpacity:.07}).addTo(map);
  }else{
   window.circle.setLatLng([position.lat,position.lon]);
   window.circle.setRadius(accuracy);
  }
  if(!hasInitialGpsView){map.setView([position.lat,position.lon],17,{animate:false});hasInitialGpsView=true}recenter.disabled=false;locate.disabled=false;locate.textContent="◎ GPS attivo";
  say(dist(position,TRENT0)<4100?(accuracy>70?"GPS impreciso: raccolta in pausa":(!user?"GPS attivo · accedi per raccogliere":"GPS attivo · monete fisse di Trento")):"Le 100 monete si trovano a Trento e dintorni");collectNearby();updateCount();
  }catch(err){console.error("Errore aggiornamento posizione",err);locate.disabled=false;locate.textContent="◎ GPS ricevuto";say("GPS ricevuto, ma errore nella mappa: "+(err.message||String(err)));}
 },e=>{if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null;}say(e.code===1?"Permesso GPS negato.":e.code===2?"Posizione GPS non disponibile.":"GPS lento: riprova all'aperto.");locate.disabled=false;locate.textContent="◎ Riprova GPS";if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null},{enableHighAccuracy:true,maximumAge:0,timeout:30000})}catch(e){if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null;}watch=null;locate.disabled=false;locate.textContent="◎ Riprova GPS";say("Impossibile avviare il GPS: "+(e.message||"controlla i permessi del browser."))}
}
async function fetchTrentoWays(){
 const q=`[out:json][timeout:20];way(around:${SEED_RADIUS},${TRENT0.lat},${TRENT0.lon})["highway"~"^(residential|tertiary|secondary|primary|living_street|unclassified|road|service)$"];out geom;`;
 const cs=ENDPOINTS.map(()=>new AbortController());
 try{return await Promise.any(ENDPOINTS.map(async(url,i)=>{let t=setTimeout(()=>cs[i].abort(),22000);try{let r=await fetch(url+"?data="+encodeURIComponent(q),{signal:cs[i].signal});if(!r.ok)throw Error("HTTP "+r.status);let j=await r.json();if(!j.elements?.length)throw Error("Nessuna strada trovata");return j.elements}finally{clearTimeout(t)}}))}
 finally{cs.forEach(c=>c.abort())}
}
function interpolate(nodes,spacing){let out=[],carry=0;for(let i=1;i<nodes.length;i++){let a=nodes[i-1],b=nodes[i],d=dist({lat:a.lat,lon:a.lon},{lat:b.lat,lon:b.lon});if(!d)continue;for(let x=spacing-carry;x<d;x+=spacing){let t=x/d;out.push({latitude:a.lat+(b.lat-a.lat)*t,longitude:a.lon+(b.lon-a.lon)*t})}carry=(carry+d)%spacing}return out}
async function seed(){
 $("seedCoins").disabled=true;$("adminMsg").textContent="Controllo e preparo le posizioni sulle strade di Trento…";
 try{
  let {count,error}=await db.from("coins").select("*",{count:"exact",head:true});if(error)throw error;if(count){$("adminMsg").textContent=`Esistono già ${count} monete. Non ne creo altre.`;return}
  let ways=await fetchTrentoWays(),pts=[];ways.forEach(w=>{if(w.geometry?.length>1)pts.push(...interpolate(w.geometry,65))});
  pts=pts.filter(p=>dist(TRENT0,{lat:p.latitude,lon:p.longitude})<SEED_RADIUS*.98);
  for(let i=pts.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[pts[i],pts[j]]=[pts[j],pts[i]]}
  let chosen=[];for(let p of pts){if(chosen.every(q=>dist({lat:p.latitude,lon:p.longitude},{lat:q.latitude,lon:q.longitude})>45))chosen.push(p);if(chosen.length===100)break}
  if(chosen.length!==100)throw Error(`Trovate solo ${chosen.length} posizioni. Riprova.`);
  let rows=chosen.map((p,i)=>({code:`TR-${String(i+1).padStart(3,"0")}`,latitude:p.latitude,longitude:p.longitude,color:"#ff6eae"}));
  let ins=await db.from("coins").insert(rows);if(ins.error)throw ins.error;
  await loadCoins();$("adminMsg").textContent="Create 100 monete fisse a Trento. Ora le coordinate sono salvate nel database.";
 }catch(e){$("adminMsg").textContent=e.message||"Errore nella creazione delle monete"}
 finally{$("seedCoins").disabled=false}
}
async function showAdmin(){
 $("adminPanel").classList.remove("hidden");$("adminMsg").textContent=user.email;
 let {data,error}=await db.from("coins").select("*").order("code");if(error){$("coinList").textContent=error.message;return}
 $("coinList").innerHTML="";
 data.forEach(c=>{
  let d=document.createElement("div");d.className="coin-admin-row";
  const preview=c.image_path?db.storage.from("coin-images").getPublicUrl(c.image_path).data.publicUrl:"";
  d.innerHTML=`<b>${esc(c.code)}</b>${preview?`<img class="coin-admin-preview" src="${esc(preview)}" alt="Immagine attuale">`:'<p class="no-image">Nessuna immagine caricata</p>'}<label>Nome <input type="text" maxlength="80" value="${esc(c.name||"")}" data-name placeholder="Nome della moneta"></label><label>Descrizione <textarea maxlength="500" data-description placeholder="Descrizione della moneta">${esc(c.description||"")}</textarea></label><label>Lat <input type="number" step=".000001" value="${c.latitude}" data-lat></label><label>Lon <input type="number" step=".000001" value="${c.longitude}" data-lon></label><label>Colore <input type="color" value="${esc(c.color||"#ff6eae")}" data-color></label><label>Immagine <input type="file" accept="image/png,image/jpeg,image/webp" data-file></label><button class="primary" data-save>Salva</button>`;
  $("coinList").appendChild(d);
  d.querySelector("[data-save]").onclick=async()=>{
   let patch={name:d.querySelector("[data-name]").value.trim(),description:d.querySelector("[data-description]").value.trim(),latitude:Number(d.querySelector("[data-lat]").value),longitude:Number(d.querySelector("[data-lon]").value),color:d.querySelector("[data-color]").value};
   let f=d.querySelector("[data-file]").files[0];
   if(f){if(f.size>1024*1024){$("adminMsg").textContent="Immagine massimo 1 MB";return}let path=`${c.code}-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,"")}`;let up=await db.storage.from("coin-images").upload(path,f);if(up.error){$("adminMsg").textContent=up.error.message;return}patch.image_path=path}
   let u=await db.from("coins").update(patch).eq("id",c.id);if(u.error){$("adminMsg").textContent=u.error.message;return}
   await loadCoins();$("adminMsg").textContent=`${c.code} aggiornata`;showAdmin()
  }
 })
}
account.onclick=async()=>{if(!user){$("authPanel").classList.remove("hidden");return}if(admin){showAdmin();return}if(confirm("Vuoi uscire dall'account?")){await db.auth.signOut();await syncUser()}}
$("authClose").onclick=()=>$("authPanel").classList.add("hidden");$("adminClose").onclick=()=>$("adminPanel").classList.add("hidden");$("adminBack").onclick=()=>$("adminPanel").classList.add("hidden");$("victoryNext").onclick=()=>$("victoryPanel").classList.add("hidden");
$("login").onclick=async()=>{let r=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});$("authMsg").textContent=r.error?.message||"Accesso effettuato";if(!r.error){$("authPanel").classList.add("hidden");await syncUser();if(admin)showAdmin()}}
$("signup").onclick=async()=>{let r=await db.auth.signUp({email:$("email").value.trim(),password:$("password").value});$("authMsg").textContent=r.error?.message||"Registrazione avviata: controlla la posta per confermare l'email."}
$("seedCoins").onclick=seed;locate.onclick=startGPS;recenter.onclick=()=>{if(position){map.setView([position.lat,position.lon],map.getZoom(),{animate:false})}};refresh.onclick=()=>loadCoins().then(n=>say(`${n} monete caricate`)).catch(e=>say(e.message));
bonus.onclick=()=>{if(!user){$("authPanel").classList.remove("hidden");return}bonusMode=!bonusMode;bonus.classList.toggle("active",bonusMode);say(bonusMode?"Bonus attivo: tocca una moneta entro 200 metri.":"Bonus disattivato")};
db.auth.onAuthStateChange(()=>setTimeout(syncUser,0));
(async()=>{startGPS();try{await syncUser();let n=await loadCoins();if(!position)say(n?`${n} monete caricate. In attesa della posizione GPS…`:"Database pronto: accedi come amministratore e crea le 100 monete.");}catch(e){say("Errore database: "+e.message)}})();
