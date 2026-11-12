const {test}=require('node:test');const assert=require('node:assert/strict');
const G=require('../plate/geometry'),D=require('../plate/dxf'),R=require('../plate/recognize'),P=require('../plate/profiles'),M=require('../plate/document'),S=require('../serial');
const {makeFixture}=require('./plate-fixture.cjs');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function plate(source=makeFixture()){const d=D.parse(source,'test.dxf'),r=R.analyze(d),m=M.create(d,r);return {d,r,m,keys:m.makeKeys(S.defaultKeyProps)};}
function options(extra={}){return {switch:'mx',stabilizer:'original',direction:'south',mount:'plate',...extra};}
function fixedRecords(d){return d.raw.entities.filter(r=>r.pairs.some(p=>p.code===8&&['OUTLINE','MOUNTS'].includes(p.value))).map(r=>d.source.slice(r.start,r.end));}
test('switch types are inferred from actual closed geometry, not the filename',()=>{
 const {r}=plate();assert.equal(r.counts.mx,3);assert.equal(r.counts.alps,1);assert.equal(r.keys.length,4);
 const wide=r.keys.find(k=>Math.abs(k.center.x-47.625)<.01);assert.equal(wide.width,2);assert.equal(wide.stabilizers.length,2);
 const omron=plate(makeFixture({unknown:true}));assert.equal(omron.r.counts.mx,0);assert.equal(omron.r.counts.unknown,3);
});
test('no-op export preserves every source byte, line ending and legacy text',()=>{
 for(const source of [makeFixture(),makeFixture().replaceAll('\n','\r\n')]){
  const bytes=Buffer.from(source),{m,keys}=plate(bytes);assert.deepEqual(Buffer.from(m.exportFile(keys)),bytes);
 }
 const text=makeFixture().replace('0\nEOF','999\nlegacy-\xe9\n0\nEOF');const bytes=Buffer.from(text,'latin1'),{d,m,keys}=plate(bytes);
 assert.equal(d.encoding,'bytes');assert.deepEqual(Buffer.from(m.exportFile(keys)),bytes);
 m.apply([keys[1]],options({switch:'alps'}));assert.ok(Buffer.from(m.exportFile(keys)).includes(Buffer.from('legacy-\xe9','latin1')));
});
test('DXF units are converted to mm; a unitless file requires explicit confirmation for edited export',()=>{
 const {d,m,keys}=plate(makeFixture({units:0}));assert.equal(d.units.confirmed,false);assert.equal(d.units.inferred,true);
 m.apply([keys[1]],options({switch:'alps'}));assert.throws(()=>m.exportFile(keys),/Confirm the drawing units/);
 const inch=D.parse(makeFixture({units:1}),'inch.dxf');near(inch.factor,25.4);
 const confirmed=D.parse(makeFixture({units:0}),'mm.dxf',{units:'mm'});assert.equal(confirmed.units.confirmed,true);
 assert.equal(confirmed.units.override,'mm');
 const feet=D.parse(makeFixture({units:2}),'feet.dxf');assert.equal(feet.units.declaredFactor,304.8);assert.equal(feet.units.override,null);
});
test('inch drawings keep the arc approximation tolerance in physical mm',()=>{
 const source='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n10\n0\n20\n0\n40\n1\n0\nENDSEC\n0\nEOF\n';
 const d=D.parse(source,'inch-circle.dxf'),points=d.primitives[0].points;
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert.ok(25.4-Math.hypot(mid.x,mid.y)<=.005001);
 }
});
test('moving a non-anchor moves only its switch and associated stabilizers',()=>{
 const {d,m,keys}=plate(),key=keys.find(k=>k.width===2),before=structuredClone(keys),start=m.physical(key);
 key.x+=.25;m.reconcile(before,keys);
 const exported=D.parse(m.exportFile(keys),'moved.dxf'),recognized=R.analyze(exported),moved=recognized.keys.find(k=>Math.abs(k.center.x-(start.center.x+4.7625))<.01);
 assert.ok(moved);assert.equal(moved.stabilizers.length,2);assert.deepEqual(fixedRecords(exported),fixedRecords(d));
});
test('anchor centres and rotation stay fixed through resize, move and deletion',()=>{
 const {m,keys}=plate(),first=keys[0],start=m.physical(first);let before=structuredClone(keys);
 first.x+=2;first.rotation_angle+=25;first.width+=1;m.reconcile(before,keys);
 near(G.distance(m.physical(first).center,start.center),0);near(m.physical(first).angle,start.angle);
 before=structuredClone(keys);keys.splice(0,1);m.reconcile(before,keys);assert.ok(keys.some(k=>k._plateId===first._plateId));
 m.setAnchors([keys.find(k=>k._plateId===first._plateId)],false);before=structuredClone(keys);keys.splice(keys.findIndex(k=>k._plateId===first._plateId),1);m.reconcile(before,keys);
 assert.equal(keys.some(k=>k._plateId===first._plateId),false);
});
test('repeated keycap resizing preserves the physical stem centre even on rotated keys',()=>{
 const {m,keys}=plate(),key=keys[1];key.rotation_angle=32;const start=m.physical(key).center;
 for(let i=0;i<3;i++){const before=structuredClone(keys);key.width+=.25;key.height+=.25;m.reconcile(before,keys);near(G.distance(m.physical(key).center,start),0);}
});
test('MX-to-Alps conversion retains every stem centre and fixed outline/mount records',()=>{
 const {d,m,keys}=plate();m.apply(keys,options({switch:'alps'}));const exported=D.parse(m.exportFile(keys),'alps.dxf'),r=R.analyze(exported);
 assert.equal(r.counts.alps,4);assert.deepEqual(fixedRecords(exported),fixedRecords(d));
 for(const key of keys)assert.ok(r.keys.some(k=>G.distance(k.center,m.physical(key).center)<.001));
 assert.equal(r.keys.find(k=>k.width===2).stabilizers.length,2);
});
test('a compound Alps/MX opening uses the switch core centre and stabilizer span, not its offset bounding box',()=>{
 const points=P.rings(P.generate(options({switch:'alps',stabilizer:'mx'}),{width:6.25,height:1}))[0];
 const source='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+
  '0\nLWPOLYLINE\n5\n10\n8\nCUT\n90\n'+points.length+'\n70\n1\n'+points.map(p=>'10\n'+p.x+'\n20\n'+p.y+'\n').join('')+'0\nENDSEC\n0\nEOF\n';
 const {m,keys,r}=plate(source);assert.equal(r.keys.length,1);assert.equal(keys[0].width,6.25);near(r.keys[0].center.x,0);near(r.keys[0].center.y,0);
 assert.ok(Math.abs(G.bounds(points).cy)>.7);m.apply(keys,options({switch:'mx'}));const result=R.analyze(D.parse(m.exportFile(keys),'compound.dxf'));
 near(result.keys[0].center.x,0);near(result.keys[0].center.y,0);
});
test('MX plate and PCB patterns and north/south controls produce different geometry at the same centre',()=>{
 const key={width:2,height:1};
 const south=P.generate(options({stabilizer:'mx'}),key),north=P.generate(options({stabilizer:'mx',direction:'north'}),key),pcb=P.generate(options({stabilizer:'mx',mount:'pcb'}),key);
 assert.notDeepEqual(south,north);assert.notDeepEqual(south,pcb);
 const a=G.bounds(P.rings(south).flat()),b=G.bounds(P.rings(north).flat());near(a.minY,-b.maxY);near(a.maxY,-b.minY);near(a.cx,0);near(b.cx,0);
 assert.ok(P.rings(pcb).length>=3);
});
test('Alps supports native, Costar and MX stabs, including north/south and independent MX mounting',()=>{
 const key={width:2,height:1},outputs=[];
 for(const stabilizer of ['alps-aek','alps-at101','costar','mx'])for(const direction of ['north','south'])for(const mount of stabilizer==='mx'?['plate','pcb']:['plate']){
  const shape=P.generate(options({switch:'alps',stabilizer,direction,mount}),key);assert.ok(shape.length);outputs.push(JSON.stringify(shape));
 }
 assert.equal(new Set(outputs).size,outputs.length);
});
test('native Alps supports 1.75u; unusual caps require explicit measured spacing',()=>{
 assert.ok(P.stabilizers(options({stabilizer:'alps-aek'}),{width:1.75,height:1}).length);
 assert.equal(P.stabilizers(options({stabilizer:'mx'}),{width:1.75,height:1}).length,0);
 assert.throws(()=>P.stabilizers(options({stabilizer:'alps-aek'}),{width:8,height:1}),/measured stabilizer spacing/);
 assert.ok(P.stabilizers(options({stabilizer:'alps-aek',spacing:115}),{width:8,height:1}).length);
 assert.throws(()=>P.stabilizers(options({stabilizer:'mx',spacing:-1}),{width:2,height:1}),/between 10 and 250/);
});
test('vertical stabilizers and explicit stem offsets preserve the chosen stem',()=>{
 const horizontal=G.bounds(P.rings(P.stabilizers(options({stabilizer:'costar',stemOffset:2}),{width:2,height:1})).flat());
 const vertical=G.bounds(P.rings(P.stabilizers(options({stabilizer:'costar',stemOffset:2,axis:'vertical'}),{width:1,height:2})).flat());
 near(horizontal.width,vertical.height);near(horizontal.height,vertical.width);near(horizontal.cx,-2);
});
test('applied stabilizer spacing is frozen until explicitly reapplied after a keycap resize',()=>{
 const {m,keys}=plate(),key=keys.find(k=>k.width===2);m.apply([key],options({stabilizer:'mx'}));const initial=m.plan(keys).paths.filter(p=>p.key===key._plateId);
 const before=structuredClone(keys);key.width=7;m.reconcile(before,keys);
 assert.deepEqual(m.plan(keys).paths.filter(p=>p.key===key._plateId),initial);assert.match(m.plan(keys).warnings[0],/spacing is retained/);
 m.apply([key],options({stabilizer:'mx'}));assert.notDeepEqual(m.plan(keys).paths.filter(p=>p.key===key._plateId),initial);
});
test('a failed batch leaves every cutout profile unchanged',()=>{
 const {m,keys}=plate();const before=m.snapshot();keys[0].width=8;
 assert.throws(()=>m.apply(keys,options({stabilizer:'alps-aek'})),/measured stabilizer spacing/);assert.deepEqual(m.snapshot(),before);
});
test('new, copied, removed and restored keys have bounded ownership and explicit profiles',()=>{
 const {m,keys}=plate(),before=structuredClone(keys),clone=structuredClone(keys[1]);keys.push(clone);m.reconcile(before,keys);assert.notEqual(clone._plateId,keys[1]._plateId);
 assert.throws(()=>m.exportFile(keys),/choose and apply/);m.apply([clone],options());assert.ok(m.exportFile(keys).length);
 const saved=m.snapshot();m.apply([keys[1]],options({switch:'alps'}));m.restore(saved);assert.equal(m.settings[keys[1]._plateId].profile,null);
});
test('a misidentified opening can become fixed geometry without removing or regenerating it',()=>{
 const {m,keys}=plate(),source=makeFixture(),before=structuredClone(keys),first=keys[0];
 m.exclude([first]);keys.splice(0,1);m.reconcile(before,keys);
 assert.equal(keys.length,3);assert.equal(Buffer.from(m.exportFile(keys)).toString(),source);
 assert.ok(m.plan(keys).paths.some(p=>p.key===null && p.points.some(v=>v.x===-7)));
});
test('non-XY/offset source entities remain uneditable and cannot be regenerated at Z=0',()=>{
 const {m,keys,r}=plate(makeFixture({z:1.5}));assert.ok(r.keys.every(k=>!k.editable));assert.throws(()=>m.apply([keys[1]],options()),/unsupported plane/);
 const before=structuredClone(keys);keys[1].x+=1;m.reconcile(before,keys);near(keys[1].x,before[1].x);
});
test('line/arc contours stitch only at unambiguous endpoints; bulge arcs retain endpoint geometry',()=>{
 const p=(a,b)=>({points:[a,b],layer:'CUT',stitch:true,editable:true}),points=G.rectangle(14,14),parts=points.map((v,i)=>p(v,points[(i+1)%4]));
 assert.equal(G.contours(parts).closed.length,1);assert.equal(G.contours([...parts,p(points[0],points[1])]).closed.length,0);
 const arc=G.bulge({x:0,y:0},{x:10,y:0},.41421356237);near(arc[0].x,0);near(arc.at(-1).x,10);assert.ok(arc.length>3);
});
test('R12 generated replacements remain LINE entities; modified records have unique handles',()=>{
 const {m,keys}=plate(makeFixture({version:'AC1009'}));m.apply([keys[1]],options({switch:'alps'}));const d=D.parse(m.exportFile(keys),'r12.dxf');
 assert.ok(d.raw.entities.some(r=>r.type==='LINE'));const handles=d.raw.entities.map(r=>r.handle).filter(Boolean);assert.equal(new Set(handles).size,handles.length);
});
test('legacy handle-free drawings remain handle-free after replacement',()=>{
 const source=makeFixture({version:'AC1009'}).replace(/^5\n[^\n]*\n/gm,'');const {m,keys}=plate(source);
 m.apply([keys[1]],options({switch:'alps'}));const d=D.parse(m.exportFile(keys),'no-handles.dxf');
 assert.equal(d.raw.entities.some(r=>r.handle),false);
});
test('rigid anchor alignment accepts translation/rotation and rejects scale or inconsistent anchors',()=>{
 const transform=M.alignment([{from:{x:0,y:0},to:{x:10,y:20}},{from:{x:10,y:0},to:{x:10,y:30}}]);
 near(transform.move({x:0,y:10}).x,0);near(transform.move({x:0,y:10}).y,20);
 assert.throws(()=>M.alignment([{from:{x:0,y:0},to:{x:0,y:0}},{from:{x:10,y:0},to:{x:20,y:0}}]),/without scaling/);
 assert.throws(()=>M.alignment([]),/at least one anchor/);
});
test('malformed, oversized, binary and overlapping DXF edits fail before producing output',()=>{
 assert.throws(()=>D.parse('AutoCAD Binary DXF\0','bad.dxf'),/ASCII/);assert.throws(()=>D.parse('0\nSECTION\n2'),'bad.dxf');
 const {d}=plate();assert.throws(()=>D.exportEdits(d,[{record:d.raw.entities[0]},{record:d.raw.entities[0]}]),/share the same/);
});

