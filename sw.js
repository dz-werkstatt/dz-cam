// Offline-Cache: Start IMMER aus dem Cache (schnell, offline),
// im Hintergrund die frische Fassung fuer den NAECHSTEN Start.
// DER NAME TRAEGT DEN STAND. Ein Browser installiert einen Service-
// Worker nur neu, wenn sich SEIN SKRIPT aendert - mit einem festen
// Namen blieb der Cache vom Tag der ersten Installation stehen, und
// die App startete monatelang aus der alten Kopie (Daniels Befund
// 15.09.2026: 'immer noch der Stand vom 12.09.'). Jetzt aendert jede
// Veroeffentlichung diese Zeile, der Worker installiert neu und holt
// alle Dateien frisch.
const STAND='09.10.2026 14:37 (1942e482)';
const CACHE='dzcam-'+STAND.replace(/[^0-9a-f]/gi,'');
// KEIN './' in der Vorcache-Liste: nicht jeder Server liefert einen
// Verzeichnis-Index, und EIN Fehlschlag laesst addAll die GANZE
// Installation verwerfen (lokal genau so passiert). Navigationen
// fallen unten auf index.html zurueck.
const DATEIEN=['./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png','./fraesen.html','./manifest-fraesen.webmanifest'];
// DER BAUSTEIN DRITTER (OpenCascade, ~4,3 MB) liegt als eigene Datei,
// benannt nach Version und Pruefsumme, in einem EIGENEN Cache mit festem
// Namen: ein neuer Stand leert ihn NICHT (sonst kaemen die 4,3 MB mit jeder
// Veroeffentlichung neu), nur eine andere Baustein-Datei verdraengt die
// alte. Gleicher Name = gleicher Inhalt, deshalb dort Cache zuerst.
const BAUSTEIN_CACHE='dzcam-baustein';
const BAUSTEIN='./occt-0.0.23-2eeaa56184e2.json';
const BAUSTEIN_URL=new URL(BAUSTEIN, self.location).href;
// Nur holen, was noch nicht da ist. Ein Fehlschlag hier bricht die
// Installation NICHT ab - die App ist wichtiger als das exakte Bild;
// die Datei kommt dann beim ersten Bedarf (fetch unten) in den Cache.
function bausteinVorhalten(){
  return caches.open(BAUSTEIN_CACHE).then(async c=>{
    if(await c.match(BAUSTEIN_URL)) return;
    try{ await c.add(BAUSTEIN_URL); }catch(err){}
  }).catch(()=>{});
}
self.addEventListener('install', e=>{
  e.waitUntil(Promise.all([caches.open(CACHE).then(c=>c.addAll(DATEIEN)), bausteinVorhalten()])
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  // Die alten Staende wegraeumen - sonst waechst der Speicher mit
  // jeder Veroeffentlichung, und der alte Cache koennte wieder
  // ausgeliefert werden. Der Baustein-Cache bleibt; in ihm nur die
  // Dateien ANDERER Versionen weg.
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE && k!==BAUSTEIN_CACHE).map(k=>caches.delete(k))))
    .then(()=>caches.open(BAUSTEIN_CACHE))
    .then(c=>c.keys().then(rs=>Promise.all(rs.filter(r=>r.url!==BAUSTEIN_URL).map(r=>c.delete(r)))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  // stand.txt geht AM CACHE VORBEI - sie ist die Datei, an der die App
  // erkennt, ob sie selbst alt ist.
  if(/stand\.txt/.test(e.request.url)) return;
  if(e.request.method!=='GET') return;
  // Baustein-Dateien: Cache zuerst (Name = Inhalt), sonst Netz und ablegen -
  // nur eine gute Antwort, und erst NACH dem Ablegen geht sie hinaus.
  if(/\/occt-[^\/]*\.json$/.test(new URL(e.request.url).pathname)){
    e.respondWith(caches.open(BAUSTEIN_CACHE).then(async c=>{
      const da=await c.match(e.request, {ignoreSearch:true});
      if(da) return da;
      const r=await fetch(e.request).catch(()=>null);
      if(r && r.ok && r.url===BAUSTEIN_URL){ try{ await c.put(BAUSTEIN_URL, r.clone()); }catch(err){} }
      return r || new Response('offline', {status:503});
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c=>{
    // DER NACHSCHUB MUSS ZU ENDE LAUFEN. Ohne waitUntil beendet der
    // Browser den Worker, sobald die Antwort draussen ist - der Abruf
    // und das Ablegen im Cache werden abgebrochen, und der Cache
    // aktualisiert sich NIE. Genau daran hing der 12.09.-Stand.
    const frisch=fetch(e.request).then(r=>{
      if(r && r.ok) return c.put(e.request, r.clone()).then(()=>r).catch(()=>r);
      return r;
    }).catch(()=>null);
    try{ e.waitUntil(frisch); }catch(err){}
    // SEITENAUFRUFE: erst das Netz, mit 3 Sekunden Geduld. An der
    // Maschine gibt es kein Netz - dort schlaegt der Abruf sofort fehl
    // und es geht wie bisher aus dem Cache weiter.
    if(e.request.mode==='navigate'){
      const geduld=new Promise(r=>setTimeout(()=>r(null), 3000));
      const netz=await Promise.race([frisch, geduld]);
      if(netz && netz.ok) return netz;   // eine Fehlerseite verdraengt die Kopie nicht
      return (await c.match(e.request, {ignoreSearch:true}))
          || (await c.match('./index.html'))
          || new Response('offline', {status:503});
    }
    const alt=await c.match(e.request, {ignoreSearch:true});
    return alt || (await frisch) || new Response('offline', {status:503});
  }));
});
