const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),S=require('../serial');
// A reduced set of measured rounded PCB openings and neighbouring centres.
// Dense straight segments reproduce spline tessellation without shipping CAD.
function fixture(){
 const contours=require('./fixtures/rounded-pcb-compat.json');
 const entities=contours.map(c=>{const pts=[];c.points.forEach((a,i)=>{const b=c.points[(i+1)%c.points.length],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.2);for(let j=0;j<n;j++)pts.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);});
 return '0\nLWPOLYLINE\n8\nCUT\n38\n'+c.z+'\n90\n'+pts.length+'\n70\n1\n'+pts.map(p=>'10\n'+p[0]+'\n20\n'+p[1]+'\n').join('');}).join('');
 const bytes='0\nSECTION\n2\nENTITIES\n'+entities+'0\nENDSEC\n0\nEOF\n',d=D.parse(bytes,'rounded',{units:'mm'});return {bytes,d,r:R.analyze(d)};
}
test('dense rounded switch outlines support Tab and ANSI–ISO inference',()=>{
 const {d,r}=fixture();assert.equal(r.keys.find(k=>Math.abs(k.center.x+135.3093)<.01).width,1.5);
 assert.ok(r.keys.some(k=>k.label==='PCB mount ANSI-ISO'&&k.capShape.width2===2.25));
 assert.ok(R.analyze(d,{legacyRoundedPcb:true}).keys.some(k=>k.type==='unknown'));
});
test('a notched companion is recognized beside an existing space assembly with only one right modifier',()=>{
 const {d,r,bytes}=fixture(),pair=r.keys.filter(k=>k.assembly);assert.equal(pair.length,2);assert.deepEqual(pair.map(k=>k.width).sort((a,b)=>a-b),[1.25,6.25]);
 assert.equal(pair.find(k=>k.width===1.25).editable,false);
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.equal(Buffer.from(m.exportFile(keys)).toString(),bytes);
 m.setAnchors(keys,false);const before=structuredClone(keys),cap=keys.find(k=>k._plateId===pair[0].id);cap.x+=1;assert.ok(m.reconcile(before,keys)>0);assert.equal(cap.x,before.find(k=>k._plateId===cap._plateId).x);
});
