const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),R=require('../plate/recognize'),G=require('../plate/geometry'),P=require('../plate/profiles'),M=require('../plate/document'),S=require('../serial');
const {makePcbFixture}=require('./plate-fixture.cjs');
function fixture(block=false){
 const text=makePcbFixture(block);
 const d=D.parse(text,'synthetic',{units:'mm'}),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);m.setAnchors(keys,false);
 return {d,r,m,keys};
}
test('compatibility pair fits a continuous inferred bottom row and preserves original cuts',()=>{
 const {d,r,m,keys}=fixture(),pair=r.keys.filter(k=>k.assembly);
 assert.deepEqual(pair.map(k=>k.width).sort((a,b)=>a-b),[1.25,6.25]);
 const row=r.keys.filter(k=>Math.abs(k.center.y-100)<.01).sort((a,b)=>a.center.x-b.center.x);
 assert.equal(row.length,8);
 for(let i=1;i<row.length;i++)assert.ok(Math.abs(row[i].center.x-row[i-1].center.x-(row[i].width+row[i-1].width)*19.05/2)<.001);
 assert.equal(r.review.filter(i=>i.kind==='cap-overlap').length,0);
 assert.equal(pair.find(k=>k.width===6.25).stabilizers.length,2);
 assert.ok(r.unassigned.some(c=>Math.abs(G.bounds(c.points).width-30)<.001));
 assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
 assert.equal(R.analyze(d,{legacyPcb:true}).keys.filter(k=>k.assembly).length,0);
});
test('compatibility detection refuses a pair that cannot fit the inferred layout',()=>{
 const {r}=fixture(true);assert.equal(r.keys.filter(k=>k.assembly).length,0);
});
test('moving either cap moves the whole compatibility assembly; direct separation is rejected',()=>{
 const {r,m,keys}=fixture(),ids=r.keys.filter(k=>k.assembly).map(k=>k.id),pair=keys.filter(k=>ids.includes(k._plateId));
 const before=structuredClone(keys);pair[0].x+=2;m.reconcile(before,keys);
 for(const k of pair)assert.ok(Math.abs(k.x-before.find(b=>b._plateId===k._plateId).x-2)<1e-6);
 assert.doesNotThrow(()=>m.exportFile(keys));
 pair[1].x+=1;assert.throws(()=>m.exportFile(keys),/relative positions/);
});
test('an anchored companion blocks assembly movement and partial deletion',()=>{
 const {r,m,keys}=fixture(),ids=r.keys.filter(k=>k.assembly).map(k=>k.id),pair=keys.filter(k=>ids.includes(k._plateId));
 m.setAnchors([pair[1]],true);let before=structuredClone(keys);pair[0].x+=1;assert.ok(m.reconcile(before,keys)>0);
 assert.equal(pair[0].x,before.find(k=>k._plateId===pair[0]._plateId).x);
 before=structuredClone(keys);keys.splice(keys.indexOf(pair[0]),1);m.reconcile(before,keys);assert.equal(keys.filter(k=>ids.includes(k._plateId)).length,2);
});
test('deleting a free assembly removes both caps and resizing keeps their stems',()=>{
 const {r,m,keys}=fixture(),ids=r.keys.filter(k=>k.assembly).map(k=>k.id),pair=keys.filter(k=>ids.includes(k._plateId));
 let before=structuredClone(keys);pair[0].width+=.25;m.reconcile(before,keys);assert.doesNotThrow(()=>m.exportFile(keys));
 before=structuredClone(keys);keys.splice(keys.indexOf(pair[0]),1);m.reconcile(before,keys);assert.equal(keys.filter(k=>ids.includes(k._plateId)).length,0);assert.doesNotThrow(()=>m.exportFile(keys));
});
test('rotating the companion rotates both caps as a rigid assembly',()=>{
 const {r,m,keys}=fixture(),ids=r.keys.filter(k=>k.assembly).map(k=>k.id),pair=keys.filter(k=>ids.includes(k._plateId));
 const before=structuredClone(keys);pair[0].rotation_angle=15;m.reconcile(before,keys);
 assert.ok(Math.abs(pair[1].rotation_angle-15)<1e-10);assert.doesNotThrow(()=>m.exportFile(keys));
});
test('wide PCB windows use neighbouring pitch rather than window width for cap size',()=>{
 for(const width of [2,2.25,2.75]){
  const rect=(w,h,x,y)=>P.polygon(G.rectangle(w,h,{x,y})),cx=250,cy=100;
  const rings=P.rings(P.union([rect(35,14,cx,cy),rect(8,16,cx-11.938,cy+1),rect(8,16,cx+11.938,cy+1)]));
  rings.push(G.rectangle(14,14,{x:cx-(width+1)*19.05/2,y:cy}));
  const src='0\nSECTION\n2\nENTITIES\n'+rings.map(p=>'0\nLWPOLYLINE\n8\nCUT\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n';
  const r=R.analyze(D.parse(src,'arbitrary name',{units:'mm'}));
  assert.equal(r.keys.find(k=>Math.abs(k.center.x-cx)<.01).width,width);
 }
});
test('wider companion and three-position modifier form a linked spacebar pair without overlaps',()=>{
 const {makePcbFixture}=require('./plate-fixture.cjs');
 // Expand only the right edge of the helper and both sides of the next slot.
 const source=makePcbFixture(),base=D.parse(source,'base',{units:'mm'});
 const rings=base.contours.map(c=>{const b=G.bounds(c.points);return c.points.map(p=>{
  let x=p.x;if(Math.abs(b.cx-321.4375)<.01&&b.height>15&&x>328.4374)x+=2.38125;
  if(Math.abs(b.cx-(250+5*19.05-1.190625))<.01)x+=x>b.cx?2.38125:0;
  return {x,y:p.y};});});
 const text='0\nSECTION\n2\nENTITIES\n'+rings.map(p=>'0\nLWPOLYLINE\n8\nCUT\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n';
 const d=D.parse(text,'wide',{units:'mm'}),r=R.analyze(d),pair=r.keys.filter(k=>k.assembly);
 assert.equal(pair.length,2);assert.ok(r.keys.some(k=>k.label==='1.25u bottom row larger variant'&&k.width===1.25));
 assert.equal(r.review.filter(x=>x.kind==='cap-overlap').length,0);
 const m=M.create(d,r);assert.equal(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))).toString(),text);
 const preset=P.preset('mx-bottom125-large');assert.equal(preset.key.width,1.25);assert.equal(P.generate(preset.options,preset.key).length,1);
});