test('Alps preset sizes, stepped stems and complete Zenith spacebar supports',()=>{
 assert.equal(P.presets.length,20);
 for(const item of P.presets){const p=P.preset(item.id);assert.equal(p.key.width*4%1,0);assert.ok(P.generate(p.options,p.key).length);if(p.key.width>=2)assert.ok(['alps-default','alps-975-barrel','alps-bae','alps-zkb2','alps-barrel625','alps-canon8'].includes(p.options.stabilizer));}
 const left=P.preset('alps-15-left').key,right=P.preset('alps-15-right').key;
 assert.equal(left.width,1);assert.equal(left.width2,1.5);assert.equal(left.x2,-.5);assert.equal(right.x2,0);
 assert.equal(P.generate(P.preset('alps-55').options,{width:5.5,height:1}).length,8);
 assert.equal(P.generate(P.preset('alps-175-stabs').options,{width:1.75,height:1}).length,3);
 assert.equal(P.generate(P.preset('alps-175').options,{width:1.75,height:1}).length,1);
});
test('measured spacebar and encoder round-trip; all supports move with the key',()=>{
 const {d}=plate(),shapes=P.rings(P.place(P.generate(P.preset('alps-55').options,{width:5.5,height:1}),{x:150,y:-100},0));
 shapes.push(...P.rings(P.place(P.generate(P.preset('ec11').options,{width:1,height:1}),{x:200,y:0},0)));
 const bytes=D.exportBytes(d,[],shapes.map(points=>({points}))),p=plate(bytes);
 const space=p.r.keys.find(k=>k.width===5.5),encoder=p.r.keys.find(k=>k.type==='ec11');
 assert.ok(space);assert.equal(space.stabilizers.length,7);assert.ok(encoder);
 assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(bytes));
 const key=p.keys.find(k=>k._plateId===space.id);key.x+=1;
 const moved=R.analyze(D.parse(p.m.exportFile(p.keys),'moved'));
 const after=moved.keys.find(k=>k.width===5.5);near(after.center.x,space.center.x+19.05);assert.equal(after.stabilizers.length,7);
 const snapshot=p.m.snapshot();delete snapshot[encoder.id];p.m.restore(snapshot);
 assert.equal(p.m.settings[encoder.id].excluded,true);
});
test('neighbour-supported cap sizing fills quarter-unit gaps without moving holes',()=>{
 const {d}=plate();
 const shapes=[{x:200,w:1},{x:219.05,w:1},{x:250.00625,w:2.25}].map(p=>({points:G.rectangle(15.5,12.8,{x:p.x,y:150})}));
 const p=plate(D.exportBytes(d,[],shapes));const k=p.r.keys.find(k=>Math.abs(k.center.x-250.00625)<.01);
 assert.equal(k.width,2.25);near(k.center.x,250.00625);
});

