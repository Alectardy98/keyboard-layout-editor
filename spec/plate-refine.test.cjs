const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),R=require('../plate/recognize'),G=require('../plate/geometry'),P=require('../plate/profiles'),M=require('../plate/document'),S=require('../serial'),F=require('../plate/refine');
const families=require('../plate/switch-families'),{makeFixture}=require('./plate-fixture.cjs');
const at=(rings,x,y)=>rings.map(r=>r.map(p=>({x:p.x+x,y:p.y+y})));
const from=rings=>D.parse(D.exportBytes(D.parse(makeFixture()),[],rings.map(points=>({points}))));
function unchanged(d,r){const m=M.create(d,r);assert.deepEqual(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))),Buffer.from(D.exportBytes(d)));}
test('duplicate partial LINE does not hide a closed opening or lose source entities',()=>{
 const edges=[[0,0,14,0],[14,0,14,14],[14,14,0,14],[0,14,0,0],[0,0,.075,0]];
 const source='0\nSECTION\n2\nENTITIES\n'+edges.map(([x,y,a,b])=>`0\nLINE\n8\nCUT\n10\n${x}\n20\n${y}\n11\n${a}\n21\n${b}\n`).join('')+'0\nENDSEC\n0\nEOF\n';
 const d=D.parse(source,'duplicate',{units:'mm'}),r=R.analyze(d);
 assert.equal(r.keys.length,1);assert.equal(d.contours[0].parts.length,5);unchanged(d,r);
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps),before=structuredClone(keys);m.setAnchors(keys,false);keys[0].x+=1;m.reconcile(before,keys);
 const moved=D.parse(m.exportFile(keys),'moved',{units:'mm'});assert.equal(moved.primitives.length,5);assert.ok(Math.abs(R.analyze(moved).keys[0].center.x-26.05)<.001);
 assert.equal(D.parse(source,'old',{units:'mm',legacyRefine:true}).contours.length,0);
 const branch=source.replace('11\n0.075\n21\n0\n','11\n-2\n21\n-2\n');assert.equal(D.parse(branch,'branch',{units:'mm'}).contours.length,0);
});
test('Topre 6.25u support ownership and modifier inference require both rows of evidence',()=>{
 const f=families.find(f=>f.id==='topre-6.25'),one=families.find(f=>f.id==='topre-1');assert.ok(f);
 const rings=at(f.parts,250,100);
 for(const n of [-5,-3.75,3.75,5])rings.push(...at(one.parts,250+n*19.05,100));
 const d=from(rings),r=R.analyze(d),space=r.keys.find(k=>Math.abs(k.center.x-250)<.01&&Math.abs(k.center.y-100)<.01);
 assert.equal(space.width,6.25);assert.equal(space.stabilizers.length,2);
 assert.equal(r.keys.filter(k=>k.type==='topre'&&k.width===1.25).length,4);unchanged(d,r);
});
test('all new Topre size presets preserve their housing size and generate supports',()=>{
 for(const f of families.filter(f=>f.type==='topre'&&f.presetOnly)){
  const p=P.preset(f.id);assert.equal(p.key.width,f.width);assert.equal(P.generate(p.options,p.key).length,f.parts.length);
 }
});
test('narrow repeated reliefs are flagged instead of being promoted on a known MX plate',()=>{
 const rings=[];for(let i=0;i<5;i++)rings.push(...at([G.rectangle(14,14)],100+i*19.05,100));
 for(let i=0;i<3;i++)rings.push(...at([G.rectangle(10.575,14)],110+i*19.05,130));
 const d=from(rings),r=R.analyze(d);assert.equal(r.keys.filter(k=>k.type==='unknown').length,0);
 assert.equal(r.review.filter(i=>i.kind==='unsupported-candidate').length,3);unchanged(d,r);
 assert.ok(R.analyze(d,{legacyRefine:true}).keys.some(k=>k.type==='unknown'));
});
test('overlap checks respect the missing corner of an ISO cap',()=>{
 const a={width:1.25,height:2,capAngle:0,center:{x:0,y:0},capShape:{width2:1.5,height2:1,x2:-.25,y2:0}};
 const b={width:1,height:1,capAngle:0,center:{x:-21.43125,y:-9.525}};
 assert.equal(F.capPolygons(a).some(p=>F.capPolygons(b).some(q=>F.intersects(p,q))),false);
 b.center.x+=1;assert.equal(F.capPolygons(a).some(p=>F.capPolygons(b).some(q=>F.intersects(p,q))),true);
});
test('ambiguous short-wire cap and true cap overlap are returned as explicit review items',()=>{
 const d=from([...at(P.rings(P.generate({switch:'mx',stabilizer:'mx',mount:'plate',mxPattern:'legacy'},{width:2,height:1})),250,100),...at([G.rectangle(14,14)],300,100),...at([G.rectangle(14,14)],317,100)]),r=R.analyze(d);
 assert.ok(r.review.some(i=>i.kind==='cap-overlap'));assert.ok(r.review.some(i=>i.kind==='cap-size'));unchanged(d,r);
});
test('6u continuous clip footprint is recognized with its alternate stem opening',()=>{
 const p=P.preset('mx-6-plate-compat'),d=from(at(P.rings(P.union(P.generate(p.options,p.key))),250,100)),r=R.analyze(d),k=r.keys.find(k=>k.width===6);
 assert.ok(k);assert.equal(k.detectedStabilizer.family,'mx-plate');assert.equal(k.detectedStabilizer.spacing,95.25);unchanged(d,r);
});
test('ambiguous Topre supports stay unattached when modifier spacing does not choose a cap',()=>{
 const f=families.find(f=>f.id==='topre-6.25'),one=families.find(f=>f.id==='topre-1'),rings=at(f.parts,250,100);
 for(let i=0;i<4;i++)rings.push(...at(one.parts,150+i*19.05,140));
 const d=from(rings),r=R.analyze(d);assert.ok(r.review.some(i=>i.kind==='stabilizers'));assert.equal(r.keys.find(k=>Math.abs(k.center.x-250)<.01&&Math.abs(k.center.y-100)<.01).stabilizers.length,0);unchanged(d,r);
});

