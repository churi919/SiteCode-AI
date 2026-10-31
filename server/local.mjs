import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {handleApi} from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot = path.join(root,'dist');
const env = {...process.env};
try {
  const source = await fs.readFile(path.join(root,'.env'),'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !env[match[1]]) env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
} catch (error) { if(error.code !== 'ENOENT') throw error; }
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.wasm':'application/wasm','.glb':'model/gltf-binary','.3dm':'application/octet-stream','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};

const server = http.createServer(async(req,res)=>{
  try {
    const host = `127.0.0.1:${server.address().port}`;
    if (req.headers.host && ![host,`localhost:${server.address().port}`].includes(req.headers.host)) { res.writeHead(403);res.end('Invalid host');return; }
    const url = new URL(req.url,`http://${req.headers.host||host}`);
    const chunks=[];let length=0;
    for await(const chunk of req) {
      length+=chunk.length;
      if(length>70000) {res.writeHead(413);res.end('Request too large');return;}
      chunks.push(chunk);
    }
    const request = new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
    const response=await handleApi(request,env);
    if(response) {
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end('Method not allowed');return;}
    let relative;
    try {relative=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end('Bad path');return;}
    const file=path.resolve(publicRoot,`.${relative === '/'?'/index.html':relative}`);
    if(!file.startsWith(publicRoot+path.sep)) {res.writeHead(403);res.end('Forbidden');return;}
    let data;
    try {data=await fs.readFile(file);}catch {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch {
    if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Request could not be completed.');
  }
});
const port=Number(env.PORT)||4173;
server.listen(port,'127.0.0.1',()=>console.log(`SiteCode AI ready: http://127.0.0.1:${port}`));