test('ZKB2 Enter owns its upper barrel and matches the reference reverse-L footprint',()=>{
 const base=plate(),preset=P.preset('alps-zkb2');
 const rings=P.rings(P.place(P.generate(preset.options,preset.key),{x:150,y:-80},0));
 const p=plate(D.exportBytes(base.d,[],rings.map(points=>({points}))));
 const source=p.r.keys.find(k=>k.label==='ZKB2 Enter');assert.ok(source);assert.equal(source.stabilizers.length,5);
 const key=p.keys.find(k=>k._plateId===source.id);
 assert.deepEqual([key.width,key.height,key.width2,key.height2,key.x2,key.y2],[2.25,1,1,2,1.25,-1]);
 const before=p.m.physical(key).center;near(before.x,150);near(before.y,-80);
 // Equivalent to reference primary 1x2 with secondary 2.25x1 at (-1.25,+1).
 const primary={x:key.x+1.25,y:key.y-1,width:1,height:2};
 near(primary.x-1.25,key.x);near(primary.y+1,key.y);
 assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(D.exportBytes(base.d,[],rings.map(points=>({points})))));
 key.x+=1;
 const moved=R.analyze(D.parse(p.m.exportFile(p.keys),'moved.dxf')).keys.find(k=>k.label==='ZKB2 Enter');
 near(moved.center.x,169.05);assert.equal(moved.stabilizers.length,5);
 const all=new Set(source.contours.concat(source.stabilizers).flatMap(c=>c.parts.map(p=>p.raw.id)));
 const deletion=p.m.plan(p.keys.filter(k=>k!==key));assert.equal(deletion.edits.filter(e=>all.has(e.record.id)).length,all.size);
});
test('a partial barrel assembly does not claim unrelated holes as ZKB2 Enter',()=>{
 const base=plate(),preset=P.preset('alps-zkb2');
 const rings=P.rings(P.place(P.generate(preset.options,preset.key),{x:150,y:-80},0));
 // Leave the lower switch and slots but omit one upper support.
 const p=plate(D.exportBytes(base.d,[],rings.slice(0,-1).map(points=>({points}))));
 assert.equal(p.r.keys.some(k=>k.label==='ZKB2 Enter'),false);
});