test('contradictory neighbouring widths are flagged rather than resolved by the smaller cap',()=>{
 const key=(id,x,width)=>({id,center:{x,y:100},type:'mx',width,height:1,capAngle:0,holeAngle:0,contours:[],stabilizers:[]});
 const keys=[key('key-001',250,2),key('key-002',250-1.5*19.05,1),key('key-003',250+1.875*19.05,1)];
 const review=F.run({contours:[]},keys,{});
 assert.ok(review.some(i=>i.kind==='cap-size'&&i.message.includes('different cap widths')));assert.equal(keys[0].width,2);
});

test('wide Topre supports identify a 7u WKL row without filling blocker gaps',()=>{
 const one=families.find(f=>f.id==='topre-1');
 const rings=at(one.parts,250,100);
 for(const n of [-6.75,-4.25,4.25,6.75])rings.push(...at(one.parts,250+n*19.05,100));
 for(const side of [-1,1])rings.push(G.rectangle(13.6,13.9,{x:250+side*57.15,y:100}));
 const d=from(rings),r=R.analyze(d),space=r.keys.find(k=>Math.abs(k.center.x-250)<.01&&Math.abs(k.center.y-100)<.01);
 assert.equal(space.width,7);assert.equal(space.stabilizers.length,2);
 for(const side of [-1,1])assert.equal(r.keys.find(k=>Math.abs(k.center.x-(250+side*4.25*19.05))<.01).width,1.5);
 unchanged(d,r);
 assert.equal(R.analyze(d,{legacyReadOnlyPcb:true}).keys.find(k=>Math.abs(k.center.x-250)<.01&&Math.abs(k.center.y-100)<.01).stabilizers.length,0);
 const missing=from(rings.slice(0,-1));assert.equal(R.analyze(missing).keys.find(k=>Math.abs(k.center.x-250)<.01&&Math.abs(k.center.y-100)<.01).stabilizers.length,0);
});
