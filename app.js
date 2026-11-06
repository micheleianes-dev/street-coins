/* STREET COINS V49 */
const APP_VERSION="V49";
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
let categories=[],user=null,admin=false,position=null,accuracy=999,watch=null,coins=[],collected=new Set(),collectionDates=new Map(),pendingCollections=new Set(),avatarUrl="",bonusMode=false,audioCtx=null,lastGpsFix=null,headingAnchor=null,gpsWatchdog=null,playerMoving=false,movingSince=0,movementActive=false,hasInitialGpsView=false,stableHeading=null,lastHeadingUpdate=0,walkingDistanceM=0,lastProgressSave=0;
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
 $("victoryDescription").textContent=c.description||"Hai trovato una nuova Street Card!";
 if(c.image_path){img.src=db.storage.from("coin-images").getPublicUrl(c.image_path).data.publicUrl;img.classList.remove("hidden")}
 else{img.removeAttribute("src");img.classList.add("hidden")}
 panel.classList.remove("hidden");playVictory();
 const fx=$("fireworks");fx.innerHTML="";
 for(let i=0;i<28;i++){const p=document.createElement("i"),angle=Math.PI*2*i/28,distance=55+Math.random()*95;p.style.setProperty("--x",Math.cos(angle)*distance+"px");p.style.setProperty("--y",Math.sin(angle)*distance+"px");p.style.setProperty("--h",Math.floor(Math.random()*360));fx.appendChild(p)}
}

