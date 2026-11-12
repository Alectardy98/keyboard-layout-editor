// Read-only library audit. Workers isolate malformed/slow third-party drawings.
// Usage: node scripts/audit-plates.mjs <library-folder> <report-folder>
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
const require=createRequire(import.meta.url);
const D=require('../plate/dxf'),R=require('../plate/recognize'),G=require('../plate/geometry'),M=require('../plate/document'),S=require('../serial');
function xml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function audit(file){
 const start=Date.now(),bytes=fs.readFileSync(file),d=D.parse(bytes,path.basename(file)),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);
 if(!Buffer.from(m.exportFile(keys)).equals(bytes))throw Error('No-op export differs from original.');
 const candidates=r.unassigned.map(c=>({id:c.id,...G.bounds(c.points),editable:c.editable,points:c.points.length}))
  .filter(b=>Math.min(b.width,b.height)>=10&&Math.min(b.width,b.height)<=32&&Math.max(b.width,b.height)<=250);
 const gaps=[];
 for(const k of r.keys.filter(k=>Math.abs(k.capAngle)<.001&&k.height===1)){
  const n=r.keys.filter(n=>n!==k&&Math.abs(n.center.y-k.center.y)<.1&&n.center.x>k.center.x).sort((a,b)=>a.center.x-b.center.x)[0];if(!n)continue;
  const units=(n.center.x-k.center.x)/19.05-(n.width+k.width)/2;
  if(units>=.24&&units<=8)gaps.push({left:k.id,right:n.id,units:+units.toFixed(3),x:(k.center.x+n.center.x)/2,y:k.center.y});
 }
 const b=d.bounds,view=[b.minX-5,-b.maxY-5,b.width+10,b.height+10].join(' ');
 const owned=new Set(r.keys.flatMap(k=>k.contours.concat(k.stabilizers).map(c=>c.id)));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+view+'">'+d.contours.map(c=>'<path d="'+c.points.map((p,i)=>(i?'L':'M')+p.x.toFixed(3)+' '+(-p.y).toFixed(3)).join(' ')+' Z" fill="none" stroke="'+(owned.has(c.id)?'#6f53ab':'#d67a16')+'" stroke-width=".3"/>').join('')+
 r.keys.map(k=>'<g transform="translate('+k.center.x+' '+(-k.center.y)+') rotate('+(-k.capAngle*180/Math.PI)+')"><rect x="'+(-k.width*19.05/2+.6)+'" y="'+(-k.height*19.05/2+.6)+'" width="'+(k.width*19.05-1.2)+'" height="'+(k.height*19.05-1.2)+'" fill="#7358a01a" stroke="#7358a0" stroke-width=".15"/><text x="0" y="0" text-anchor="middle" font-family="sans-serif" font-size="3">'+xml(k.id.slice(4)+' / '+k.width)+'</text></g>').join('')+'</svg>';
 return {file,ms:Date.now()-start,keys:r.keys.map(k=>({id:k.id,type:k.type,x:k.center.x,y:k.center.y,w:k.width,h:k.height,label:k.label,editable:k.editable,stabs:k.stabilizers.length})),counts:r.counts,candidates,gaps,units:d.units,unsupported:d.unsupported,byteExact:true,svg};
}
if(!isMainThread){try{parentPort.postMessage(audit(workerData));}catch(e){parentPort.postMessage({file:workerData,error:e.message});}}
else {
 const [folder,out]=process.argv.slice(2);if(!folder||!out)throw Error('Usage: audit-plates.mjs <library-folder> <report-folder>');fs.mkdirSync(out,{recursive:true});
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.dxf$/i.test(e.name))files.push(p);}}walk(folder);files.sort();
 let next=0,complete=0;const results=[];
 function run(file,index){return new Promise(resolve=>{const worker=new Worker(new URL(import.meta.url),{workerData:file,resourceLimits:{maxOldGenerationSizeMb:384}});let done=false;const timer=setTimeout(()=>finish({file,error:'Audit exceeded 60 seconds'}),60000);
  function finish(r){if(done)return;done=true;clearTimeout(timer);worker.terminate();if(r.svg){fs.writeFileSync(path.join(out,index+'.svg'),r.svg);delete r.svg;r.preview=index+'.svg';}r.relative=path.relative(folder,file);results.push(r);if(++complete%25===0)console.log(complete+'/'+files.length);resolve();}
  worker.once('message',finish);worker.once('error',e=>finish({file,error:e.message}));worker.once('exit',code=>{if(!done)finish({file,error:'Worker exited '+code});});
 });}
 await Promise.all(Array.from({length:4},async()=>{while(next<files.length){const i=next++;await run(files[i],i);}}));
 results.sort((a,b)=>a.relative.localeCompare(b.relative));fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(results,null,2));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>MX plate audit</title><style>body{font:15px sans-serif;background:#eee}article{background:white;margin:20px;padding:16px}img{width:100%;max-height:550px}summary{cursor:pointer}code{white-space:pre-wrap}</style><h1>MX plate audit</h1><p>Orange: unassigned geometry. Purple: detected keys. Gaps are review candidates, not proof of missing keys.</p>'+results.map(r=>'<article><details><summary>'+xml(r.relative)+' — '+(r.error?xml(r.error):r.keys.length+' keys; '+r.candidates.length+' candidate openings; '+r.gaps.length+' gaps')+'</summary>'+(r.preview?'<img loading="lazy" src="'+r.preview+'">':'')+'<code>'+xml(JSON.stringify(r.gaps||r.error,null,2))+'</code></details></article>').join(''));
 console.log(JSON.stringify({files:results.length,parsed:results.filter(r=>!r.error).length,errors:results.filter(r=>r.error).map(r=>({file:r.relative,error:r.error})),withCandidates:results.filter(r=>r.candidates?.length).length}));
}
