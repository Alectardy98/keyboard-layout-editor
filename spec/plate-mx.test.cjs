const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../plate/profiles'),D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),G=require('../plate/geometry'),S=require('../serial'),Measured=require('../plate/measured');
const {makeFixture}=require('./plate-fixture.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function fromShapes(shapes){const d=D.parse(makeFixture());return D.parse(D.exportBytes(d,[],shapes.map(points=>({points}))),'mx.dxf');}
function at(shape,x,y,angle=0){return P.rings(P.place(shape,{x,y},angle));}
test('all MX presets generate finite contours and retain their cap dimensions',()=>{
 assert.equal(P.mxPresets.length,29);
 for(const item of P.mxPresets){const p=P.preset(item.id),shapes=P.generate(p.options,p.key);
  assert.ok(shapes.length);assert.equal(p.key.width*4%1,0);
  for(const ring of P.rings(shapes)){assert.ok(Math.abs(G.area(ring))>0);for(const v of ring)assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));}
 }
 const iso=P.preset('mx-iso-plate');assert.deepEqual([iso.key.width,iso.key.height,iso.key.width2,iso.key.height2,iso.key.x2],[1.25,2,1.5,1,-.25]);
 const stepped=P.preset('mx-stepped');assert.equal(stepped.key.width,1.25);assert.equal(stepped.key.width2,1.75);
});
test('Cherry clip-in template uses short-key wire access and preserves older saved profiles',()=>{
 const old={switch:'mx',stabilizer:'mx',mount:'plate'},key={width:2,height:1};
 assert.deepEqual(P.generate(old,key),P.generate({...old,mxPattern:'legacy'},key));
 assert.notDeepEqual(P.generate(old,key),P.generate({...old,mxPattern:'cherry'},key));
 const points=P.rings(P.stabilizers({...old,mxPattern:'cherry'},key)).flat(),b=G.bounds(points);
 near(b.minX,-16.1);near(b.maxX,16.1);near(b.minY,-7.97);near(b.maxY,5.53);
 assert.throws(()=>P.generate({...old,mxPattern:'not-a-template'},key),/Unknown MX/);
});
test('PCB clearance dimensions, fillets, offset and rotation are independent of the switch centre',()=>{
 const o={switch:'mx',stabilizer:'mx',mount:'pcb',pcbWidth:7,pcbHeight:16,pcbOffset:-1,pcbRadius:.55},key={width:2,height:1};
 const a=P.rings(P.stabilizers(o,key));assert.equal(a.length,2);
 for(const ring of a){const b=G.bounds(ring);near(b.width,7);near(b.height,16);near(b.cy,-1);assert.ok(ring.length>4);}
 const north=G.bounds(P.rings(P.stabilizers({...o,direction:'north'},key)).flat());near(north.cy,1);
 const vertical=G.bounds(P.rings(P.stabilizers({...o,axis:'vertical'},{width:1,height:2})).flat());near(vertical.width,16);
 for(const invalid of [{pcbWidth:2},{pcbHeight:30},{pcbOffset:NaN},{pcbRadius:2}])assert.throws(()=>P.stabilizers({...o,...invalid},key),/must be between/);
});
test('MX generated plate and PCB stabilizers round-trip at the actual switch centre',()=>{
 for(const mount of ['plate','pcb'])for(const size of [2,2.25,2.75,3,6,6.25,7,8])for(const direction of ['north','south']){
  const options={switch:'mx',stabilizer:'mx',mount,mxPattern:'cherry',direction};
  const d=fromShapes(at(P.generate(options,{width:size,height:1}),250,120)),r=R.analyze(d);
  assert.ok(r.keys.some(k=>Math.hypot(k.center.x-250,k.center.y-120)<.001),`${mount}/${size}/${direction}`);
 }
});
test('offset 6u PCB stabilizers associate without moving the switch',()=>{
 const p=P.preset('mx-6-offset-pcb'),r=R.analyze(fromShapes(at(P.generate(p.options,p.key),250,120))),key=r.keys.find(k=>Math.abs(k.center.x-250)<.001);
 assert.equal(key.width,6);assert.equal(key.stabilizers.length,2);near(key.detectedStabilizer.stemOffset,9.525);
});
test('broad MX openings are matched by geometry, keep source bytes and move as a whole',()=>{
 const shapes=at([P.polygon(Measured.mxWide2)],200,150).concat(at([P.polygon(Measured.mxWide225)],200,100),
  at([P.polygon(Measured.mxCapsMultistep)],200,50),at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),200+26.19375,50));
 const d=fromShapes(shapes),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);
 assert.equal(r.keys.find(k=>k.label==='2u PCB mount').width,2);assert.equal(r.keys.find(k=>k.label==='2.25u PCB mount').width,2.25);
 const cap=r.keys.find(k=>k.label==='Caps Multistep');assert.equal(cap.width,1.75);near(cap.center.x,200);
 assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
 m.apply(keys,{switch:'mx',stabilizer:'original'});const converted=R.analyze(D.parse(m.exportFile(keys),'converted'));
 assert.ok(converted.keys.some(k=>k.label==='Caps Multistep'&&Math.abs(k.center.x-200)<.001));
});
test('ISO requires row context; vertical numpad keys remain rectangular and own both slots',()=>{
 const shape=P.generate({switch:'mx',stabilizer:'mx',mount:'pcb',axis:'vertical',pcbHeight:16,pcbOffset:-1},{width:1,height:2});
 const parts=at(shape,250,100).concat(at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),250-21.43125,100-9.525),at(shape,350,100));
 const r=R.analyze(fromShapes(parts)),iso=r.keys.find(k=>Math.abs(k.center.x-250)<.001),numpad=r.keys.find(k=>Math.abs(k.center.x-350)<.001);
 assert.equal(iso.width,1.25);assert.equal(iso.height,2);assert.equal(iso.stabilizers.length,2);assert.equal(iso.capShape.x2,-.25);
 assert.equal(numpad.width,1);assert.equal(numpad.height,2);assert.equal(numpad.capShape,undefined);
 const used=r.keys.flatMap(k=>k.stabilizers.map(c=>c.id));assert.equal(new Set(used).size,used.length);
});
test('rounded switches retain size and reject invalid radii',()=>{
 const p=P.switchShape({switch:'mx',switchRadius:.3,extraSize:.1,switchRotation:90}),b=G.bounds(P.rings([p]).flat());near(b.width,14.1);near(b.height,14.1);
 assert.throws(()=>P.switchShape({switch:'mx',switchRadius:-1}),/corner radius/);
 assert.ok(P.switchShape({switch:'mx',switchRadius:.00001})[0].length>4);
 const shared=P.switchShape({switch:'universal',switchRotation:90,extraSize:.1});
 const bounds=G.bounds(P.rings([shared]).flat());near(bounds.width,14.1);near(bounds.height,15.6);
});
test('dual-opening PCB Shift owns both contours, moves and deletes them together',()=>{
 const p=P.preset('mx-dual275');assert.equal(p.key.width,2.75);
 const rings=at(P.generate(p.options,p.key),240,60);assert.equal(rings.length,2);
 const d=fromShapes(rings),r=R.analyze(d),k=r.keys.find(k=>k.label==='2.75u dual opening PCB mount');
 assert.ok(k);near(k.center.x,240);near(k.center.y,60);assert.equal(k.stabilizers.length,1);
 assert.equal(R.analyze(fromShapes([rings[0]])).keys.some(k=>k.label==='2.75u dual opening PCB mount'),false);
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps),key=keys.find(v=>v._plateId===k.id);
 assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
 m.apply([key],{switch:'mx',stabilizer:'original'});
 assert.ok(R.analyze(D.parse(m.exportFile(keys),'converted')).keys.some(k=>k.label==='2.75u dual opening PCB mount'));
 m.apply([key],{switch:'original',stabilizer:'original'});
 const before=structuredClone(keys);key.x+=.25;key.rotation_angle=90;m.reconcile(before,keys);
 const moved=R.analyze(D.parse(m.exportFile(keys),'moved')).keys.find(k=>k.label==='2.75u dual opening PCB mount');
 assert.ok(moved);near(G.distance(moved.center,m.physical(key).center),0);assert.equal(moved.stabilizers.length,1);
 const remaining=keys.filter(v=>v!==key),deleted=D.parse(m.exportFile(remaining),'deleted');assert.equal(deleted.contours.length,d.contours.length-2);
 assert.throws(()=>P.stabilizers(p.options,{width:2,height:1}),/requires a 2.75u/);
});
test('late PCB stabilizer discovery preserves 2.25u and 2.75u cap inference',()=>{
 for(const width of [2,2.25,2.75]){
  const center={x:220,y:100},next=center.x+(width+1)*19.05/2;
  const profile={switch:'mx',stabilizer:'mx',mount:'pcb',spacing:23.876,pcbHeight:16,pcbOffset:-1};
  const parts=at(P.generate(profile,{width,height:1}),center.x,center.y);
  for(const x of [next,next+19.05])parts.push(...at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),x,center.y));
  const d=fromShapes(parts),r=R.analyze(d),key=r.keys.find(k=>Math.abs(k.center.x-center.x)<.001&&Math.abs(k.center.y-center.y)<.001);
  assert.equal(key.width,width);assert.equal(key.stabilizers.length,2);near(key.detectedStabilizer.spacing,23.876);
  const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
 }
});
