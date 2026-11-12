const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),R=require('../plate/recognize'),G=require('../plate/geometry'),P=require('../plate/profiles'),M=require('../plate/document'),S=require('../serial');
const families=require('../plate/switch-families'),{makeFixture}=require('./plate-fixture.cjs');
const at=(parts,x=250,y=100,a=0)=>P.rings(P.place(parts.map(P.polygon),{x,y},a));
const from=parts=>D.parse(D.exportBytes(D.parse(makeFixture()),[],parts.map(points=>({points}))));
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function unchanged(d,r){const m=M.create(d,r);assert.deepEqual(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))),Buffer.from(D.exportBytes(d)));}
function mixedLoop(branch=false){
 const points=G.rectangle(14,14),entities=[];
 points.forEach((p,i)=>{const q=points[(i+1)%4];entities.push([0,'LINE',8,i%2?'B':'A',10,p.x,20,p.y,11,q.x,21,q.y].join('\n'));});
 if(branch)entities.push([0,'LINE',8,'C',10,points[0].x,20,points[0].y,11,-20,21,-20].join('\n'));
 return '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+entities.join('\n')+'\n0\nENDSEC\n0\nEOF\n';
}
test('mixed-layer closed openings join without changing original entities or layer filtering',()=>{
 const source=mixedLoop(),d=D.parse(source),r=R.analyze(d);
 assert.equal(d.contours.length,1);assert.equal(d.open.length,0);assert.equal(r.keys.length,1);
 assert.deepEqual(new Set(d.contours[0].parts.map(p=>p.layer)),new Set(['A','B']));
 assert.equal(R.analyze(d,{layer:'A'}).keys.length,0);unchanged(d,r);
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps),before=structuredClone(keys);m.settings[keys[0]._plateId].anchor=null;keys[0].x+=1;m.reconcile(before,keys);
 const moved=D.parse(m.exportFile(keys));assert.deepEqual(moved.primitives.map(p=>p.layer),d.primitives.map(p=>p.layer));
 near(R.analyze(moved).keys[0].center.x,19.05);
 assert.equal(D.parse(mixedLoop(true)).contours.length,0,'branched junctions must remain unresolved');
 const old=D.parse(source,'old',{legacyAssembly:true});assert.equal(old.recognitionVersion,4);assert.equal(old.contours.length,0);
});
test('dense collinear CAD tessellation does not hide PCB compatibility windows',()=>{
 for(const width of [2,2.25,2.75]){
  const rings=at(P.rings(P.pcbCompatibility(width)),250,100).map(ring=>ring.flatMap((p,i)=>{
   const q=ring[(i+1)%ring.length];return Array.from({length:30},(_,n)=>({x:p.x+(q.x-p.x)*n/30,y:p.y+(q.y-p.y)*n/30}));
  }));
  const d=from(rings),r=R.analyze(d),k=r.keys.find(k=>k.label===width+'u PCB mount');assert.ok(k);near(k.center.x,250);near(k.center.y,100);unchanged(d,r);
 }
});
test('short-wire plate openings use row spacing for cap width and retain vertical openings',()=>{
 const f=families.find(f=>f.id==='mx-plate-option2');
 for(const width of [2,2.25,2.75]){
  const parts=at(f.parts);parts.push(...at([G.rectangle(14,14)],250+(width+1)*19.05/2,100),...at([G.rectangle(14,14)],250+(width+3)*19.05/2,100));
  const d=from(parts),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id);assert.equal(k.width,width);near(k.center.x,250);unchanged(d,r);
 }
 for(const angle of [Math.PI/2,3*Math.PI/2]){
  const d=from(at(f.parts,250,100,angle)),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id);
  assert.deepEqual([k.width,k.height,k.capAngle],[1,2,0]);near(k.center.x,250);near(k.center.y,100);unchanged(d,r);
 }
});
test('option 2 spacebar owns exactly its three rectangles and excludes adjacent holes',()=>{
 const f=families.find(f=>f.id==='mx-space625-option2'),d=from([...at(f.parts),...at([G.rectangle(3,2)],250,115)]),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id);
 assert.equal(k.width,6.25);assert.equal(k.stabilizers.length,2);assert.ok(r.unassigned.some(c=>Math.abs(G.bounds(c.points).cy-115)<.001));unchanged(d,r);
});
test('ANSI-ISO variants retain the same L cap and belong to the PCB menu',()=>{
 const f=families.find(f=>f.id==='mx-ansi-iso');assert.equal(f.mount,'pcb');
 for(const parts of [f.parts,...f.variants]){
  const d=from(at(parts)),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id);assert.ok(k);assert.deepEqual(k.capShape,f.capShape);unchanged(d,r);
 }
});
test('interior modifier size requires independent agreement from both neighbours',()=>{
 for(const rightWidth of [1,1.25]){
  const rings=[...at([G.rectangle(14,14)],250,100),...at([G.rectangle(14,14)],250-1.25*19.05,100),...at([G.rectangle(14,14)],250+rightWidth*1.25*19.05,100)];
  const d=from(rings),r=R.analyze(d),k=r.keys.find(k=>Math.abs(k.center.x-250)<.001);
  assert.equal(k.width,rightWidth===1?1.5:1);unchanged(d,r);
 }
});
