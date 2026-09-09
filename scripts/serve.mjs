import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = JSON.parse(await readFile(path.join(root, 'release-files.json'), 'utf8')).files;
const allowed = new Set(files.filter(p => /^(?:index.html|privacy.html|sw.js|manifest.json|icon[^/]*|js\/[^/]+\.js)$/.test(p)));
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'};
const mounts = {};
createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const rel = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
    let filename;
    if (Object.hasOwn(mounts, rel)) filename=mounts[rel];
    else {
      if (!allowed.has(rel)) { res.writeHead(404).end('Not found'); return; }
      filename=path.join(root,rel);
      if ((await realpath(filename)) !== filename) { res.writeHead(403).end(); return; }
    }
    const body=await readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-store'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 8082),'127.0.0.1',()=>console.log('Open City server ready'));