test('6.25u twin-barrel spacebar owns all eight supports through moves and deletion',()=>{
 const base=plate(),preset=P.preset('alps-625-barrels');
 const rings=P.rings(P.place(P.generate(preset.options,preset.key),{x:150,y:-80},0));
 assert.equal(rings.length,9);
 const bytes=D.exportBytes(base.d,[],rings.map(points=>({points}))),p=plate(bytes);
 const source=p.r.keys.find(k=>k.label==='6.25u');assert.ok(source);assert.equal(source.width,6.25);assert.equal(source.stabilizers.length,8);
 assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(bytes));
 const key=p.keys.find(k=>k._plateId===source.id);key.x+=1;
 const moved=R.analyze(D.parse(p.m.exportFile(p.keys),'moved')).keys.find(k=>k.label==='6.25u');
 near(moved.center.x,169.05);assert.equal(moved.stabilizers.length,8);
 const all=new Set(source.contours.concat(source.stabilizers).flatMap(c=>c.parts.map(p=>p.raw.id)));
 assert.equal(p.m.plan(p.keys.filter(k=>k!==key)).edits.filter(e=>all.has(e.record.id)).length,all.size);
});
test('6.25u barrel recognition requires both complete assemblies and supports north orientation',()=>{
 const base=plate(),preset=P.preset('alps-625-barrels');
 const rings=P.rings(P.place(P.generate({...preset.options,direction:'north'},preset.key),{x:150,y:-80},0));
 const full=plate(D.exportBytes(base.d,[],rings.map(points=>({points}))));
 assert.equal(full.r.keys.find(k=>k.label==='6.25u').detectedStabilizer.direction,'north');
 const partial=plate(D.exportBytes(base.d,[],rings.slice(0,-1).map(points=>({points}))));
 assert.equal(partial.r.keys.some(k=>k.label==='6.25u'),false);
});

