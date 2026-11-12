const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../plate/geometry'),P=require('../plate/profiles'),O=require('../plate/overlaps');
const D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),S=require('../serial');
const poly=points=>[P.polygon(points)];
const rect=(w,h,x,y)=>poly(G.rectangle(w,h,{x,y}));
const area=multi=>multi.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(G.area(r.map(v=>({x:v[0],y:v[1]})))),0),0);
const same=(a,b)=>assert.ok(area(P.clip.difference(a,b))+area(P.clip.difference(b,a))<.001);
function source(polygons){return '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+P.rings(polygons).map((p,i)=>'0\nLWPOLYLINE\n5\n'+(i+16).toString(16)+'\n8\nCUT\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n';}
function model(polygons){let text=source(polygons),d=D.parse(text,'arbitrary.dxf'),r=R.analyze(d),m=M.create(d,r);return {text,d,r,m,keys:m.makeKeys(S.defaultKeyProps)};}
for(const [w,h] of [[14,14],[15.5,12.8]])for(const angle of [0,.37])test(`shared ${w}mm switches recover after rotation ${angle}`,()=>{
 const holes=P.clip.union(rect(w,h,0,0),rect(w,h,19.05,0),rect(19.05,2,9.525,0));
 const {text,m,r,keys}=model(P.place(holes,{x:37,y:-20},angle));
 assert.equal(r.keys.length,2);assert.ok(r.keys.every(k=>k.recovered));
 assert.equal(Buffer.from(m.exportFile(keys)).toString(),text);assert.throws(()=>m.apply(keys,{switch:'alps',stabilizer:'original'}),/Confirm/);
 m.confirm(keys);assert.equal(Buffer.from(m.exportFile(keys)).toString(),text);
 const before=structuredClone(keys);m.setAnchors(keys,false);keys[0].y+=.25;m.reconcile(before,keys);
 assert.doesNotThrow(()=>D.parse(m.exportFile(keys),'changed.dxf'));
 assert.equal(m.snapshot()[keys[0]._plateId].confirmed,true);
});
test('recovered mounting circle stays fixed when either switch is removed',()=>{
 const circle=poly(G.arc({x:9.525,y:0},3,0,G.TAU));
 const cut=P.clip.union(rect(15.5,12.8,0,0),rect(15.5,12.8,19.05,0),circle);
 const {m}=model(cut),g=m.groups[0];assert.equal(g.fixedCircles.length,1);
 assert.ok(area(P.clip.difference(circle,g.fixed))<.03);
 const removed=g.compose([[],g.portions[1]]);
 same(P.clip.intersection(removed,rect(15.5,12.8,19.05,0)),rect(15.5,12.8,19.05,0));
 assert.ok(area(P.clip.difference(circle,removed))<.03);
});
test('plate-edge notch uses material subtraction, leaving fixed material unchanged',()=>{
 const board=rect(90,60,0,0),key=rect(15.5,12.8,35,0),notch=rect(20,3,45,0);
 const outline=P.clip.difference(board,key,notch);
 const loop={points:P.rings(outline)[0]};
 const g=O.create(loop,[{center:{x:35,y:0},core:{width:15.5,height:12.8},holeAngle:0}],true);
 same(g.compose(g.portions),outline);
 const moved=P.place(g.portions[0],{x:-19.05,y:0},0),result=g.compose([moved]);
 same(P.clip.difference(result,rect(70,30,20,0)),P.clip.difference(board,rect(70,30,20,0)));
 assert.equal(area(P.clip.intersection(result,notch)),0);
});
test('unconfirmed recovered keys cannot be moved or deleted and old projects keep them fixed',()=>{
 const {m,keys,text}=model(P.clip.union(rect(14,14,0,0),rect(14,14,19.05,0),rect(19.05,2,9.525,0)));
 m.setAnchors(keys,false);let before=structuredClone(keys);keys[1].x+=1;m.reconcile(before,keys);assert.equal(keys[1].x,before[1].x);
 before=structuredClone(keys);keys.pop();m.reconcile(before,keys);assert.equal(keys.length,2);
 assert.equal(Buffer.from(m.exportFile(keys)).toString(),text);
});
test('a shared contour can span several rows and exceed a single-key bounding box',()=>{
 const cut=P.clip.union(rect(14,14,0,0),rect(14,14,19.05,0),rect(14,14,0,19.05),rect(19.05,2,9.525,0),rect(2,19.05,0,9.525));
 const {r,m}=model(cut);assert.equal(r.keys.length,3);assert.equal(m.groups.length,1);
 const g=m.groups[0];assert.ok(g.fixedChannels.length>=2);
 same(g.compose(g.portions),cut);
});
