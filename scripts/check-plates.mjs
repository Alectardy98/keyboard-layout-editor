// Optional local-corpus regression check. Never writes to the supplied folder.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../plate/dxf.js'),R=require('../plate/recognize.js'),M=require('../plate/document.js'),S=require('../serial.js');
const args=process.argv.slice(2),folder=args[0],units=args[1]==='--units'?args[2]:undefined;
if(!folder || (units && !['mm','in','cm'].includes(units))) {
 console.error('Usage: node scripts/check-plates.mjs <folder> [--units mm|in|cm]');process.exit(2);
}
const report={files:0,byteExactNoOps:0,convertedFiles:0,convertedCentres:0,fixedRecordsPreserved:0,withoutEditableOpenings:0,unitConfirmationNeeded:0,failures:[]};
for(const name of fs.readdirSync(folder).filter(n=>/\.dxf$/i.test(n)&&!n.startsWith('._')).sort()) {
 try {
  const bytes=fs.readFileSync(path.join(folder,name)),d=D.parse(bytes,name,{units}),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);
  report.files++;
  if(!Buffer.from(m.exportFile(keys)).equals(bytes))throw Error('Unedited file does not round-trip byte-for-byte.');
  report.byteExactNoOps++;
  const editable=keys.filter(k=>m.original[k._plateId].editable);
  if(!editable.length){report.withoutEditableOpenings++;continue;}
  if(!d.units.confirmed){report.unitConfirmationNeeded++;continue;}
  const owned=new Set(r.keys.flatMap(k=>k.contours.concat(k.stabilizers).flatMap(c=>c.parts.map(p=>p.raw?.id))));
  const fixed=d.raw.entities.filter(record=>!owned.has(record.id)).map(record=>d.source.slice(record.start,record.end));
  // This synthetic conversion explicitly accepts candidates; the UI requires review.
  m.confirm(editable);
  m.apply(editable,{switch:'mx',stabilizer:'original'});
  const exported=D.parse(m.exportFile(keys),'check.dxf'),converted=R.analyze(exported);
  for(const record of fixed)if(!exported.source.includes(record))throw Error('A fixed source entity changed.');
  report.fixedRecordsPreserved+=fixed.length;
  for(const key of editable) {
   const center=m.physical(key).center;
   if(!converted.keys.some(k=>Math.hypot(k.center.x-center.x,k.center.y-center.y)<0.03))throw Error('A converted switch centre moved or could not be recognized.');
   report.convertedCentres++;
  }
  report.convertedFiles++;
 }catch(error){report.failures.push({name,error:error.message});}
}
console.log(JSON.stringify(report,null,2));
if(report.failures.length)process.exitCode=1;
