const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),R=require('../plate/recognize'),P=require('../plate/profiles'),G=require('../plate/geometry'),M=require('../plate/document'),S=require('../serial');
const assemblies=require('../plate/measured').alpsSupportAssemblies;
function fixture(pattern,angle=0,missing=false){
 const parts=[...Array.from({length:3},(_,i)=>pattern.core.map(p=>({x:p.x-180,y:p.y+50*i}))),pattern.core,...pattern.parts.slice(0,missing?-1:undefined),G.rectangle(2,2,{x:65,y:12})];
 const entities=parts.map(points=>'0\nLWPOLYLINE\n8\nCUT\n90\n'+points.length+'\n70\n1\n'+points.map(p=>{p=G.rotate(p,angle);return '10\n'+(p.x+230)+'\n20\n'+(p.y+130)+'\n';}).join('')).join('');
 return '0\nSECTION\n2\nENTITIES\n'+entities+'0\nENDSEC\n0\nEOF\n';
}
for(const pattern of assemblies){
 test(pattern.id+' recognizes complete supports after translation and rotation without source changes',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,.37]){
   const text=fixture(pattern,angle),d=D.parse(text,'unrelated-name.dxf',{units:'mm'}),r=R.analyze(d),key=r.keys.find(k=>k.detectedStabilizer?.family===pattern.id);
   assert.ok(key,String(angle));assert.equal(key.stabilizers.length,pattern.parts.length);assert.equal(key.width,pattern.width);assert.equal(key.height,pattern.height);
   assert.equal(P.inferComponents(key).options.stabilizer,pattern.id);assert.equal(key.type,'alps');
   const model=M.create(d,r),keys=model.makeKeys(S.defaultKeyProps);assert.equal(Buffer.from(model.exportFile(keys)).toString(),text);
   const editable=keys.find(k=>k._plateId===key.id);model.setAnchors([editable],false);const start=model.physical(editable).center,before=structuredClone(keys);editable.x+=.25;model.reconcile(before,keys);
   const finish=model.physical(editable).center,dx=finish.x-start.x,dy=finish.y-start.y;assert.ok(Math.abs(Math.hypot(dx,dy)-4.7625)<.0001);
   const out=D.parse(Buffer.from(model.exportFile(keys)).toString(),'moved',{units:'mm'});
   assert.equal(out.contours.length,d.contours.length);
   for(const c of [key.contours[0],...key.stabilizers]){
    const center=G.bounds(c.points),target={x:center.cx+dx,y:center.cy+dy};
    assert.ok(out.contours.some(q=>{const b=G.bounds(q.points);return G.distance({x:b.cx,y:b.cy},target)<.005;}),'support follows the key');
   }
   const fixed=G.bounds(d.contours.at(-1).points);assert.ok(out.contours.some(q=>{const b=G.bounds(q.points);return G.distance({x:b.cx,y:b.cy},{x:fixed.cx,y:fixed.cy})<.005;}),'unrelated hole stays fixed');
  }
 });
 test(pattern.id+' requires every support and preserves legacy interpretation',()=>{
  assert.ok(!R.analyze(D.parse(fixture(pattern,0,true),'partial',{units:'mm'})).keys.some(k=>k.detectedStabilizer?.family===pattern.id));
  const d=D.parse(fixture(pattern),'old',{units:'mm',legacyAlpsAssemblies:true});assert.equal(d.recognitionVersion,11);
  assert.ok(!R.analyze(d,{legacyAlpsAssemblies:true}).keys.some(k=>k.detectedStabilizer?.family===pattern.id));
 });
 test(pattern.id+' generates all supports and flips the complete pattern',()=>{
  const p=P.preset(pattern.id),south=P.stabilizers(p.options,p.key),north=P.stabilizers({...p.options,direction:'north'},p.key);
  assert.equal(south.length,pattern.parts.length);assert.equal(north.length,south.length);
  for(let i=0;i<south.length;i++){const a=G.bounds(P.rings([south[i]])[0]),b=G.bounds(P.rings([north[i]])[0]);assert.ok(Math.abs(a.cx+b.cx)<.00001&&Math.abs(a.cy+b.cy)<.00001);}
 });
}