function dist(a,b){const r=Math.PI/180,R=6371000,d1=(b.lat-a.lat)*r,d2=(b.lon-a.lon)*r,x=Math.sin(d1/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearingBetween(a,b){const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dLon=(b.lon-a.lon)*r,y=Math.sin(dLon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);return (Math.atan2(y,x)/r+360)%360}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function updateCount(){
 $("coinCount").textContent=collected.size;
 $("bonusCount").textContent=1+Math.floor(collected.size/10);bonus.disabled=!user||!position;
 const box=$("categoryCounterRows");if(!box)return;box.replaceChildren();
 categories.forEach(cat=>{const items=coins.filter(c=>(c.category||"Generale")===cat.name),got=items.filter(c=>collected.has(c.id)).length;if(!items.length)return;
  const row=document.createElement("span");row.className="counter-category";const dot=document.createElement("i");dot.style.background=cat.color||"#ff6eae";const mark=document.createElement("span");mark.className="counter-category-icon";if(cat.icon_image_path){const img=document.createElement("img");img.src=categoryImage(cat.icon_image_path);img.alt="";mark.appendChild(img)}else mark.textContent=cat.icon_symbol||"✦";const label=document.createElement("b");label.textContent=got+"/"+items.length;row.append(dot,mark,label);box.appendChild(row);
 });
}
function categoryColor(name,fallback){return categories.find(x=>x.name===name)?.color||fallback||"#ff6eae"}
function categoryImage(path){return path?db.storage.from("coin-images").getPublicUrl(path).data.publicUrl:""}
function collectionIconMarkup(category){
 const cat=categories.find(x=>x.name===category)||{};
 return cat.icon_image_path?'<img src="'+esc(categoryImage(cat.icon_image_path))+'" alt="">':'<span>'+esc(cat.icon_symbol||"✦")+'</span>';
}
function playerIcon(){
 const inner=avatarUrl?'<img src="'+esc(avatarUrl)+'" alt="">':'<span>★</span>';
 const walking=movementActive?' is-walking':'';
 const arrow=movementActive&&Number.isFinite(stableHeading)?'<i class="player-direction-arrow" style="--heading:'+stableHeading+'deg"></i>':'';
 return L.divIcon({className:"player-avatar-icon",html:'<div class="player-avatar-marker'+walking+'"><div class="player-avatar-face">'+inner+'</div>'+arrow+'<i class="player-leg leg-left"></i><i class="player-leg leg-right"></i></div>',iconSize:[50,64],iconAnchor:[25,25]});
}
function updatePlayerMarker(){if(window.player&&map.hasLayer(window.player))window.player.setIcon(playerIcon());}
function updateDirectionArrow(stamp,heading){
 if(!playerMoving){movingSince=0;movementActive=false;return}
 if(!movingSince)movingSince=stamp;
 if(heading!==null&&Number.isFinite(heading))stableHeading=heading;
 movementActive=stamp-movingSince>=2800&&stableHeading!==null&&Number.isFinite(stableHeading);
}
function icon(c){
 const color=categoryColor(c.category,c.color),collectionMark=collectionIconMarkup(c.category),photo=c.image_path?'<img src="'+esc(categoryImage(c.image_path))+'" alt="">':'<span class="coin-sticker-placeholder">✦</span>';
 const html='<div class="coin-sticker-wrap" style="--coin-color:'+esc(color)+'"><div class="coin-sticker '+(collected.has(c.id)?"collected":"")+'">'+photo+'<i class="coin-sticker-shine"></i><i class="coin-card-frame"></i><i class="coin-card-emblem">'+collectionMark+'</i></div><i class="coin-sticker-shadow"></i><i class="coin-location-pin"></i></div>';
 return L.divIcon({className:"coin-sticker-icon",html,iconSize:[76,102],iconAnchor:[38,101]});
}
function draw(){layer.clearLayers();coins.forEach(c=>{c.marker=L.marker([c.latitude,c.longitude],{icon:icon(c)}).addTo(layer);c.marker.bindPopup(`<div class="coin-popup"><b>${esc(c.name||c.code)}</b><p>${esc(c.description||"Nessuna descrizione disponibile.")}</p>${collected.has(c.id)?'<small>Già raccolta da te</small>':""}</div>`);c.marker.on("click",()=>{const el=c.marker.getElement()?.querySelector(".coin-sticker");if(el){el.classList.remove("coin-sticker-tap");void el.offsetWidth;el.classList.add("coin-sticker-tap")}if(bonusMode||(position&&dist(position,{lat:c.latitude,lon:c.longitude})<=collectionRadius()))collect(c)})})}
async function loadCategories(){const {data,error}=await db.from("categories").select("*").order("name");if(error)throw error;categories=data||[];updateCount();return categories}
async function loadCoins(){await loadCategories();let {data,error}=await db.from("coins").select("*").order("code");if(error)throw error;coins=data||[];draw();updateCount();return coins.length}
async function syncUser(){
 let {data:{session}}=await db.auth.getSession();user=session?.user||null;admin=false;collected=new Set();collectionDates=new Map();avatarUrl="";walkingDistanceM=0;lastProgressSave=0;
 if(user){const progress=await db.from("player_progress").select("walking_distance_m").eq("user_id",user.id).maybeSingle();if(progress.error)console.warn("Progressi camminata non disponibili",progress.error);walkingDistanceM=Number(progress.data?.walking_distance_m)||0;}
 if(user){
  const [a,c]=await Promise.all([db.from("admins").select("user_id").eq("user_id",user.id).maybeSingle(),db.from("coin_collections").select("coin_id,collected_at").eq("user_id",user.id)]);
  admin=!!a.data;if(c.error)throw c.error;if(c.data){collected=new Set(c.data.map(x=>x.coin_id));collectionDates=new Map(c.data.map(x=>[x.coin_id,x.collected_at]));}
  const meta=user.user_metadata||{},avatarPath=meta.avatar_path||"";avatarUrl=avatarPath?db.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl:(meta.avatar_url||meta.picture||"");
 }
 updatePlayerMarker();account.textContent=user?(admin?"Admin":"Profilo"):"Accedi";refresh.textContent="Profilo";refresh.title="Apri il profilo giocatore";refresh.setAttribute("aria-label",refresh.title);updateCount();draw();
}
async function collect(c){
 if(!user){say("Accedi per raccogliere questa Street Card.");$("authPanel").classList.remove("hidden");$("authMsg").textContent="Accedi o crea un account per salvare le Street Cards.";return}
 if(collected.has(c.id)||pendingCollections.has(c.id))return;
 pendingCollections.add(c.id);say("Raccolta della Street Card in corso…");
 try{
  const {data,error}=await db.from("coin_collections").insert({user_id:user.id,coin_id:c.id}).select("collected_at").single();
  if(error&&error.code!=="23505")throw error;
  collected.add(c.id);if(data&&data.collected_at)collectionDates.set(c.id,data.collected_at);c.marker?.setIcon(icon(c));updateCount();updateGoalsIfVisible();say("Street Card raccolta!");showVictory(c);
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
   else say("Sei vicino a una Street Card! Accedi per raccoglierla.");
   break;
  }
 }
}
function startGPS(){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audioCtx=audioCtx||new AC();audioCtx.resume()}}catch(e){}
 if(!navigator.geolocation){say("GPS non disponibile in questo browser.");return}if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}
 locate.disabled=true;locate.textContent="◎ Ricerca GPS…";say("Attendo la posizione GPS…");
 if(gpsWatchdog)clearTimeout(gpsWatchdog);
 gpsWatchdog=setTimeout(()=>{if(position===null||locate.disabled){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;locate.disabled=false;locate.textContent="◎ Riprova GPS";say("Il telefono non sta fornendo la posizione. Attiva Posizione e autorizza Chrome ad accedere alla posizione precisa, poi riprova.");}},30000);
 try{watch=navigator.geolocation.watchPosition(p=>{
  if(gpsWatchdog){clearTimeout(gpsWatchdog);gpsWatchdog=null;}
  try{
  const nextPosition={lat:p.coords.latitude,lon:p.coords.longitude},stamp=p.timestamp||Date.now(),previousFix=lastGpsFix;
  let speed=Number.isFinite(p.coords.speed)?p.coords.speed:0,derivedHeading=null;
  const newAccuracy=p.coords.accuracy||999;
  if(previousFix){const seconds=(stamp-previousFix.time)/1000,meters=dist(previousFix.position,nextPosition);if(seconds>.2&&!Number.isFinite(p.coords.speed))speed=meters/seconds;const segmentSpeed=seconds>0?meters/seconds:0;if(user&&seconds>=1&&seconds<=15&&meters>=2&&meters<=38&&newAccuracy<=25&&previousFix.accuracy<=25&&segmentSpeed>=.45&&segmentSpeed<=2.5){walkingDistanceM+=meters;updateGoalsIfVisible();if(walkingDistanceM-lastProgressSave>=20)saveWalkingProgress()}}
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
   window.player=L.marker([position.lat,position.lon],{icon:playerIcon(),zIndexOffset:1000}).addTo(map);
   
  }else{
   window.player.setLatLng([position.lat,position.lon]);
   window.player.setIcon(playerIcon());
  }
  if(!window.circle||!map.hasLayer(window.circle)){
   window.circle=L.circle([position.lat,position.lon],{radius:accuracy,color:"#287cff",weight:1,fillOpacity:.07}).addTo(map);
  }else{
   window.circle.setLatLng([position.lat,position.lon]);
   window.circle.setRadius(accuracy);
  }
  if(!hasInitialGpsView){map.setView([position.lat,position.lon],17,{animate:false});hasInitialGpsView=true}recenter.disabled=false;locate.disabled=false;locate.textContent="◎ GPS attivo";
  say(dist(position,TRENT0)<4100?(accuracy>70?"GPS impreciso: raccolta in pausa":(!user?"GPS attivo · accedi per raccogliere":"GPS attivo · Street Cards fisse di Trento")):"Le 10 Street Cards si trovano a Trento e dintorni");collectNearby();updateCount();
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
  let {count,error}=await db.from("coins").select("*",{count:"exact",head:true});if(error)throw error;if(count){$("adminMsg").textContent=`Nel database sono già presenti ${count} Street Cards. Non ne creo altre.`;return}
  let ways=await fetchTrentoWays(),pts=[];ways.forEach(w=>{if(w.geometry?.length>1)pts.push(...interpolate(w.geometry,65))});
  pts=pts.filter(p=>dist(TRENT0,{lat:p.latitude,lon:p.longitude})<SEED_RADIUS*.98);
  for(let i=pts.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[pts[i],pts[j]]=[pts[j],pts[i]]}
  let chosen=[];for(let p of pts){if(chosen.every(q=>dist({lat:p.latitude,lon:p.longitude},{lat:q.latitude,lon:q.longitude})>45))chosen.push(p);if(chosen.length===10)break}
  if(chosen.length<10)throw Error(`Trovate solo ${chosen.length} posizioni. Riprova.`);
  let rows=chosen.map((p,i)=>({code:`TR-${String(i+1).padStart(3,"0")}`,name:`Street Card di Trento ${i+1}`,description:"Una Street Card da scoprire esplorando la città.",latitude:p.latitude,longitude:p.longitude,color:"#ff6eae"}));
  let ins=await db.from("coins").insert(rows);if(ins.error)throw ins.error;
  await loadCoins();$("adminMsg").textContent="Create 10 Street Cards condivise a Trento.";
 }catch(e){$("adminMsg").textContent=e.message||"Errore nella creazione delle Street Cards"}
 finally{$("seedCoins").disabled=false}
}

async function nextCoinCode(){
 const {data,error}=await db.from("coins").select("code");if(error)throw error;
 let max=0;(data||[]).forEach(c=>{const m=String(c.code||"").match(/^TR-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});
 return "TR-"+String(max+1).padStart(3,"0");
}
async function addCoin(){
 const name=$("newCoinName").value.trim(),description=$("newCoinDescription").value.trim(),category=$("newCoinCategory").value,latitude=Number($("newCoinLat").value),longitude=Number($("newCoinLon").value);
 if(!name||!category||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){$("adminMsg").textContent="Inserisci nome, collezione e coordinate valide.";return}
 try{
  const code=await nextCoinCode(),cat=categories.find(x=>x.name===category);if(!cat)throw Error("Seleziona una collezione esistente.");
  const result=await db.from("coins").insert({code,name,description,category,latitude,longitude,color:cat.color});
  if(result.error)throw result.error;
  $("newCoinName").value="";$("newCoinDescription").value="";$("newCoinLat").value="";$("newCoinLon").value="";
  await loadCoins();$("adminMsg").textContent="Street Card "+code+" aggiunta.";showAdmin();
 }catch(e){$("adminMsg").textContent="Errore: "+e.message}
}
async function saveWalkingProgress(){if(!user)return;const value=Math.round(walkingDistanceM);const {error}=await db.from("player_progress").upsert({user_id:user.id,walking_distance_m:value,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error){console.warn("Salvataggio distanza non riuscito",error);return}lastProgressSave=value;updateGoalsIfVisible()}
function updateGoalsIfVisible(){const box=$("profile-goals");if(box&&!box.classList.contains("hidden"))renderGoals()}
function renderGoals(){const box=$("profileGoals");if(!box)return;box.replaceChildren();const goals=[{title:"Raccogli 5 Street Cards",detail:"Trova cinque Street Cards in giro per la città.",value:collected.size,target:5,unit:"Street Cards"},{title:"Percorri 1 km in Street Coins",detail:"Cammina con il GPS attivo e accumula distanza.",value:walkingDistanceM,target:1000,unit:"m"}];goals.forEach(g=>{const current=Math.min(g.value,g.target),percent=Math.min(100,Math.round(current/g.target*100)),card=document.createElement("article");card.className="goal-card";const ring=document.createElement("div");ring.className="goal-ring";ring.style.setProperty("--progress",percent+"%");const inside=document.createElement("span");inside.textContent=percent+"%";ring.appendChild(inside);const info=document.createElement("div"),title=document.createElement("b"),detail=document.createElement("small"),count=document.createElement("strong");title.textContent=g.title;detail.textContent=g.detail;count.textContent=g.unit==="m"?Math.round(current)+" / 1000 m":current+" / "+g.target+" Street Cards";info.append(title,detail,count);card.append(ring,info);box.appendChild(card)})}

function openStreetCardDetail(c){
 if(!c||!collected.has(c.id))return;
 const modal=$("streetCardDetail"),image=$("streetCardDetailImage"),placeholder=$("streetCardDetailPlaceholder");
 $("streetCardDetailTitle").textContent=c.name||c.code;
 $("streetCardDetailCode").textContent=c.code||"";
 $("streetCardDetailCollection").textContent=c.category||"Generale";
 $("streetCardDetailDescription").textContent=c.description||"Nessuna descrizione disponibile.";
 const stamp=collectionDates.get(c.id);
 $("streetCardDetailDate").textContent=stamp?"Raccolta il "+new Date(stamp).toLocaleString("it-IT",{dateStyle:"long",timeStyle:"short"}):"Street Card raccolta";
 $("streetCardDetailFrame").style.setProperty("--coin-color",categoryColor(c.category,c.color));
 if(c.image_path){image.src=categoryImage(c.image_path);image.alt=c.name||c.code;image.classList.remove("hidden");placeholder.classList.add("hidden")}
 else{image.removeAttribute("src");image.classList.add("hidden");placeholder.classList.remove("hidden")}
 modal.classList.remove("hidden");
}

async function albumCardMarkup(c,owned){
 const color=categoryColor(c.category,c.color),mark=collectionIconMarkup(c.category),photo=owned&&c.image_path?'<img src="'+esc(categoryImage(c.image_path))+'" alt="">':'<span class="coin-sticker-placeholder">'+(owned?"✦":"?")+'</span>';
 return '<div class="album-card-display '+(owned?"is-owned":"is-locked")+'" style="--coin-color:'+esc(color)+'"><div class="coin-sticker '+(owned?"collected":"")+'">'+photo+'<i class="coin-sticker-shine"></i><i class="coin-card-frame"></i><i class="coin-card-emblem">'+mark+'</i></div></div>';
}
function showProfile(){
 if(!user){$("authPanel").classList.remove("hidden");return}
 const meta=user.user_metadata||{},name=meta.display_name||meta.full_name||meta.name||meta.nickname||(user.email||"").split("@")[0]||"Giocatore";
 $("profileName").textContent=name;$("profileEmail").textContent=user.email||"";$("profileAvatar").replaceChildren();
 if(avatarUrl){const img=document.createElement("img");img.src=avatarUrl;img.alt="Avatar";$("profileAvatar").appendChild(img)}else{$("profileAvatar").textContent="★"}
 $("profileStats").textContent=collected.size+" / "+coins.length+" Street Cards raccolte";renderGoals();
 const list=$("profileCollection");list.replaceChildren();const groups=new Map();
 coins.forEach(c=>{const category=(c.category||"Generale").trim()||"Generale";if(!groups.has(category))groups.set(category,[]);groups.get(category).push(c)});
 if(!groups.size){const p=document.createElement("p");p.className="profile-empty";p.textContent="L'album è ancora vuoto.";list.appendChild(p)}
 groups.forEach((items,category)=>{
  const cat=categories.find(x=>x.name===category)||{},color=cat.color||items[0]?.color||"#ff6eae",got=items.filter(c=>collected.has(c.id)).length;
  const section=document.createElement("section");section.className="album-category album-collection-page";section.style.setProperty("--category-color",color);
  const banner=document.createElement("div");banner.className="album-collection-banner";if(cat.image_path)banner.style.backgroundImage='linear-gradient(90deg,rgba(20,16,27,.92),rgba(20,16,27,.52)),url("'+esc(categoryImage(cat.image_path))+'")';
  const emblem=document.createElement("div");emblem.className="album-collection-icon";emblem.innerHTML=collectionIconMarkup(category);
  const info=document.createElement("div");info.className="album-collection-info";const title=document.createElement("h4");title.textContent=category;const desc=document.createElement("p");desc.textContent=cat.description||"Una collezione da esplorare e completare.";const count=document.createElement("b");count.textContent=got+" / "+items.length+" STREET CARDS";info.append(title,desc,count);banner.append(emblem,info);section.appendChild(banner);
  const grid=document.createElement("div");grid.className="album-grid album-card-grid";
  items.forEach(c=>{const owned=collected.has(c.id),slot=document.createElement("div");slot.className="album-slot album-card-slot "+(owned?"is-collected is-openable":"is-missing");slot.style.setProperty("--category-color",color);const art=document.createElement("div");art.className="album-card-art";art.innerHTML=albumCardMarkup(c,owned);const label=document.createElement("b");label.textContent=owned?(c.name||c.code):"Da trovare";const code=document.createElement("small");code.textContent=c.code||"";slot.append(art,label,code);if(owned){slot.setAttribute("role","button");slot.tabIndex=0;slot.setAttribute("aria-label","Apri Street Card "+(c.name||c.code));slot.onclick=()=>openStreetCardDetail(c);slot.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openStreetCardDetail(c)}}}grid.appendChild(slot)});
  section.appendChild(grid);list.appendChild(section);
 });
 $("profilePanel").classList.remove("hidden");
}
async function uploadAvatar(){
 const file=$("avatarFile").files[0];if(!file)return;
 if(!user){$("profileInfoMsg").textContent="Accedi per caricare un avatar.";return}
 if(!["image/png","image/jpeg","image/webp"].includes(file.type)){$("profileInfoMsg").textContent="Scegli un'immagine PNG, JPG o WEBP.";return}
 if(file.size>2*1024*1024){$("profileInfoMsg").textContent="L'immagine deve essere inferiore a 2 MB.";return}
 const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path=user.id+"/avatar."+ext;
 $("avatarUploadBtn").disabled=true;$("profileInfoMsg").textContent="Caricamento avatar…";
 try{
  const up=await db.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});if(up.error)throw up.error;
  const saved=await db.auth.updateUser({data:{avatar_path:path}});if(saved.error)throw saved.error;
  user=saved.data.user;avatarUrl=db.storage.from("avatars").getPublicUrl(path).data.publicUrl+"?v="+Date.now();
  $("profileInfoMsg").textContent="Avatar aggiornato.";await showProfile();updatePlayerMarker();
 }catch(e){$("profileInfoMsg").textContent="Errore caricamento: "+(e.message||"riprova")}
 finally{$("avatarUploadBtn").disabled=false}
}
async function uploadCategoryImage(file,slug){
 if(!file)return null;if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("Usa un'immagine PNG, JPG o WEBP.");
 if(file.size>2*1024*1024)throw Error("L'immagine deve essere inferiore a 2 MB.");
 const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path="categories/"+slug+"-"+Date.now()+"."+ext;
 const up=await db.storage.from("coin-images").upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;return path;
}
function categorySelect(value){return '<select data-category>'+categories.map(c=>'<option value="'+esc(c.name)+'" '+(c.name===value?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select>'}
async function saveNewCategory(){
 const name=$("newCategoryName").value.trim(),description=$("newCategoryDescription").value.trim(),color=$("newCategoryColor").value,file=$("newCategoryImage").files[0],icon_symbol=$("newCategoryIcon").value,iconFile=$("newCategoryIconFile").files[0];
 if(!name){$("adminMsg").textContent="Inserisci il nome della collezione.";return}
 try{let image_path=await uploadCategoryImage(file,name.toLowerCase().replace(/[^a-z0-9]+/g,"-"));const icon_image_path=iconFile?await uploadCategoryImage(iconFile,"icon-"+name.toLowerCase().replace(/[^a-z0-9]+/g,"-")):null;const {error}=await db.from("categories").insert({name,description,color,image_path,icon_symbol,icon_image_path});if(error)throw error;
  $("newCategoryName").value="";$("newCategoryDescription").value="";$("newCategoryImage").value="";$("newCategoryIconFile").value="";$("newCategoryIcon").value="✦";await loadCategories();showAdmin();$("adminMsg").textContent="Collezione creata.";
 }catch(e){$("adminMsg").textContent="Errore collezione: "+e.message}
}
async function showCategoryOverview(){
 await loadCategories();const panel=$("categoryPanel"),list=$("categoryOverview");list.replaceChildren();
 categories.forEach(cat=>{const items=coins.filter(c=>(c.category||"Generale")===cat.name),got=items.filter(c=>collected.has(c.id)).length,card=document.createElement("article");card.className="category-overview-card";card.style.setProperty("--category-color",cat.color||"#ff6eae");
  const img=document.createElement("img");img.src=categoryImage(cat.image_path)||"";img.alt=cat.name;if(!cat.image_path)img.className="no-category-image";
  const body=document.createElement("div"),title=document.createElement("h3"),desc=document.createElement("p"),stats=document.createElement("b");title.textContent=cat.name;desc.textContent=cat.description||"Nessuna descrizione.";stats.textContent=got+" / "+items.length+" Street Cards raccolte";body.append(title,desc,stats);card.append(img,body);list.appendChild(card);
 });panel.classList.remove("hidden");
}
async function showAdmin(){
 $("adminPanel").classList.remove("hidden");$("adminMsg").textContent=user.email;setAdminTab("collections");
 let {data,error}=await db.from("coins").select("*").order("code");if(error){$("coinList").textContent=error.message;return}
 await loadCategories();$("newCoinCode").value=await nextCoinCode();
 const catSelect=$("newCoinCategory");catSelect.replaceChildren();categories.forEach(c=>{const o=document.createElement("option");o.value=c.name;o.textContent=c.name;catSelect.appendChild(o)});
 $("coinList").innerHTML="";$("categoryAdminList").replaceChildren();
 categories.forEach(cat=>{
  const d=document.createElement("div");d.className="category-admin-row";
  d.innerHTML='<label>Nome<input data-name maxlength="60" value="'+esc(cat.name)+'"></label><label>Descrizione<textarea data-description maxlength="500">'+esc(cat.description||"")+'</textarea></label><label>Colore<input data-color type="color" value="'+esc(cat.color||"#ff6eae")+'"></label><label>Immagine generale<input data-file type="file" accept="image/png,image/jpeg,image/webp"></label>'+(cat.image_path?'<img class="category-admin-preview" src="'+esc(categoryImage(cat.image_path))+'" alt="Immagine collezione">':'')+'<label>Icona della collezione<select data-icon-symbol>'+["✦","🏛️","🏰","🌿","🐉","🚀","🏁","⭐","⚽","🎨","🐾","💎","🗺️","🌍","🎭","🎵"].map(v=>'<option value="'+v+'"'+((cat.icon_symbol||"✦")===v?" selected":"")+'>'+v+'</option>').join("")+'</select></label><label>Oppure carica icona personalizzata<input data-icon-file type="file" accept="image/png,image/jpeg,image/webp"></label>'+(cat.icon_image_path?'<img class="category-icon-preview" src="'+esc(categoryImage(cat.icon_image_path))+'" alt="Icona attuale">':'')+'<button class="primary" data-save>Salva collezione</button><button class="danger" data-delete>Elimina collezione</button>';
  $("categoryAdminList").appendChild(d);
  d.querySelector("[data-save]").onclick=async()=>{try{
   const newName=d.querySelector("[data-name]").value.trim();if(!newName)throw Error("Il nome è obbligatorio.");
   const selectedIcon=d.querySelector("[data-icon-symbol]").value;const patch={name:newName,description:d.querySelector("[data-description]").value.trim(),color:d.querySelector("[data-color]").value,icon_symbol:selectedIcon,icon_image_path:cat.icon_image_path||null};
   const f=d.querySelector("[data-file]").files[0];if(f)patch.image_path=await uploadCategoryImage(f,newName.toLowerCase().replace(/[^a-z0-9]+/g,"-"));const iconFile=d.querySelector("[data-icon-file]").files[0];if(iconFile)patch.icon_image_path=await uploadCategoryImage(iconFile,"icon-"+newName.toLowerCase().replace(/[^a-z0-9]+/g,"-"));else if(selectedIcon!==(cat.icon_symbol||"✦"))patch.icon_image_path=null;
   if(newName!==cat.name){const moved=await db.from("coins").update({category:newName,color:patch.color}).eq("category",cat.name);if(moved.error)throw moved.error}
   const saved=await db.from("categories").update(patch).eq("id",cat.id);if(saved.error)throw saved.error;
   await loadCoins();showAdmin();$("adminMsg").textContent="Collezione aggiornata.";
  }catch(e){$("adminMsg").textContent=e.message}};
  d.querySelector("[data-delete]").onclick=async()=>{const used=coins.some(c=>(c.category||"Generale")===cat.name);if(used){$("adminMsg").textContent="Prima assegna le Street Cards a un'altra collezione.";return}if(cat.name==="Generale"){ $("adminMsg").textContent="La collezione Generale non può essere eliminata.";return}if(!confirm("Eliminare la collezione "+cat.name+"?"))return;const del=await db.from("categories").delete().eq("id",cat.id);if(del.error){$("adminMsg").textContent=del.error.message;return}await loadCategories();showAdmin()};
 });
 data.forEach(c=>{
  let d=document.createElement("div");d.className="coin-admin-row";
  const preview=c.image_path?categoryImage(c.image_path):"";
  d.innerHTML='<b>'+esc(c.code)+'</b>'+(preview?'<img class="coin-admin-preview" src="'+esc(preview)+'" alt="Immagine attuale">':'<p class="no-image">Nessuna immagine caricata</p>')+'<label>Nome <input type="text" maxlength="80" value="'+esc(c.name||"")+'" data-name></label><label>Collezione '+categorySelect(c.category||"Generale")+'</label><label>Descrizione <textarea maxlength="500" data-description>'+esc(c.description||"")+'</textarea></label><label>Lat <input type="number" step=".000001" value="'+c.latitude+'" data-lat></label><label>Lon <input type="number" step=".000001" value="'+c.longitude+'" data-lon></label><label>Immagine <input type="file" accept="image/png,image/jpeg,image/webp" data-file></label><button class="primary" data-save>Salva</button><button class="danger" data-delete>Rimuovi Street Card</button>';
  $("coinList").appendChild(d);
  d.querySelector("[data-delete]").onclick=async()=>{if(!confirm("Rimuovere questa Street Card dal gioco?"))return;const del=await db.from("coins").delete().eq("id",c.id);if(del.error){$("adminMsg").textContent=del.error.message;return}await loadCoins();showAdmin()};
  d.querySelector("[data-save]").onclick=async()=>{
   const patch={name:d.querySelector("[data-name]").value.trim(),category:d.querySelector("[data-category]").value,description:d.querySelector("[data-description]").value.trim(),latitude:Number(d.querySelector("[data-lat]").value),longitude:Number(d.querySelector("[data-lon]").value)};
   let f=d.querySelector("[data-file]").files[0];
   if(f){try{patch.image_path=await uploadCategoryImage(f,c.code)}catch(e){$("adminMsg").textContent=e.message;return}}
   let u=await db.from("coins").update(patch).eq("id",c.id);if(u.error){$("adminMsg").textContent=u.error.message;return}
   await loadCoins();$("adminMsg").textContent=c.code+" aggiornata";showAdmin()
  }
 })
}
function setAdminTab(tab){document.querySelectorAll("[data-admin-tab]").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===tab));$("admin-collections").classList.toggle("hidden",tab!=="collections");$("admin-coins").classList.toggle("hidden",tab!=="coins")}
document.querySelectorAll("[data-admin-tab]").forEach(btn=>btn.onclick=()=>setAdminTab(btn.dataset.adminTab));
account.onclick=async()=>{if(!user){$("authPanel").classList.remove("hidden");return}if(admin){showAdmin();return}showProfile()}
$("streetCardDetailClose").onclick=()=>$("streetCardDetail").classList.add("hidden");$("streetCardDetail").onclick=e=>{if(e.target===$("streetCardDetail"))$("streetCardDetail").classList.add("hidden")};$("authClose").onclick=()=>$("authPanel").classList.add("hidden");$("profileClose").onclick=()=>$("profilePanel").classList.add("hidden");document.querySelectorAll("[data-profile-tab]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-profile-tab]").forEach(x=>x.classList.toggle("active",x===btn));document.querySelectorAll(".profile-tab-content").forEach(x=>x.classList.toggle("hidden",x.id!=="profile-"+btn.dataset.profileTab))});$("adminClose").onclick=()=>$("adminPanel").classList.add("hidden");$("categoryCounter").onclick=showCategoryOverview;$("categoryClose").onclick=()=>$("categoryPanel").classList.add("hidden");$("addCategory").onclick=saveNewCategory;$("adminBack").onclick=()=>$("adminPanel").classList.add("hidden");$("victoryNext").onclick=()=>$("victoryPanel").classList.add("hidden");
$("login").onclick=async()=>{let r=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});$("authMsg").textContent=r.error?.message||"Accesso effettuato";if(!r.error){$("authPanel").classList.add("hidden");await syncUser();if(admin)showAdmin()}}
$("signup").onclick=async()=>{let r=await db.auth.signUp({email:$("email").value.trim(),password:$("password").value});$("authMsg").textContent=r.error?.message||"Registrazione avviata: controlla la posta per confermare l'email."}
$("avatarUploadBtn").onclick=uploadAvatar;$("avatarFile").onchange=()=>{const f=$("avatarFile").files[0];if(f){const preview=$("avatarPreview");preview.src=URL.createObjectURL(f);preview.classList.remove("hidden");$("profileInfoMsg").textContent="Anteprima pronta: premi Salva avatar."}};$("seedCoins").onclick=seed;$("addCoin").onclick=addCoin;locate.onclick=startGPS;recenter.onclick=()=>{if(position){map.setView([position.lat,position.lon],map.getZoom(),{animate:false})}};refresh.onclick=()=>showProfile();$("adminShortcut").onclick=()=>{if(admin){showAdmin();return}if(!user){$("authPanel").classList.remove("hidden");$("authMsg").textContent="Accedi con un account amministratore per aprire questo pannello.";return}say("Accesso riservato agli amministratori.")};
bonus.onclick=()=>{if(!user){$("authPanel").classList.remove("hidden");return}bonusMode=!bonusMode;bonus.classList.toggle("active",bonusMode);say(bonusMode?"Bonus attivo: tocca una Street Card entro 200 metri.":"Bonus disattivato")};
db.auth.onAuthStateChange(()=>setTimeout(syncUser,0));
(async()=>{startGPS();try{await syncUser();let n=await loadCoins();if(!position)say(n?`${n} Street Cards caricate. In attesa della posizione GPS…`:"Database pronto: accedi come amministratore e crea le 10 monete.");}catch(e){say("Errore database: "+e.message)}})();
