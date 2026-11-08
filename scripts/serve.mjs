import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),value=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const port=Number(value('--port','4180')),base=value('--base','/');
if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..'))throw Error('--base must be an absolute URL directory ending in /');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.md':'text/plain'};
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(base))throw Error('Outside site');
  const file=path.resolve(root,pathname.slice(base.length)||'index.html');
  if(!file.startsWith(root+path.sep))throw Error('Outside site');
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Editor: http://127.0.0.1:${port}${base}`));
