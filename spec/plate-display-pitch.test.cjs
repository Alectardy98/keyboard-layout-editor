const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../plate/geometry'),D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),P=require('../plate/profiles'),S=require('../serial');
function from(rings){return D.parse('0\nSECTION\n2\nENTITIES\n'+rings.map(p=>'0\nLWPOLYLINE\n8\nCUT\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n','unrelated.dxf',{units:'mm'});}
test('repeated non-nominal pitch gives a coherent display without scaling source geometry or moves',()=>{
 const pitch=19.3267,rings=[];
 for(let row=0;row<3;row++)for(let col=0;col<10;col++)rings.push(G.rectangle(15.82,12.98,{x:100+(col+(row===1?(col? .5:.25):row===2?(col?.25:.125):0))*pitch,y:200-row*pitch},row===2&&col===9?.00003:0));
 const d=from(rings),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.ok(Math.abs(r.layoutPitch-pitch)<.001);
 const top=keys.filter(k=>Math.abs(m.original[k._plateId].center.y-200)<.01);for(let i=1;i<top.length;i++)assert.equal(top[i].x-top[i-1].x,1);
 assert.equal(r.keys.find(k=>Math.abs(k.center.y-(200-pitch))<.01).width,1.5);
 assert.equal(r.keys.find(k=>Math.abs(k.center.y-(200-2*pitch))<.01).width,1.25);
 assert.equal(Buffer.from(m.exportFile(keys)).toString(),d.source);
 for(let k of keys)assert.ok(G.distance(m.physical(k).center,m.original[k._plateId].center)<1e-6);
 const k=keys[4],start=m.physical(k).center,before=structuredClone(keys);k.x+=.25;m.reconcile(before,keys);assert.ok(Math.abs(m.physical(k).center.x-start.x-4.7625)<1e-6);
 assert.equal(R.analyze(d,{legacyLayoutPitch:true}).layoutPitch,19.05);
});
test('Both owns complete opposed wire pairs, but not an incomplete pair',()=>{
 const o={switch:'alps',stabilizer:'alps-default',spacing:28,holeOrientation:'both'},key={width:2,height:1};
 const rings=P.rings(P.generate(o,key)),d=from(rings),r=R.analyze(d),k=r.keys.find(k=>k.type==='alps');assert.equal(k.stabilizers.length,4);assert.equal(P.inferComponents(k).options.holeOrientation,'both');
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.equal(Buffer.from(m.exportFile(keys)).toString(),d.source);
 m.setAnchors(keys,false);const before=structuredClone(keys);keys[0].x+=.25;m.reconcile(before,keys);const moved=R.analyze(D.parse(m.exportFile(keys),'moved',{units:'mm'})).keys.find(k=>k.type==='alps');assert.equal(moved.stabilizers.length,4);
 const partial=R.analyze(from(rings.slice(0,-1))).keys.find(k=>k.type==='alps');assert.notEqual(partial.detectedStabilizer?.both,true);
});
test('Both merges symmetric supports and preserves measured dual-wire assemblies',()=>{
 const assemblies=require('../plate/measured').alpsSupportAssemblies;
 for(const a of assemblies.filter(a=>a.dualWire)){const p=P.preset(a.id);assert.deepEqual(P.generate({...p.options,holeOrientation:'both'},p.key),P.generate({...p.options,holeOrientation:'south'},p.key));}
 const o={switch:'mx',stabilizer:'mx',mount:'pcb',pcbOffset:0},key={width:2,height:1};assert.equal(P.stabilizers({...o,holeOrientation:'both'},key).length,2);
});
