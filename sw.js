const CACHE='opencity-basic-0.1.0';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url), scope=new URL(self.registration.scope);
  if(u.origin!==scope.origin || !u.pathname.startsWith(scope.pathname))return;
  const rel=u.pathname.slice(scope.pathname.length);
  if(!/^(?:$|index.html$|manifest.json$|icon[^/]*$|js\/)/.test(rel))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;})
    .catch(()=>caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||new Response('Offline',{status:503}))));
});