test('fixed ISO PCB supports are classified without unlocking source geometry',()=>{
 const rings=[G.rectangle(14,14,{x:250,y:100}),G.rectangle(14,14,{x:223.80625,y:109.525}),G.rectangle(14,14,{x:228.56875,y:90.475}),G.rectangle(15,7,{x:248.5,y:88.062}),G.rectangle(15,7,{x:248.5,y:111.938})];
 const src='0\nSECTION\n2\nENTITIES\n'+rings.map(p=>'0\nLWPOLYLINE\n8\nCUT\n38\n1\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n';
 const d=D.parse(src,'fixed ISO',{units:'mm'}),r=R.analyze(d),k=r.keys.find(k=>Math.abs(k.center.x-250)<.01);
 assert.equal(k.label,'ISO PCB mount');assert.equal(k.stabilizers.length,2);assert.equal(k.editable,false);assert.equal(k.height,2);
 const m=M.create(d,r);assert.deepEqual(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))),Buffer.from(src));
 assert.equal(R.analyze(d,{legacyReadOnlyPcb:true}).keys.find(k=>Math.abs(k.center.x-250)<.01).stabilizers.length,0);
});
test('paired PCB presets have explicit names and independent cap dimensions',()=>{
 for(const [id,label,width] of [['mx-space625-7','6.25u-7u',6.25],['mx-companion125-7','1.25u with 7u mount',1.25]]){
  assert.equal(P.mxPresets.find(p=>p.id===id).label,label);const p=P.preset(id);assert.equal(p.key.width,width);assert.ok(P.generate(p.options,p.key).length);
 }
});