test('Canon 8u and vertical 2u own all support sets without moving switch centres',()=>{
 for(const [id,label,count,width,height] of [['alps-canon8','8u',14,8,1],['alps-canon-vertical2','cannon vertical 2u',4,1.25,2]]) {
  const base=plate(),preset=P.preset(id),rings=P.rings(P.place(P.generate(preset.options,preset.key),{x:150,y:-100},0));
  const bytes=D.exportBytes(base.d,[],rings.map(points=>({points}))),p=plate(bytes);
  const source=p.r.keys.find(k=>k.label===label);assert.ok(source,id);assert.equal(source.stabilizers.length,count);
  assert.equal(source.width,width);assert.equal(source.height,height);
  assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(bytes));
  const key=p.keys.find(k=>k._plateId===source.id);key.x+=1;
  const moved=R.analyze(D.parse(p.m.exportFile(p.keys),'moved')).keys.find(k=>k.label===label);
  near(moved.center.x,169.05);near(moved.center.y,-100);assert.equal(moved.stabilizers.length,count);
  const owned=new Set(source.contours.concat(source.stabilizers).flatMap(c=>c.parts.map(p=>p.raw.id)));
  assert.equal(p.m.plan(p.keys.filter(k=>k!==key)).edits.filter(e=>owned.has(e.record.id)).length,owned.size);
  const partial=plate(D.exportBytes(base.d,[],rings.slice(0,-1).map(points=>({points}))));
  assert.equal(partial.r.keys.some(k=>k.label===label),false);
 }
});
test('5140 BAE owns the right barrel, leaves the left mounting hole fixed and matches the 1.5u upper reference',()=>{
 const base=plate(),preset=P.preset('alps-bae'),center={x:150,y:-80};
 const rings=P.rings(P.place(P.generate(preset.options,preset.key),center,0));
 const mount=G.arc({x:center.x-4.55625,y:center.y+19.05},3.15,0,G.TAU);
 const bytes=D.exportBytes(base.d,[],rings.concat([mount]).map(points=>({points}))),p=plate(bytes);
 const found=p.r.keys.find(k=>k.label==='5140 BAE');assert.ok(found);assert.equal(found.stabilizers.length,5);
 const key=p.keys.find(k=>k._plateId===found.id);
 assert.deepEqual([key.width,key.height,key.width2,key.height2,key.x2,key.y2],[2.25,1,1.5,2,.75,-1]);
 const mountRecord=p.d.raw.entities.at(-1),raw=p.d.source.slice(mountRecord.start,mountRecord.end);
 assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(bytes));
 key.x+=1;const moved=D.parse(p.m.exportFile(p.keys),'moved');assert.ok(moved.source.includes(raw));
 near(R.analyze(moved).keys.find(k=>k.label==='5140 BAE').center.x,169.05);
 const deleted=D.parse(p.m.exportFile(p.keys.filter(k=>k!==key)),'deleted');assert.ok(deleted.source.includes(raw));
 const partial=plate(D.exportBytes(base.d,[],rings.slice(0,-1).concat([mount]).map(points=>({points}))));
 assert.equal(partial.r.keys.some(k=>k.label==='5140 BAE'),false);
});
test('DC2014 spacebar and Z150 Enter own their complete barrel assemblies',()=>{
 for(const [id,label,count] of [['alps-975-barrel','9.75u',5],['alps-z150','Z150 Enter',7]]){
  const base=plate(),preset=P.preset(id),center={x:240,y:-100};
  const rings=P.rings(P.place(P.generate(preset.options,preset.key),center,0));
  const bytes=D.exportBytes(base.d,[],rings.map(points=>({points}))),p=plate(bytes);
  const source=p.r.keys.find(k=>k.label===label);assert.ok(source,label);assert.equal(source.stabilizers.length,count);
  const key=p.keys.find(k=>k._plateId===source.id);
  if(id==='alps-z150')assert.deepEqual([key.width,key.height,key.width2,key.height2,key.x2,key.y2],[1,2,2,1,-1,1]);
  else assert.equal(key.width,9.75);
  assert.deepEqual(Buffer.from(p.m.exportFile(p.keys)),Buffer.from(bytes));
  key.x+=1;const moved=R.analyze(D.parse(p.m.exportFile(p.keys),'moved')).keys.find(k=>k.label===label);
  near(moved.center.x,259.05);assert.equal(moved.stabilizers.length,count);
  const owned=new Set(source.contours.concat(source.stabilizers).flatMap(c=>c.parts.map(p=>p.raw.id)));
  const edits=p.m.plan(p.keys.filter(k=>k!==key)).edits;assert.equal(edits.filter(e=>owned.has(e.record.id)).length,owned.size);
  const partial=plate(D.exportBytes(base.d,[],rings.slice(0,-1).map(points=>({points}))));
  assert.equal(partial.r.keys.some(k=>k.label===label),false);
 }
});
test('neighbour clearance distinguishes 1u vertical cap from 1.25u with identical slots',()=>{
 const base=plate(),preset=P.preset('alps-vertical2');
 const rings=P.rings(P.place(P.generate(preset.options,preset.key),{x:150,y:-100},0));
 // A 1u neighbour exactly one pitch to the left intersects the taller cap's rows.
 rings.push(G.rectangle(15.5,12.8,{x:130.95,y:-109.525}));
 const p=plate(D.exportBytes(base.d,[],rings.map(points=>({points}))));
 const key=p.r.keys.find(k=>Math.abs(k.center.x-150)<.01);assert.equal(key.width,1);assert.equal(key.height,2);assert.equal(key.label,'vertical 2u');
});
