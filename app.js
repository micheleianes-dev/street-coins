/* STREET COINS V13 */
const APP_VERSION="V13";
const SUPABASE_URL="https://ibqponyeathgxiweujvd.supabase.co";
const SUPABASE_KEY="sb_publishable_JhMo2NOsorp_HLE2Vd2BSg_VJJt6e-0";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const TRENT0={lat:46.0679,lon:11.1211},SEED_RADIUS=3600;
const ENDPOINTS=["https://overpass.private.coffee/api/interpreter","https://ovp.dresel.systems/api/interpreter","https://overpass-api.de/api/interpreter"];
const map=L.map("map",{zoomControl:false,preferCanvas:true}).setView([0,0],2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,subdomains:"abc",attribution:'&copy; OpenStreetMap'}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const layer=L.layerGroup().addTo(map),$=id=>document.getElementById(id);
map.on("click",e=>{const lat=e.latlng.lat,lon=e.latlng.lng;L.popup().setLatLng(e.latlng).setContent(`<div class="coord-popup"><b>Punto selezionato</b><br>Latitudine: ${lat.toFixed(6)}<br>Longitudine: ${lon.toFixed(6)}</div>`).openOn(map)});
let user=null,admin=false,position=null,accuracy=999,watch=null,coins=[],collected=new Set(),bonusMode=false,audioCtx=null;
$("appVersion").textContent=APP_VERSION;
const status=$("status"),locate=$("locateBtn"),account=$("accountBtn"),bonus=$("bonusBtn"),refresh=$("refreshBtn");
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
 for(let i=0;i<28;i++){const p=document.createElement("i");p.style.setProperty("--a",(Math.PI*2*i/28)+"rad");p.style.setProperty("--d",(55+Math.random()*95)+"px");p.style.setProperty("--h",Math.floor(Math.random()*360));fx.appendChild(p)}
}

function dist(a,b){const r=Math.PI/180,R=6371000,d1=(b.lat-a.lat)*r,d2=(b.lon-a.lon)*r,x=Math.sin(d1/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function updateCount(){$("coinCount").textContent=collected.size;$("bonusCount").textContent=1+Math.floor(collected.size/10);bonus.disabled=!user||!position}
function icon(c){let inner=c.image_path?`<img src="${db.storage.from("coin-images").getPublicUrl(c.image_path).data.publicUrl}">`:"<span>★</span>";return L.divIcon({className:"",html:`<div class="coin-marker ${collected.has(c.id)?"collected":""}" style="background:${esc(c.color||"#ff6eae")}">${inner}</div>`,iconSize:[42,42],iconAnchor:[21,21]})}
function draw(){layer.clearLayers();coins.forEach(c=>{c.marker=L.marker([c.latitude,c.longitude],{icon:icon(c)}).addTo(layer);c.marker.bindPopup(`<div class="coin-popup"><b>${esc(c.name||c.code)}</b><p>${esc(c.description||"Nessuna descrizione disponibile.")}</p>${collected.has(c.id)?'<small>Già raccolta da te</small>':""}</div>`);c.marker.on("click",()=>{if(bonusMode)collect(c)})})}
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
 if(!user){$("authPanel").classList.remove("hidden");$("authMsg").textContent="Accedi o crea un account per raccogliere.";return}
 if(collected.has(c.id))return;
 let {error}=await db.from("coin_collections").insert({user_id:user.id,coin_id:c.id});
 if(error&&error.code!=="23505"){say("Raccolta non salvata: "+error.message);return}
 collected.add(c.id);c.marker?.setIcon(icon(c));updateCount();say("Moneta raccolta!");showVictory(c); 
}
function collectNearby(){if(!position||!user||accuracy>35)return;for(const c of coins)if(!collected.has(c.id)&&dist(position,{lat:c.latitude,lon:c.longitude})<=Math.max(12,Math.min(18,accuracy*.45)))collect(c)}
function startGPS(){
 if(!navigator.geolocation){say("GPS non disponibile.");return}if(watch!==null)return;
 locate.disabled=true;locate.textContent="◎ Ricerca GPS…";say("Attendo la posizione GPS…");
 watch=navigator.geolocation.watchPosition(p=>{
  position={lat:p.coords.latitude,lon:p.coords.longitude};accuracy=p.coords.accuracy||999;
  if(!window.player){window.player=L.marker([position.lat,position.lon],{icon:L.divIcon({className:"",html:'<div class="player-dot"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);window.circle=L.circle([position.lat,position.lon],{radius:accuracy,color:"#287cff",weight:1,fillOpacity:.07}).addTo(map)}
  else{window.player.setLatLng([position.lat,position.lon]);window.circle.setLatLng([position.lat,position.lon]).setRadius(accuracy)}
  map.setView([position.lat,position.lon],16);locate.disabled=false;locate.textContent="◎ GPS attivo";
  say(dist(position,TRENT0)<4100?(accuracy>35?"GPS impreciso: raccolta in pausa":"GPS attivo · monete fisse di Trento"):"Le 100 monete si trovano a Trento e dintorni");collectNearby();updateCount();
 },e=>{say(e.code===1?"Permesso GPS negato.":e.code===2?"Posizione GPS non disponibile.":"GPS lento: riprova all'aperto.");locate.disabled=false;locate.textContent="◎ Riprova GPS";if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null},{enableHighAccuracy:true,maximumAge:10000,timeout:20000})
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
$("seedCoins").onclick=seed;locate.onclick=startGPS;refresh.onclick=()=>loadCoins().then(n=>say(`${n} monete caricate`)).catch(e=>say(e.message));
bonus.onclick=()=>{if(!user){$("authPanel").classList.remove("hidden");return}bonusMode=!bonusMode;bonus.classList.toggle("active",bonusMode);say(bonusMode?"Bonus attivo: tocca una moneta entro 200 metri.":"Bonus disattivato")};
db.auth.onAuthStateChange(()=>setTimeout(syncUser,0));
(async()=>{try{await syncUser();let n=await loadCoins();say(n?`${n} monete fisse caricate. Accedi e attiva il GPS.`:"Database pronto: accedi come amministratore e crea le 100 monete.");}catch(e){say("Errore database: "+e.message)}})();
